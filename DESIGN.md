# DESIGN.md — Football manager RPG

Private, offline-first football management game for iPhone. OOTP-level systemic depth, FM-style tactics/match engine, and an RPG layer (relationships, conversations, promises, board politics, media) that's deeper than either.

Decisions below incorporate your answers: wage/value realism is an **editable per-league multiplier**, not baked into the import; the background world (all 49 leagues, ~670 clubs) gets **full simulation**, not a static pool; RPG interactions are **rich and frequent** by default; milestone 1's test club is **Arsenal**.

## 1. Tech stack & project layout

- **PWA**: React + TypeScript (strict) + Vite. Installable to iOS home screen, fully offline after first load (service worker precaches app shell; data lives in IndexedDB).
- **Persistence**: Dexie (IndexedDB). Multiple save slots. Export/import a save as a single JSON file (iOS can evict web storage without warning, so this is the real backup path, not a nice-to-have).
- **Simulation engine**: a pure TypeScript package with zero UI or Dexie imports — testable headlessly in Node, runnable in a Web Worker so match sim never blocks the UI thread. Deterministic: every random draw goes through a single seeded RNG (xoshiro128**), seeded per-match/per-event so results are reproducible from a seed + inputs.
- **Repo layout** (new, alongside the existing `fm-dataset/`):

```
FMRPG/
  fm-dataset/              existing data + build scripts, untouched, source of truth
  app/
    src/
      engine/              pure sim: match engine, season/competition scheduler, economy, dev/aging, RNG
      domain/              shared types (Player, Club, Person, Promise, Relationship, SaveGame, ...)
      data/                Dexie schema, first-launch importer, gap-filling (generation), repositories/queries
      rpg/                 relationship memory, conversation resolution, dressing-room/influence graph, storylines
      state/               app-level state (current save, current screen, settings) — React context + hooks
      ui/
        screens/           inbox, squad, tactics, match-day, transfers, board, stats, editor, ...
        components/
      workers/             match-sim worker, season-rollover worker
    public/
      data/                build-time copy of fm-dataset/data/*.json (see §2)
    scripts/
      sync-data.mjs        copies fm-dataset/data -> app/public/data, stamps a content hash for cache-busting
  DESIGN.md
  ROADMAP.md
```

Everything game-logic-critical lives in `engine/` and `domain/`, with no React imports, so it can be unit-tested and run in the headless balance-testing harness (§5) from plain Node/Vitest.

## 2. Data import & world generation

**Source of truth**: `fm-dataset/data/*.json`, copied verbatim into `app/public/data/` at build time (no hand-edits to the copy). On first launch, the app fetches these, and an importer writes them into Dexie tables roughly 1:1 with the JSON shapes (`leagues`, `clubs`, `players`, `cups`, `europe`), plus new tables the game needs that aren't in the source data (see §3).

Import-time gap-filling, run once against the Dexie copy (never mutates the shipped JSON):

1. **Thin squads** — any playable club under 22 players, or under 2 GKs, gets topped up with generated youth (age 16–19, low-to-moderate potential skewed by club reputation, `generated: true`), named from `name_pools.json` by the club's nationality mix.
2. **Relegated/vacant slots outside the data** (National League, Serie C, Primera Federación) — represented as lightweight generated clubs (name, city, a plausible strength band) sufficient to promote/relegate into, without full squads until promoted (then they get a generated squad on promotion, same path as regen clubs).
3. **Cup-only outside-data entrants** (FA Cup non-league, Coppa Italia Serie C sides, EFL Trophy academy sides, DFB-Pokal amateurs) — lightweight clubs generated on demand each season, not persisted as full citizens of the world.
4. **Non-player people** — every manager, assistant, coach, scout, physio, chairman, owner, sporting director, CEO, agent and journalist is generated at import: name from `name_pools.json` keyed to a plausible nationality for their role (club staff skew to the club's country; agents/journalists more mixed), personality rolled from the same hidden-attribute distributions used for players (§6), and attached to a club/agency/outlet. The in-game editor can retype any of them to a real person's name if you want.
5. **Europe's missing 21 clubs** (`inDataset: false`) get a generated squad sized/strengthed from `approxStrength`.

**Editor**: a dedicated screen (not a debug menu) to edit any player/club/person/league field, including the per-league economy multiplier (§3). This is the escape hatch for every data quirk DATA.md warns about, and it's built in milestone 1, not deferred.

## 3. Economy & the money-scale decision

Raw wages/values from the source data stay untouched in storage — they're EA's scale, and DATA.md notes Serie A in particular reads low. Rather than baking in a multiplier at import (irreversible, and a guess at the "right" number), each league gets an `economyMultiplier` field (default `1.0`) in its Dexie record, editable in the League settings panel of the editor. It's applied at the boundary wherever money is **computed or displayed**, not stored:

- Wage offers, transfer fees, release clauses, agent fees, budgets, revenue, and ticket income are all multiplied by the owning club's league multiplier at calculation time.
- Cross-league transfers use the buying club's multiplier for the fee negotiation (consistent with "what can this league actually afford").
- This also gives you a dial for tuning Serie B's financial distress or LaLiga's squad cost limit bite without touching source data.

## 4. Domain model (core entities)

Builds directly on `fm-dataset`'s shapes; new tables added for everything OOTP/FM-adjacent that isn't in the source data.

- **League** — as in `leagues.json`, plus `economyMultiplier`, current `season` pointer, standings table (computed, not stored redundantly beyond a cache).
- **Club** — as in `clubs.json`, plus `boardAgenda` (profit/trophies/youth/vanity/sell-the-club), `jobSecurity` (0–100 for the current manager), `objectives` (season target set at the preseason board meeting), `tacticalPreset` (for AI-managed clubs), `rivalryHeat` per rival (decays, spikes on derby results/incidents).
- **Player** — as in `players.json`/`players_world.json`, plus mutable-over-time fields the source data doesn't model: `form`, `fitness`, `morale`, `sharpness`, `currentInjury`, `suspension`, `developmentCurve` state, `careerStats` (season/competition splits), `history` (clubs, honours), `relationshipToManager` (see Relationship below), `promisesActive`.
- **Person** (staff/board/agent/journalist) — unified table with a `role` discriminator, `personality` (same 1–20 axes as player `personality`/`hidden` blocks: professionalism, ambition, loyalty, pressure, temperament, sportsmanship, controversy, plus role-specific traits like agent `greed`/`leakiness`, journalist `bias`/`sensationalism`), `employer` (club/agency/outlet), `relationshipToManager`.
- **Relationship** — the memory primitive, one per (manager, person) pair: a running `trust`/`respect` score, and an append-only `log` of significant interactions (promise kept/broken, conversation outcome, selection decisions affecting them, press comments about them) each tagged with a decay weight so old slights fade but big ones (a broken promise, a public call-out) persist longer. Every RPG system reads/writes through this log rather than a single opaque number, per your brief.
- **Promise** — `type` (playing time / signing / contract renewal / squad role / "you won't be sold" etc.), `madeTo`, `terms`, `deadline`, `status` (kept/broken/pending), and a resolution hook that writes consequences into the relevant Relationship logs and into dressing-room unrest when broken.
- **DressingRoom** (per club) — derived, not stored as its own heavy object: hierarchy/leadership computed from `leadership` + tenure + reputation, cliques computed from nationality/age/tenure clustering, an influence graph (who moves whose morale) used when unrest or a storyline needs to "spread."
- **Conversation** — a definition (context, available tones, the other party's read on your tone given their personality + relationship) and an outcome resolver; conversations are data-driven so new ones can be added without new engine code.
- **Storyline** — a running instance of a dynamic event (contract rebel, personal-life issue, title-race pressure, boardroom struggle) with state and a set of trigger/advance/resolve rules keyed off the systems above, not a scripted cutscene.
- **ManagerCareer** — your persistent record: reputation, attribute growth (man-management, tactics, media handling, youth development), employment history, staff who've followed you between clubs, job offers queue.
- **SaveGame** — slot metadata, current date, RNG seed, pointer into all of the above; export/import serializes this whole graph to/from a single JSON file.
- **Match** — schedule entry + (once played) the full event log for matches the engine simulated in detail, or just a result+boxscore for fast-simmed background matches (§5).
- **SeasonHistory** — append-only per-season archive (final tables, stats leaders, awards, transfers, honours) — this is what powers "persistent history of every season" and long-term stats.

## 5. Match simulation

**Why "full simulation everywhere" is feasible on a phone**: a season across 49 leagues is tens of thousands of matches. Full minute-by-minute event generation for all of them would be too slow and pointless (you'll never read it). So there are two tiers sharing one underlying strength model:

- **Full event simulation** — used for any match you're watching or managing (your club, always; any other match you choose to spectate). Possession-phase model: each phase resolves to a buildup outcome (progress / turnover / foul / set piece) weighted by the two teams' relevant attributes (passing/vision/decisions vs. pressing/tackling/positioning, adjusted by tactics/roles/instructions and fatigue/form/morale), phases that reach the final third roll a chance with an xG value from shot location/type/presure and the finisher's finishing/composure/technique, and separately-resolved fouls/cards/injuries/set pieces. This is the event log that drives the three commentary modes (full text, key moments, instant) and in-match management (tactical changes, shouts, subs, half-time talks whose effect depends on personality).
- **Fast result simulation** — used for every other match league-wide, same match day. Uses the same team-strength/xG distributions (derived from the same attribute aggregates as the full engine, calibrated together — not a separate cruder model) to draw a scoreline and a compact boxscore (shots, possession%, cards, scorers, an injury roll) without generating a full event log. This is what makes simulating all 670 clubs every matchday cheap enough to run instantly on-device, while still producing self-consistent stats for background leagues' tables and your scouting reports.

**Calibration harness** (`engine/sim` + a Node script, not shipped to the app): runs 10+ simulated seasons headlessly across the real league set and checks goals/game, home/draw/away split, champion/relegated points totals, and scoring distribution against real-world benchmarks per league (Premier League and Serie A shouldn't have the same shape). This gets built and tuned in milestone 1 before anything else is trusted.

**Tactics**: formation + per-role instructions + team instructions (tempo, width, pressing line, etc.) + set-piece takers + opposition instructions, all feeding the phase-resolution weights above — not cosmetic.

## 6. RPG layer

This is the system the rest of the game serves.

- **Relationships with memory** (§4 `Relationship`) — every interaction that matters gets logged with a decay weight; current standing is a function over the log, not a single mutable int. Conversations and events read the log to decide how someone reacts *to your history with them specifically*, not just a global mood.
- **Conversations** — tone selection (calm/assertive/passionate/joking/honest/evasive) is matched against the other person's personality (e.g., a high-`temperament`/low-`professionalism` player reads "assertive" as confrontational; a high-`ambition` player responds to "honest" about their path to the first team) and your running relationship, producing an outcome that's itself logged — so a conversation today shapes how the next one lands.
- **Promises** — tracked with explicit terms and deadlines; breaking one doesn't just dent one relationship, it can leak to the press (journalist-dependent — a high-sensationalism journalist is more likely to run it), spread unrest through the dressing-room influence graph if the wronged player is a leader/hub, and dent your manager reputation.
- **Dressing room** — hierarchy from leadership/tenure/reputation; cliques from nationality/age/tenure clustering; captaincy is a real slot with its own effects on unrest propagation and team talks. Unrest spreads along the influence graph rather than applying uniformly to the squad.
- **Board & directors** — each club has an `boardAgenda`; the sporting director has their own personality and can push signings or sell players behind your back depending on how much autonomy your reputation/results have earned you. Board meetings negotiate budget/facilities/objectives explicitly (not a hidden formula). `jobSecurity` is visible, moves with results vs. objectives, and interference scales as it drops. Country-specific rules from `leagues.json` (50+1 in Germany, LaLiga's squad cost limit blocking registrations, Serie B financial distress) are read directly from that data, not hardcoded per-league exceptions.
- **Agents** — personality axes (greed, loyalty-to-client, manipulativeness, leakiness) drive how they negotiate, whether they shop a player around behind your back, and how much they inflate demands; they're a real party in every negotiation, not a fee-calculation step.
- **Media & fans** — individual journalists (bias, sensationalism) remember what you've said to them and in press conferences; fan sentiment (including ultras) reacts to results/signings/selection/your public statements; rivalries from `clubs.json` amplify derby-week stakes.
- **Manager career** — reputation and four growable attributes (man-management, tactics, media handling, youth development) that gate what you can credibly do (a low man-management rating makes assertive conversations backfire more often); job offers arrive based on reputation + results; staff can choose to follow you to a new club based on their own relationship with you.
- **Dynamic storylines** — not scripted: a `Storyline` instance is created when trigger conditions in the underlying systems fire (e.g., a high-ambition starter benched too long + a rival club's interest → "head turned" storyline; a boardroom agenda mismatch + bad form → "boardroom struggle"), and advances/resolves by rules over the same relationship/promise/dressing-room state everything else uses.
- **Pacing**: per your answer, interactions are surfaced rich-and-frequent by default (press conference after every match, regular one-on-ones, proactive storyline prompts in the inbox) — the inbox is the spine of the UI, FM-style.

## 7. Other systems

- **Transfers & contracts** — real negotiation with clauses (release, buy-back, sell-on %), bonuses (appearance, goals, promotion), agent fees, counter-offers; separate flows for permanent transfers, loans (with recall/future-fee options), and contract renewals/extensions.
- **Scouting** — fog of war: unscouted players show a confidence-banded estimate of ability rather than exact attributes; assigning scouts (with their own judging-ability stat) narrows the band over time, and scouting affects negotiation leverage.
- **Youth academy** — intake events generate regens via `name_pools.json`, academy facility level affects intake quality/quantity, youth coaches affect development rate.
- **Training & development** — individual focus/schedules affect attribute growth within each player's age/potential curve; `developmentCurve` state (per §4) is where this accumulates.
- **Finances** — wage budgets, transfer budgets, revenue streams (matchday/commercial/broadcast — derived similarly to how `fm-dataset` derived them), all routed through §3's per-league multiplier.
- **Competitions** — every domestic cup in `cups.json` with its real format; UCL/UEL/UECL 36-team league phase exactly as `europe.json` specifies (fixed season-1 entrants, then derived from league finishes/cup winners from season 2); international breaks pause league/cup scheduling without pausing the calendar.
- **Injuries** — rolled per-event in full sim, per-boxscore in fast sim, modulated by `injuryProneness` and accumulated fatigue; affects training and selection.
- **Season rollover** — promotion/relegation/playoffs/playouts per league exactly as `leagues.json` specifies (including ESP2's reserve-team rule and the three leagues' different playoff formats), European qualification recalculated from real finishes, contracts tick down, loans resolve, youth intake runs, retirements/regens run, `SeasonHistory` archives the season.

## 8. Stats

Every name/club/competition is a tappable link into its own profile screen. Sortable/filterable tables with a per-90 toggle; season/career/club-by-club splits; home/away, by competition, by month, vs. opponent tier. Advanced metrics (xG, xA, shots, key passes, progressive passes/carries, pressures, PPDA, defensive actions, GK stats) are byproducts of the full-sim event log (§5), aggregated the same way whether the match was watched live or not. Tables use a sticky first column + horizontal scroll + compact density, built mobile-first (§9), not retrofitted.

## 9. UI

iPhone-first, dark mode, thumb-reachable bottom nav (Inbox / Squad / Tactics / Transfers / Club / Stats, roughly), inbox-centred flow: the inbox is where match results, press requests, conversation prompts, promise deadlines, board meetings and storyline beats all surface, mirroring FM's core loop but carrying the RPG weight. Dense but not cluttered — favor progressive disclosure (summary card → tap through) over cramming.

## 10. Testing strategy

- **Engine**: Vitest unit tests for phase resolution, xG, economy math, promise/relationship resolution logic — pure functions, no Dexie/React.
- **Balance**: the headless multi-season harness from §5, run on demand (and before any milestone that touches the match engine) against real-world benchmark ranges per league.
- **UI**: manual on-device testing on your phone at the end of every milestone (per your workflow) — this is the actual acceptance test, not a substitute for it.
