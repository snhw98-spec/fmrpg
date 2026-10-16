#!/usr/bin/env python3
"""Build the game database from public EA FC rating dumps.

Usage:
  python3 build_dataset.py <fc27_players.csv> <fc26_players.csv> <out_dir>

Inputs
  fc27_players.csv  FC 27 ratings (github.com/LakshmiKanth11/EA_FC_ANALYSIS, snapshot 12 Sep 2026).
                    Current squads, attributes, positions, playstyles, birthdates.
  fc26_players.csv  FC 26 ratings (github.com/ismailoksuz/EAFC26-DataHub, Kaggle rovnez/fc-26-fifa-26-player-data).
                    Used only to enrich: potential, height/weight, contract expiry, wages, squad numbers,
                    international reputation, join dates.

Everything is deterministic: derived values use an RNG seeded from the player id.
"""
import csv, json, math, os, random, re, statistics, sys, unicodedata
from collections import Counter, defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from club_meta import CLUB_META  # noqa: E402
import competitions as C  # noqa: E402

FC27, FC26, OUT = sys.argv[1:4]
SEASON_START = date(2026, 7, 1)
SEASON_YEAR = 2026

PLAYABLE = {lg["ea_name"]: lg for lg in C.PLAYABLE_LEAGUES}
FEEDER = {lg["ea_name"]: lg for lg in C.FEEDER_LEAGUES}

# EA unlicensed names -> real names (all other names come from CLUB_META or stay as EA has them)
UNLICENSED = {"Lombardia FC": "Inter", "Milano FC": "AC Milan", "Bergamo Calcio": "Atalanta", "Latium": "Lazio"}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def to20(ea):
    """EA 1-99 -> FM-style 1-20. 95+ = 20, 80 = 16, 65 = 12, 50 = 8."""
    return int(clamp(round(1 + (ea - 25) * 19 / 70), 1, 20))


def num(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def parse_dob(s):
    d, m, y = s.split("-")
    return date(int(y), int(m), int(d))


def age_on(dob, ref=SEASON_START):
    return ref.year - dob.year - ((ref.month, ref.day) < (dob.month, dob.day))


# ------------------------------------------------------------------ load
f27 = [r for r in csv.DictReader(open(FC27, encoding="utf-8-sig")) if r["gender"] == "Men's Football"]
f26 = {r["player_id"]: r for r in csv.DictReader(open(FC26, encoding="utf-8"))}

# Map FC26 club names to FC27 club names by majority of shared players (to know who stayed put)
votes = defaultdict(Counter)
for r in f27:
    o = f26.get(r["player_id"])
    if o and o["club_name"]:
        votes[o["club_name"]][r["club"]] += 1
club26_to_27 = {}
for c26, cnt in votes.items():
    c27, n = cnt.most_common(1)[0]
    if n >= 3 and n / sum(cnt.values()) >= 0.4:
        club26_to_27[c26] = c27

# ------------------------------------------------------------------ value / wage model (fit on FC26)
def features(ovr, age, pot):
    return [1.0, ovr, ovr * ovr / 100.0, age, age * age / 100.0, max(0, pot - ovr)]


def fit(rows):
    # ordinary least squares via normal equations (no numpy dependency)
    X = [features(*r[:3]) for r in rows]
    y = [r[3] for r in rows]
    k = len(X[0])
    A = [[sum(x[i] * x[j] for x in X) for j in range(k)] for i in range(k)]
    b = [sum(x[i] * yy for x, yy in zip(X, y)) for i in range(k)]
    for i in range(k):  # Gauss-Jordan
        p = max(range(i, k), key=lambda r: abs(A[r][i]))
        A[i], A[p], b[i], b[p] = A[p], A[i], b[p], b[i]
        piv = A[i][i]
        A[i] = [v / piv for v in A[i]]
        b[i] /= piv
        for r in range(k):
            if r != i and A[r][i]:
                f = A[r][i]
                A[r] = [a - f * c for a, c in zip(A[r], A[i])]
                b[r] -= f * b[i]
    return b


val_rows = []
for o in f26.values():
    v, ov, ag, po = num(o["value_eur"]), num(o["overall"]), num(o["age"]), num(o["potential"])
    if v > 0 and ov > 0:
        val_rows.append((ov, ag, po, math.log(v)))
VAL_COEF = fit(val_rows)


def predict_value(ovr, age, pot):
    lv = sum(c * f for c, f in zip(VAL_COEF, features(ovr, age, pot)))
    if age >= 33:
        lv -= 0.25 * (age - 32)
    return math.exp(lv)


# Wage: league strength matters a lot, so model wage relative to club strength
def wage_estimate(ovr, club_strength, league_tier_mult, rng):
    base = math.exp(0.13 * (ovr - 60)) * 2500  # EUR/week at an average club
    rel = math.exp(0.10 * (club_strength - 70))
    return base * rel * league_tier_mult * rng.uniform(0.75, 1.3)


# Per-club wage curve calibrated on FC26 wages of players who stayed at the club:
# log(wage) = a_club + 0.12 * overall. Falls back to league median, then to the generic formula.
WAGE_SLOPE = 0.12
_club_a, _league_a = defaultdict(list), defaultdict(list)
for r in f27:
    o = f26.get(r["player_id"])
    if o and num(o["wage_eur"]) > 0 and club26_to_27.get(o["club_name"]) == r["club"]:
        a = math.log(num(o["wage_eur"])) - WAGE_SLOPE * num(o["overall"])
        _club_a[r["club"]].append(a)
        _league_a[r["league"]].append(a)
CLUB_A = {c: statistics.median(v) for c, v in _club_a.items() if len(v) >= 5}
LEAGUE_A = {l: statistics.median(v) for l, v in _league_a.items() if len(v) >= 20}


def calibrated_wage(ea_club, ea_league, ovr, rng):
    a = CLUB_A.get(ea_club, LEAGUE_A.get(ea_league))
    if a is None:
        return None
    return math.exp(a + WAGE_SLOPE * ovr) * rng.uniform(0.8, 1.25)


LEAGUE_WAGE_MULT = {"ENG1": 2.2, "ENG2": 0.9, "ENG3": 0.55, "ENG4": 0.45, "ITA1": 1.0, "ITA2": 0.55,
                    "ESP1": 1.1, "ESP2": 0.6, "GER1": 1.2, "GER2": 0.7}

# ------------------------------------------------------------------ leagues & clubs
leagues = {}
for lg in C.PLAYABLE_LEAGUES:
    d = {k: v for k, v in lg.items() if k != "ea_name"}
    d.update({"playable": True, "source": {"eaName": lg["ea_name"]}})
    leagues[lg["ea_name"]] = d
for lg in C.FEEDER_LEAGUES:
    d = {k: v for k, v in lg.items() if k != "ea_name"}
    d.update({"playable": False, "background": "simulate", "source": {"eaName": lg["ea_name"]}})
    leagues[lg["ea_name"]] = d
for ea, (name, country, tier) in C.BACKGROUND_LEAGUE_INFO.items():
    if ea in leagues:
        continue
    leagues[ea] = {"id": slug(country)[:3].upper() + str(tier) + "-" + slug(name)[:12], "name": name, "country": country,
                   "tier": tier, "playable": False, "background": "transferPool",
                   "source": {"eaName": ea}}
for r in f27:  # any league we didn't list
    if r["league"] not in leagues:
        leagues[r["league"]] = {"id": slug(r["league"]).upper()[:16], "name": r["league"], "country": None, "tier": 1,
                                "playable": False, "background": "transferPool", "source": {"eaName": r["league"]}}

squads = defaultdict(list)
for r in f27:
    squads[(r["club"], r["league"])].append(r)

clubs = {}
club_id_by_ea = {}
used_ids = set()
for (ea, lname), rows in squads.items():
    lg = leagues[lname]
    meta = CLUB_META.get(ea)
    name = meta[0] if meta else UNLICENSED.get(ea, ea)
    cid = slug(name)
    if cid in used_ids:
        cid = slug(name + "-" + lg["id"])
    used_ids.add(cid)
    club_id_by_ea[ea] = cid
    top = sorted((int(x["overall_rating"]) for x in rows), reverse=True)
    strength = round(statistics.mean(top[:16]), 1)
    c = {
        "id": cid, "name": name, "shortName": meta[1] if meta else name, "abbr": meta[2] if meta else None,
        "leagueId": lg["id"], "country": lg["country"],
        "strength": strength,  # mean overall of best 16 players, used for AI/odds
        "squadSize": len(rows),
        "source": {"eaName": ea},
    }
    if meta:
        c.update({"city": meta[3], "stadium": {"name": meta[4], "capacity": meta[5]}, "founded": meta[6],
                  "nickname": meta[7], "colours": {"primary": meta[8], "secondary": meta[9]},
                  "_rivalsEa": meta[10], "metaSource": "claude_knowledge_approx"})
    clubs[cid] = c

# rivals -> ids (drop rivals not in the data)
for c in clubs.values():
    ea_r = c.pop("_rivalsEa", None)
    if ea_r is not None:
        c["rivals"] = [club_id_by_ea[x] for x in ea_r if x in club_id_by_ea]
# make rivalries symmetric within playable clubs
for c in list(clubs.values()):
    for rid in c.get("rivals", []):
        other = clubs[rid]
        if "rivals" in other and c["id"] not in other["rivals"]:
            other["rivals"].append(c["id"])

# reputation 1-20 relative to the whole world, + finances (derived)
all_str = sorted(c["strength"] for c in clubs.values())


def pct(v):
    lo = sum(1 for s in all_str if s < v)
    return lo / max(1, len(all_str) - 1)


TIER_MONEY = {"ENG1": 1.0, "ENG2": 0.22, "ENG3": 0.07, "ENG4": 0.04, "ITA1": 0.45, "ITA2": 0.07,
              "ESP1": 0.5, "ESP2": 0.08, "GER1": 0.55, "GER2": 0.12}
for c in clubs.values():
    p = pct(c["strength"])
    cap_bonus = clamp(((c.get("stadium") or {}).get("capacity", 15000) - 20000) / 15000, -1, 2)
    c["reputation"] = int(clamp(round((c["strength"] - 56) * 0.68 + cap_bonus), 1, 20))
    lid = c["leagueId"]
    if lid in TIER_MONEY:
        c["finances"] = {"derived": True,
                         "ticketPriceAvgEUR": round((25 if not lid.endswith("1") else 45) * (0.8 + 0.6 * p))}

# Finances are filled in after wages are known, so revenue and wage bill stay consistent.
WAGE_TO_REVENUE = {"ENG1": 0.62, "ENG2": 1.0, "ENG3": 0.85, "ENG4": 0.75, "ITA1": 0.62, "ITA2": 0.8,
                   "ESP1": 0.6, "ESP2": 0.7, "GER1": 0.5, "GER2": 0.6}
TV_FLOOR = {"ENG1": 130e6, "ENG2": 30e6, "ENG3": 9e6, "ENG4": 5e6, "ITA1": 45e6, "ITA2": 10e6,
            "ESP1": 50e6, "ESP2": 12e6, "GER1": 45e6, "GER2": 25e6}

# ------------------------------------------------------------------ players
POS_HEIGHT = {"GK": (190, 4), "CB": (187, 4), "LB": (177, 5), "RB": (177, 5), "CDM": (181, 5), "CM": (178, 5),
              "CAM": (176, 5), "LM": (175, 5), "RM": (175, 5), "LW": (175, 5), "RW": (175, 5), "ST": (182, 6)}
DEFENSIVE = {"GK", "CB", "LB", "RB", "CDM"}
POS_NUMBERS = {"GK": [1, 13, 12, 25, 31, 30, 99], "CB": [4, 5, 6, 15, 26, 33], "LB": [3, 23, 21], "RB": [2, 22, 24],
               "CDM": [6, 4, 16, 18, 28], "CM": [8, 14, 16, 18, 20], "CAM": [10, 8, 20, 21],
               "LM": [11, 17, 27], "RM": [7, 17, 27], "LW": [11, 7, 17], "RW": [7, 11, 17], "ST": [9, 19, 10, 29]}


def build_attributes(r, rng, age, height, intl_rep):
    g = lambda k: num(r[k])  # noqa: E731
    noise = lambda sd: rng.gauss(0, sd)  # noqa: E731

    def d(proxy_ea, sd=1.5, shift=0.0):
        return int(clamp(round(to20(proxy_ea) + shift + noise(sd)), 1, 20))

    pos = r["position"]
    is_gk = pos == "GK"
    playstyles = r["playstyles"].lower()
    relentless = 2 if "relentless" in playstyles else 0

    tech = {
        "corners": d(0.6 * g("attacking_crossing") + 0.4 * g("skill_curve"), 1),
        "crossing": to20(g("attacking_crossing")),
        "dribbling": to20(g("skill_dribbling")),
        "finishing": to20(g("attacking_finishing")),
        "firstTouch": to20(g("skill_ball_control")),
        "freeKicks": to20(g("skill_fk_accuracy")),
        "heading": to20(g("attacking_heading_accuracy")),
        "longShots": to20(g("power_long_shots")),
        "longThrows": d(0.55 * g("power_strength") + 0.45 * g("power_shot_power") - 12, 3),
        "marking": to20(g("defending_awareness")),
        "passing": to20(0.6 * g("attacking_short_passing") + 0.4 * g("skill_long_passing")),
        "penalties": to20(g("mentality_penalties")),
        "tackling": to20(0.6 * g("defending_standing_tackle") + 0.4 * g("defending_sliding_tackle")),
        "technique": to20(statistics.mean([g("skill_ball_control"), g("skill_dribbling"), g("skill_curve"), g("attacking_short_passing")])),
    }
    ovr = num(r["overall_rating"])
    mental = {
        "aggression": to20(g("mentality_aggression")),
        "anticipation": to20(0.5 * g("movement_reactions") + 0.5 * max(g("mentality_interceptions"), g("mentality_positioning"))),
        "bravery": d(statistics.mean([g("mentality_aggression"), g("power_strength"), g("power_jumping")]), 2),
        "composure": to20(g("mentality_composure")),
        "concentration": d(statistics.mean([g("goalkeeping_positioning") if is_gk else g("defending_awareness") if pos in DEFENSIVE else g("mentality_positioning"), g("movement_reactions"), g("mentality_composure")]), 1.5),
        "decisions": to20(statistics.mean([g("movement_reactions"), g("mentality_vision"), g("mentality_composure")])),
        "determination": d(ovr - 6, 3, relentless),
        "flair": d(statistics.mean([num(r["skill_moves"]) * 18, g("skill_dribbling"), g("skill_curve"), g("mentality_vision")]), 2),
        "leadership": d(38 + (ovr - 60) * 0.5 + max(0, age - 22) * 2.0 + intl_rep * 3, 3),
        "offTheBall": to20(g("mentality_positioning")),
        "positioning": to20(0.5 * g("defending_awareness") + 0.5 * g("mentality_interceptions")),
        "teamwork": d(statistics.mean([g("power_stamina"), g("attacking_short_passing"), g("mentality_aggression"), ovr]), 2.5),
        "vision": to20(g("mentality_vision")),
        "workRate": d(0.6 * g("power_stamina") + 0.4 * g("mentality_aggression"), 2, relentless),
    }
    physical = {
        "acceleration": to20(g("movement_acceleration")),
        "agility": to20(g("movement_agility")),
        "balance": to20(g("movement_balance")),
        "jumpingReach": to20(g("power_jumping") + (height - 180) * 0.8),
        "naturalFitness": d(0.6 * g("power_stamina") + 0.4 * g("power_strength") - max(0, age - 30) * 2, 2),
        "pace": to20(g("movement_sprint_speed")),
        "stamina": to20(g("power_stamina")),
        "strength": to20(g("power_strength")),
    }
    if is_gk:
        gk = {
            "aerialReach": to20(0.5 * g("goalkeeping_positioning") + 0.5 * g("power_jumping") + (height - 188) * 1.2),
            "commandOfArea": d(g("goalkeeping_positioning"), 1.5),
            "communication": d(g("goalkeeping_positioning") - 4 + max(0, age - 24), 2.5),
            "eccentricity": int(clamp(round(rng.triangular(1, 20, 5)), 1, 20)),
            "handling": to20(g("goalkeeping_handling")),
            "kicking": to20(g("goalkeeping_kicking")),
            "oneOnOnes": to20(0.5 * g("goalkeeping_diving") + 0.5 * g("goalkeeping_reflexes")),
            "reflexes": to20(g("goalkeeping_reflexes")),
            "rushingOut": d(0.6 * g("goalkeeping_positioning") + 0.4 * g("movement_acceleration"), 2),
            "throwing": d(0.6 * g("goalkeeping_kicking") + 0.4 * g("goalkeeping_handling"), 2),
            "punching": d(g("goalkeeping_handling") - 6, 2.5),
        }
    else:
        gk = {k: int(clamp(round(rng.uniform(1, 4)), 1, 20)) for k in
              ["aerialReach", "commandOfArea", "communication", "eccentricity", "handling", "kicking",
               "oneOnOnes", "reflexes", "rushingOut", "throwing", "punching"]}
    return tech, mental, physical, gk


def build_hidden(r, rng, age, ovr, pot, intl_rep, n_positions):
    agg = num(r["mentality_aggression"])
    t = lambda mu, sd=3.5: int(clamp(round(rng.gauss(mu, sd)), 1, 20))  # noqa: E731
    hidden = {
        "consistency": t(8 + (ovr - 60) * 0.18 + max(0, min(age, 31) - 21) * 0.3, 3),
        "importantMatches": t(9 + intl_rep * 1.4 + (ovr - 70) * 0.1, 3.5),
        "injuryProneness": t(7 + max(0, age - 28) * 0.6, 4),
        "versatility": t(6 + n_positions * 3, 3),
        "dirtiness": t(4 + (agg - 50) * 0.12, 3),
        "adaptability": t(10, 4),
    }
    personality = {
        "professionalism": t(10.5 + max(0, age - 23) * 0.15 + (ovr - 70) * 0.05),
        "ambition": t(10 + (pot - 70) * 0.15 + (2 if age < 25 else 0)),
        "loyalty": t(10, 4),
        "pressure": t(9.5 + intl_rep * 1.2, 3.5),
        "temperament": t(13 - (agg - 60) * 0.1, 3.5),
        "sportsmanship": t(12 - (agg - 60) * 0.08, 3.5),
        "controversy": int(clamp(round(rng.choices([rng.uniform(1, 6), rng.uniform(6, 12), rng.uniform(12, 20)], [0.7, 0.24, 0.06])[0]), 1, 20)),
    }
    return hidden, personality


def potential_for(age, ovr, rng):
    if age <= 18:
        g = rng.uniform(10, 24)
    elif age <= 21:
        g = rng.uniform(5, 18)
    elif age <= 24:
        g = rng.uniform(1, 9)
    elif age <= 27:
        g = rng.uniform(0, 3)
    else:
        g = 0
    return int(clamp(round(ovr + g), ovr, 95))


players = []
club_players = defaultdict(list)
for r in f27:
    pid = int(r["player_id"])
    rng = random.Random(pid * 7919 + 17)
    o = f26.get(r["player_id"])
    dob = parse_dob(r["birthdate"])
    age = age_on(dob)
    ovr = int(r["overall_rating"])
    cid = club_id_by_ea[r["club"]]
    club = clubs[cid]
    lg = leagues[r["league"]]
    derived = []

    stayed = bool(o and club26_to_27.get(o["club_name"]) == r["club"])

    # potential
    if o and num(o["potential"]) > 0:
        pot26, ovr26 = int(num(o["potential"])), int(num(o["overall"]))
        if ovr - ovr26 > 0 and pot26 - ovr26 <= 1:
            pot = ovr  # peaked player who improved: treat as at ceiling
        else:
            pot = max(ovr, pot26 + max(0, (ovr - ovr26) - (pot26 - ovr26) // 2))
        pot = int(clamp(pot, ovr, 95))
    else:
        pot = potential_for(age, ovr, rng)
        derived.append("potential")

    # body
    if o and num(o["height_cm"]) > 0:
        height, weight = int(num(o["height_cm"])), int(num(o["weight_kg"]))
    else:
        mu, sd = POS_HEIGHT.get(r["position"], (180, 5))
        height = int(round(rng.gauss(mu, sd)))
        weight = int(round((height - 100) * rng.uniform(0.72, 0.85)))
        derived += ["heightCm", "weightKg"]

    intl_rep = int(num(o["international_reputation"])) if o and o["international_reputation"] else (
        5 if ovr >= 89 else 4 if ovr >= 85 else 3 if ovr >= 81 else 2 if ovr >= 76 else 1)
    if not (o and o["international_reputation"]):
        derived.append("internationalReputation")

    # contract
    if stayed and num(o["club_contract_valid_until_year"]) > 0:
        until = int(num(o["club_contract_valid_until_year"]))
        if until <= SEASON_YEAR:  # must have renewed to still be there
            until = SEASON_YEAR + rng.choice([1, 2, 2, 3, 4])
            derived.append("contract.expires")
        joined = o["club_joined_date"] or None
    else:
        yrs = rng.choice([1, 2] if age >= 32 else [2, 3, 4, 4, 5] if age <= 26 else [2, 3, 3, 4])
        until = SEASON_YEAR + yrs
        joined = None
        derived.append("contract.expires")
    contract_expires = f"{until}-06-30"

    # money
    if o and num(o["value_eur"]) > 0:
        value = num(o["value_eur"]) * math.exp(0.11 * (ovr - int(num(o["overall"]))))
        if age >= 30:
            value *= 0.85
        elif age <= 23 and pot - ovr >= 5:
            value *= 1.1
    else:
        value = predict_value(ovr, age, pot)
        if value > 60e6:
            value = 60e6 + (value - 60e6) * 0.35
        derived.append("valueEUR")
    lid = lg["id"]
    if stayed and num(o["wage_eur"]) > 0:
        wage = num(o["wage_eur"]) * math.exp(0.06 * (ovr - int(num(o["overall"]))))
    else:
        wage = calibrated_wage(r["club"], r["league"], ovr, rng) or wage_estimate(ovr, club["strength"], LEAGUE_WAGE_MULT.get(lid, 0.6), rng)
        derived.append("contract.wageWeeklyEUR")
    wage = int(round(clamp(wage, 500, 800000), -2))
    value = int(round(value, -4)) if value >= 1e5 else int(round(value, -3))

    alt = [p for p in r["alternate_positions"].split() if p]
    positions = {r["position"]: 20}
    for p in alt:
        positions[p] = 15

    tech, mental, physical, gk = build_attributes(r, rng, age, height, intl_rep)
    hidden, personality = build_hidden(r, rng, age, ovr, pot, intl_rep, len(positions))

    name_first, name_last = r["first_name"], r["last_name"]
    display = r["common_name"] or (f"{name_first} {name_last}".strip())

    p = {
        "id": pid,
        "name": display,
        "firstName": name_first,
        "lastName": name_last,
        "commonName": r["common_name"] or None,
        "clubId": cid,
        "nationality": r["nationality"],
        "dateOfBirth": dob.isoformat(),
        "ageAtStart": age,
        "heightCm": height,
        "weightKg": weight,
        "preferredFoot": r["preferred_foot"],
        "weakFoot": int(num(r["weak_foot"])),
        "skillMoves": int(num(r["skill_moves"])),
        "positions": positions,
        "overall": ovr,
        "potential": pot,
        "internationalReputation": intl_rep,
        "squadNumber": int(num(o["club_jersey_number"])) if stayed and num(o["club_jersey_number"]) > 0 else None,
        "contract": {"expires": contract_expires, "wageWeeklyEUR": wage, "joined": joined},
        "valueEUR": value,
        "attributes": {"technical": tech, "mental": mental, "physical": physical, "goalkeeping": gk},
        "hidden": hidden,
        "personality": personality,
        "traits": [t.strip() for t in r["playstyles"].split(",") if t.strip()],
        "eaRatings": {k: int(num(r[k])) for k in ["pace", "shooting", "passing", "dribbling", "defending", "physicality"]},
        "derivedFields": derived,
    }
    players.append(p)
    club_players[cid].append(p)

# squad number clean-up (unique per club, fill gaps)
for cid, plist in club_players.items():
    taken = set()
    for p in sorted(plist, key=lambda x: -x["overall"]):
        n = p["squadNumber"]
        if n is None or n in taken or n > 99:
            p["squadNumber"] = None
        else:
            taken.add(n)
    for p in sorted(plist, key=lambda x: -x["overall"]):
        if p["squadNumber"] is not None:
            continue
        main = next(iter(p["positions"]))
        prefs = POS_NUMBERS.get(main, []) + [n for n in range(2, 100) if n != 1]
        n = next(n for n in prefs if n not in taken and (n != 1 or main == "GK"))
        taken.add(n)
        p["squadNumber"] = n
        p["derivedFields"].append("squadNumber")

# finances (derived): revenue from wage bill and league economics
for cid, plist in club_players.items():
    c = clubs[cid]
    if "finances" not in c:
        continue
    lid = c["leagueId"]
    rng = random.Random("fin-" + cid)
    bill = sum(p["contract"]["wageWeeklyEUR"] for p in plist)
    p_rank = pct(c["strength"])
    cap = (c.get("stadium") or {}).get("capacity", 10000)
    matchday = cap * 19 * c["finances"]["ticketPriceAvgEUR"] * (0.45 + 0.5 * p_rank)
    commercial = 1.5e6 * math.exp(0.3 * (c["reputation"] - 6))
    bottom_up = TV_FLOOR[lid] * rng.uniform(1.0, 1.3) + matchday + commercial
    revenue = max(bill * 52 / (WAGE_TO_REVENUE[lid] * rng.uniform(0.9, 1.1)), bottom_up * 0.45)
    if c["strength"] >= 82:
        revenue *= 1 + (c["strength"] - 81) * 0.15  # global commercial pull of elite clubs
    c["finances"].update({
        "annualRevenueEUR": int(round(revenue, -5)),
        "wageBillWeeklyEUR": int(bill),
        "wageBudgetWeeklyEUR": int(round(bill * rng.uniform(1.0, 1.12), -3)),
        "balanceEUR": int(round(revenue * rng.uniform(-0.15, 0.35), -5)),
        "transferBudgetEUR": int(round(revenue * rng.uniform(0.04, 0.2), -5)),
    })

# ------------------------------------------------------------------ europe
def resolve(entry):
    disp, country, ea = entry[0], entry[1], entry[2]
    if ea:
        return {"name": disp, "country": country, "clubId": club_id_by_ea[ea], "inDataset": True}
    return {"name": disp, "country": country, "clubId": slug(disp), "inDataset": False,
            "approxStrength": entry[3], "note": "Not in source data: generate a squad at this strength."}


europe = {
    "season": C.SEASON["label"],
    "format": C.UEFA_FORMAT,
    "source": "uefa.com league-phase pot announcements (Aug 2026); wionews.com UCL list",
    "UCL": {"pots": [[resolve(e) for e in pot] for pot in C.UCL_2026_27]},
    "UEL": {"pots": [[resolve(e) for e in pot] for pot in C.UEL_2026_27]},
    "UECL": {"pots": [[resolve(e) for e in pot] for pot in C.UECL_2026_27]},
}

# ------------------------------------------------------------------ name pools (for regens / youth intakes)
pools = defaultdict(lambda: {"first": Counter(), "last": Counter()})
for r in f27:
    nat = r["nationality"]
    if r["first_name"]:
        pools[nat]["first"][r["first_name"].split()[0]] += 1
    if r["last_name"]:
        pools[nat]["last"][r["last_name"]] += 1
name_pools = {nat: {"first": [n for n, _ in v["first"].most_common(300)], "last": [n for n, _ in v["last"].most_common(500)]}
              for nat, v in pools.items() if sum(v["first"].values()) >= 15}

# ------------------------------------------------------------------ write
os.makedirs(OUT, exist_ok=True)
league_list = sorted(leagues.values(), key=lambda l: (not l["playable"], l.get("background") != "simulate", l["country"] or "", l["tier"]))
for l in league_list:
    l["clubIds"] = sorted(c["id"] for c in clubs.values() if c["leagueId"] == l["id"])

players.sort(key=lambda p: (p["clubId"], -p["overall"]))


def dump(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


meta = {
    "datasetVersion": "2026-10-16",
    "season": C.SEASON,
    "currency": "EUR",
    "attributeScale": "1-20 (FM style); overall/potential on EA 1-99 scale",
    "sources": {
        "fc27": "EA SPORTS FC 27 ratings via github.com/LakshmiKanth11/EA_FC_ANALYSIS (snapshot 2026-09-12)",
        "fc26": "EA SPORTS FC 26 ratings via github.com/ismailoksuz/EAFC26-DataHub (sofifa, 2025-09-19)",
        "clubMeta": "Claude general knowledge (approximate)",
        "europe": "uefa.com / wionews.com, Aug 2026",
    },
    "counts": {
        "players": len(players),
        "playablePlayers": sum(1 for p in players if clubs[p["clubId"]]["leagueId"] in {l["id"] for l in C.PLAYABLE_LEAGUES}),
        "clubs": len(clubs), "leagues": len(leagues),
    },
}
dump("meta.json", meta)
dump("leagues.json", league_list)
dump("clubs.json", sorted(clubs.values(), key=lambda c: (c["leagueId"], c["name"])))
core_league_ids = {l["id"] for l in C.PLAYABLE_LEAGUES} | {l["id"] for l in C.FEEDER_LEAGUES}
dump("players.json", [p for p in players if clubs[p["clubId"]]["leagueId"] in core_league_ids])
dump("players_world.json", [p for p in players if clubs[p["clubId"]]["leagueId"] not in core_league_ids])
dump("cups.json", C.DOMESTIC_CUPS)
dump("europe.json", europe)
dump("name_pools.json", name_pools)
print(json.dumps(meta["counts"]), "value model coef:", [round(c, 4) for c in VAL_COEF])
