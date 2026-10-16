# Game database — 2026/27

Ready-to-import JSON for the football management game. Everything is in `data/`. The build script in `scripts/` can regenerate it from the source CSVs.

## Counts

| | |
|---|---|
| Players in playable leagues + 3. Liga | 6,213 (`players.json`) |
| Rest-of-world players (transfer pool, European opponents) | 11,636 (`players_world.json`) |
| Clubs | 670 |
| Playable leagues | 10 (ENG1–4, ITA1–2, ESP1–2, GER1–2) |
| Background-simulated feeder league | 3. Liga (GER3) |
| Transfer-pool leagues | 38 |

## Sources: what's real and what's derived

**Real (from EA SPORTS FC 27, snapshot 12 Sep 2026)**: every player's name, club, nationality, date of birth, positions, overall, all 34 EA attributes, preferred foot, weak foot, skill moves and playstyles. Squads reflect the summer 2026 window.

**Real (from EA SPORTS FC 26, Sep 2025), carried forward by player ID** for ~13,000 players: potential, height, weight, international reputation, and, for players still at the same club, contract expiry, wage, squad number and join date.

**Derived** (deterministic, seeded by player ID). Each player's `derivedFields` array lists which of their fields were estimated rather than taken from source:
- FM-style 1–20 attributes are converted from EA 1–99 values (`to20`: 95→20, 80→16, 65→12, 50→8). Attributes EA doesn't have are built from proxies plus noise: bravery, concentration, determination, flair, leadership, teamwork, work rate, natural fitness, long throws, and goalkeeper communication/eccentricity/punching/throwing/rushing out.
- All `hidden` and `personality` attributes. These are invented, correlated with sensible proxies (age, reputation, aggression, etc.). The game should treat them as the starting truth.
- For players new to their club, or missing from FC 26: contract length, wage (calibrated on teammates' real FC 26 wages), squad number, potential, height/weight.
- Market values: FC 26 value rolled forward by rating change where available, otherwise a regression fitted on FC 26 values.
- Club `reputation` (1–20), `strength` and all `finances`.

**Club metadata** (full name, city, stadium, capacity, founded, nickname, colours, rivals) for the 210 playable clubs is from Claude's general knowledge, not a live source. Capacities are rounded and approximate (`metaSource: "claude_knowledge_approx"`). Background clubs have no metadata.

**Unlicensed names fixed**: EA's "Lombardia FC", "Milano FC", "Bergamo Calcio" and "Latium" are Inter, AC Milan, Atalanta and Lazio. `source.eaName` keeps the original.

**Money scale**: wages are on EA's scale, which runs well below real-world figures in Serie A in particular. Revenue is derived from the wage bill so the economy is internally consistent. If wages should look closer to reality, apply a per-league multiplier at import and scale revenue by the same factor.

## Files

### `meta.json`
Version, season (`gameStart: 2026-07-01`), currency (EUR), sources, counts.

### `leagues.json` — array
```
id            "ENG1" | "ITA2" | ...       stable key used everywhere
name, country, tier
playable      true for the 10 managed leagues
background    "simulate" (GER3: play results-only so promotion uses real clubs) | "transferPool"
teams, rounds, pointsWin
tiebreakers   ordered list, e.g. ["headToHeadPoints", "headToHeadGoalDifference", ...] (Serie A/LaLiga use head-to-head first)
promotion     {auto, to, playoff: {positions, format, places}}
relegation    {auto, to, playoff | playout, note}   to: "OUT_OF_GAME" = see Gaps
europe        {UCL: [1,2,3,4], UEL: [5], UECL: [6], cupWinnerUEL, leagueCupWinnerUECL}
squadRules, financialRules   plain-English rules to approximate (homegrown quotas, work permits, LaLiga cost limits, 50+1, etc.)
startDate, endDate, winterBreak, transferWindows
reserveTeamRule  (ESP2) B teams can't be promoted into their first team's division
clubIds       club ids in this league
```

### `clubs.json` — array
```
id, name, shortName, abbr, leagueId, country
strength      mean overall of best 16 players
reputation    1–20 (strength + stadium size)
squadSize
city, stadium {name, capacity}, founded, nickname, colours {primary, secondary}, rivals [clubIds]   (playable clubs only)
finances      {annualRevenueEUR, wageBillWeeklyEUR, wageBudgetWeeklyEUR, balanceEUR, transferBudgetEUR, ticketPriceAvgEUR, derived: true}   (playable clubs only)
source        {eaName}
```

### `players.json` / `players_world.json` — array
```
id                 EA player id (stable)
name, firstName, lastName, commonName
clubId, nationality, dateOfBirth, ageAtStart (on 2026-07-01)
heightCm, weightKg, preferredFoot, weakFoot (1–5), skillMoves (1–5)
positions          {"CM": 20, "CDM": 15}  familiarity 1–20; first key is the natural position
                   codes: GK CB LB RB CDM CM CAM LM RM LW RW ST
overall, potential EA 1–99 scale
internationalReputation 1–5
squadNumber
contract           {expires: "YYYY-06-30", wageWeeklyEUR, joined}
valueEUR
attributes
  technical        corners crossing dribbling finishing firstTouch freeKicks heading longShots longThrows marking passing penalties tackling technique
  mental           aggression anticipation bravery composure concentration decisions determination flair leadership offTheBall positioning teamwork vision workRate
  physical         acceleration agility balance jumpingReach naturalFitness pace stamina strength
  goalkeeping      aerialReach commandOfArea communication eccentricity handling kicking oneOnOnes reflexes rushingOut throwing punching
hidden             consistency importantMatches injuryProneness versatility dirtiness adaptability      (1–20)
personality        professionalism ambition loyalty pressure temperament sportsmanship controversy     (1–20)
traits             EA playstyles, "+" suffix = elite version
eaRatings          pace shooting passing dribbling defending physicality (face stats, handy for UI)
derivedFields      which fields were estimated
```

### `cups.json`
FA Cup, EFL Cup, EFL Trophy, Community Shield, Coppa Italia, Supercoppa, Copa del Rey, Supercopa, DFB-Pokal, DFL-Supercup: entrants, format and European reward.

### `europe.json`
The real 2026/27 UCL, UEL and UECL league-phase entrants by pot, plus format and UCL dates. Each team has `clubId` and `inDataset`. 21 of the 108 aren't in the data (e.g. Crvena Zvezda, Slovan Bratislava, Pafos): they carry `approxStrength` and the game should generate a squad for them. The game starts on 1 July 2026 with these entrants fixed, so qualifying rounds can be skipped for season one. From season two, entrants come from league finishes and cup winners.

### `name_pools.json`
`{nationality: {first: [...], last: [...]}}`, the most common real first and last names per nationality in the data. Use for youth intakes, regens and generated squads, so a Spanish regen gets a Spanish-sounding name.

## Gaps the game must handle

1. **Thin squads.** A few playable clubs have fewer than 22 players (Celta Fortuna 10, CE Sabadell 11, CD Eldense 13, Ascoli 17, Benevento 18, Avellino 19, Empoli 20, Ceuta/Andorra/Granada 21). Seven have fewer than two goalkeepers. At new-game, top every playable squad up to at least 22 with 2+ GKs using generated youth players (flagged `generated: true`).
2. **Relegation out of the game** (League Two → National League, Serie B → Serie C, LaLiga 2 → Primera Federación): keep relegated clubs in a background pool. Fill vacated places with generated clubs or re-admitted pool clubs. 3. Liga is real data and should be simulated in the background for the 2. Bundesliga.
3. **Cup entrants outside the data** (FA Cup non-league sides, Serie C clubs in the Coppa, Copa del Rey minnows, DFB-Pokal amateurs, EFL Trophy academy sides): generate lightweight clubs.
4. **People who aren't players**: managers, assistants, coaches, scouts, physios, chairmen, owners, sporting directors, CEOs, agents and journalists are **not** in the data. Generate them using the name pools, with personalities that drive the RPG layer. Real owners and chairmen can be typed in through the editor if wanted.
5. **Everything can be wrong at the edges.** The in-game editor must let the user fix any player, club or league field. EA's data has the usual quirks (odd ratings, the occasional player at the wrong club after late-window deals).

## Regenerating

```
python3 scripts/build_dataset.py <fc27_players.csv> <fc26_players.csv> data
```
- FC 27 CSV: `EA_FC_PLAYERS_DATASET_AND_ DASHBOARD/data/players.csv` from github.com/LakshmiKanth11/EA_FC_ANALYSIS
- FC 26 CSV: `data/players.csv` from github.com/ismailoksuz/EAFC26-DataHub

Club metadata lives in `scripts/club_meta.py`; league/cup rules and European entrants in `scripts/competitions.py`. Output is deterministic.
