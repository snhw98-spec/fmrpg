# ROADMAP.md

Each milestone ends with a build you can install on your phone and actually play. Commit at the end of each milestone; this file gets updated as we go (status, dates, deviations from plan).

Legend: ⬜ not started · 🟨 in progress · ✅ done

## Milestone 0 — Scaffolding
✅ Status (2026-10-16)

- Vite + React + TS (strict) app under `app/`; ESLint/Prettier; Vitest wired up.
- Dexie schema for `leagues`, `clubs`, `players`, `people`, `cups`, `europe`, `saves`.
- `scripts/sync-data.mjs` copies `fm-dataset/data` → `app/public/data`.
- PWA shell: manifest, service worker (offline app-shell caching), installable on iOS, dark mode by default.
- Git repo initialized at the project root; this and all later milestones end in a commit.
- **Acceptance**: installs to an iPhone home screen, opens offline, shows an empty-state screen.
- Verified in-browser (desktop + mobile viewport): dark theme, bottom nav, IndexedDB open, production build/lint/tests all clean. **Not yet verified on your actual iPhone** — see [README.md](README.md) for the local-network testing steps; let me know if the home-screen install and offline reload don't work as expected.

## Milestone 1 — One league, playable, balance-tested
✅ Status (2026-10-16)

Scope: Premier League only (Arsenal as your test club), but the import/editor/engine code here is written generically for all 10 playable leagues — M2 is mostly "turn the rest on," not a rewrite.

- First-launch import from `app/public/data` into Dexie; gap-filling (thin squads, missing GKs, generated non-player people) — §2 of DESIGN.md.
- In-game editor: players, clubs, people, league settings (incl. per-league `economyMultiplier`).
- Match engine core (§5): possession-phase model, xG, fouls/cards/injuries/set pieces; full event sim + fast result sim sharing one strength model.
- Headless balance harness: 10+ simulated Premier League seasons checked against real-world benchmarks (goals/game, home/draw/away split, champion/relegation points, scoring distribution). Tuned until it passes.
- Tactics: formation, roles, team/opposition instructions, set-piece takers.
- Viewing modes: full commentary, key moments, instant result.
- In-match management: tactical changes, shouts, subs, half-time talks (talks can be stubbed to a simple personality check here; full depth lands in M3).
- Squad screen, basic season stats (table, top scorers/assists), fixture list, calendar/sim-forward.
- **Acceptance**: you manage Arsenal through a full Premier League season on your phone, with results that feel realistic.
- Verified: balance harness passes all 6 checks (goals/game, home/draw/away split, champion/bottom points, scoreline distribution) across 25 simulated seasons; full `npm test` suite (engine unit tests + a real-Arsenal-squad lineup test) green; build/lint clean. Walked the whole loop live in-browser — new game → Arsenal squad/tactics render with real EA data → play a match in each of the 3 viewing modes → half-time team talk verified to leave the first half bit-identical and change the second → matchday auto-advances the other 19 clubs → table/top-scorers update → editor edit (economy multiplier, a player rating) persists and is reflected elsewhere live. **Not yet verified on your actual iPhone** — same caveat as Milestone 0.
- Scope simplifications made along the way, to revisit later: single implicit save slot (`"default"`) rather than a save-slot picker UI — the multi-save architecture (`openSaveDatabase(saveId)`, one Dexie database per slot) is already in place, just not exposed in the UI yet. In-match management is the stub the roadmap allowed: tactics are pre-match only (no mid-match tactical changes/subs), and the half-time "team talk" is a flat tone-based multiplier, not yet personality-driven (both land properly in M3). Editor covers the highest-value fields (ratings, club ID, finances, economy multiplier) rather than every attribute; full-depth attribute editing can grow as it's actually needed. `players_world.json`/`europe.json` (transfer pool + Europe) aren't imported yet — deferred to M2 by design (§2 of DESIGN.md).

## Milestone 2 — All 10 leagues, full background world, Europe, cups, rollover
✅ Status (2026-10-17)

- Enable all 10 playable leagues + GER3 feeder; full simulation (fast-sim tier) running across all 49 leagues/~670 clubs per your "full simulation everywhere" call — including the 38 transfer-pool leagues.
- Every domestic cup in `cups.json` with real format and generated out-of-data entrants.
- UCL/UEL/UECL 36-team league phase per `europe.json`, fixed season-1 entrants (generated squads for the 21 not in the dataset).
- International breaks pause league/cup scheduling on the calendar.
- Season rollover: promotion/relegation/playoffs/playouts per league's actual rules (incl. ESP2 reserve-team rule), European qualification from real finishes from season 2 on, contract countdowns, retirements.
- Balance harness extended to spot-check every playable league, not just the Premier League.
- **Acceptance**: you can take any club in any of the 10 leagues, play a full season, and roll over into a second season with correct promotion/relegation/Europe/cups.
- Verified headlessly via a new `npm run test:world` harness ([scripts/run-world-harness.ts](app/scripts/run-world-harness.ts)) against a real Dexie (fake-indexeddb): imports the full world, sets up every core league/cup/Europe competition for 2026-27, plays Arsenal's entire season end-to-end (league + cups + Europe, 43 fixtures; every other club's matches caught up alongside), then rolls over into 2027-28 and checks every core league kept the same club count with no duplicates and the right clubs relegated. All 3 checks pass (~5 min total run). `npm run balance` extended to spot-check all 10 playable leagues, not just the Premier League (`npm run balance <seasons> all`). Also walked the real flow live in-browser against an actual (non-fake) IndexedDB, including an unplanned but valuable test: it picked up the Milestone 1 save from your phone/browser testing and the schema migration upgraded it correctly — played a match, half-time talk, continue, table update, next fixture, all genuinely fast (real IndexedDB, unlike the harness's fake one). New in-browser: multi-league club picker on New Game (any of the 10 leagues, not just the Premier League), the player-age display bug fixed (was frozen to the game's launch date instead of the save's current date).
- **Real bugs the harness caught, worth naming since they'd have been very hard to spot by inspection**: (1) every league used the same flat 7-day matchday gap regardless of its real season length — fine for the Premier League's 38 matchdays, but the Championship's 46 matchdays at a 7-day cadence drift past its actual season end date and never finish; now spaced from each league's real start/end dates. (2) Rollover only trusted "the manager's own league is finished" as the signal to compute final tables, but other leagues' real calendars end on different dates (Serie A finishes a week after the Premier League, Europe's final later still) — rollover now force-completes every competition before touching any table, regardless of the manager's own calendar. (3) GER3 (background-simulated) promotes 2-3 real clubs into 2. Bundesliga every season; that movement was silently dropped since GER3 isn't one of the "core" calendar leagues — fixed as an explicit cross-tier case alongside the existing GER1↔GER2 playoff link.
- **Performance, not just a test artifact**: a full season/rollover initially took 20+ minutes under the test harness; profiling (not guessing) found the actual causes — `.anyOf()` multi-key queries degrading badly at ~150+ keys, unused single-field indexes adding write overhead to every one of the thousands of fixture writes a season makes, and per-fixture `.update()` calls instead of one batched `bulkPut()`. Fixed all three (squad/tactics batch-fetched once per matchday instead of per-fixture, unused indexes dropped, results written in one `bulkPut`): same full run now takes ~5 minutes under the harness's slower fake database, and felt instant against the real browser IndexedDB in the live walkthrough above. Worth fixing regardless of the harness, since the live app hits this same "catch up the calendar" path every time you tap Continue.
- **Scope simplifications, by design, to revisit later** (none of these affect the acceptance test above, all documented so they're not mistaken for bugs):
  - **Cups**: every domestic cup is a single unseeded knockout bracket from round 1 (byes fill odd counts) — no staggered entry rounds (lower clubs don't get a head start before the top flight joins), no two-legged ties. A drawn knockout tie (including penalty-shootout cup ties) is decided by a simplified shootout model (composure + goalkeeping, not a kick-by-kick sim).
  - **4 curtain-raiser mini-competitions deferred**: Community Shield, DFL-Supercup, Supercoppa, Supercopa aren't implemented — all four need last season's cup *runner-up* (not just the winner), which isn't tracked yet. None feed Europe or promotion/relegation, so nothing else depends on them; natural to pick up alongside M6's awards/history work.
  - **Europe knockout seeding**: real UEFA seeds the Ro16+ draw; this engine pairs randomly after the playoff-round cut (top 8 bye, 9th-24th play a knockout play-off, 25th-36th eliminated — that part matches the real format).
  - **Europe qualification (season 2+)**: dynamically tracks the 4 leagues this project actually simulates in detail (England, Italy, Spain, Germany top flights) via their real `europe` mapping in `leagues.json`, plus each country's cup winner where the data specifies it. The rest of the 36-team field is drawn from the broadest strength-sorted pool of every club in the database (so it's still populated with recognizable clubs), rather than modeling qualification for the other dozens of European leagues.
  - **The 38 transfer-pool leagues + GER3**: simulated as a complete season in one batch (not matchday-by-matchday on the calendar, and without persisting individual match fixtures — just the final table) via a lighter-weight random-pairing schedule rather than a strict fixture-list round robin. This is what makes "full simulation everywhere" computationally sane; nothing in the UI shows their match-by-match results yet.
  - **ESP2's reserve-team promotion rule** (Real Sociedad B / Celta Fortuna can't promote into the same division as their first team) isn't enforced yet — a narrow, two-club exception, flagged rather than silently risking an incorrect promotion.
  - **Contract renewal/retirement at rollover** is a flat age-based probability curve, not a real negotiation (that's Milestone 4) — expiring contracts auto-renew with a small random wage bump unless the player's old enough to retire outright. No youth intake replacing retirees yet (Milestone 6).

## Milestone 3 — Core RPG layer
⬜ Status

- Relationship model with append-only, decay-weighted interaction logs (§4/§6) for players, staff, board, agents, journalists.
- Conversations: tone-based one-on-ones, personality- and history-dependent outcomes.
- Promises: tracked terms/deadlines; broken-promise consequences (unrest, transfer requests, press leaks, reputation hit) wired through the relationship/dressing-room systems.
- Dressing room: hierarchy, cliques, influence graph, captaincy effects on unrest propagation and team talks (full depth now, replacing M1's stub).
- Inbox becomes the real spine of the UI: rich-and-frequent proactive surfacing of conversations/press/promise deadlines per your pacing call.
- **Acceptance**: over a season at Arsenal, promises you make or break visibly change how specific players, not an abstract morale bar, treat you — and you can feel cliques/leaders shaping unrest.

## Milestone 4 — Transfers, contracts, agents, scouting
⬜ Status

- Negotiation engine: clauses (release/buy-back/sell-on), bonuses, agent fees, counter-offers.
- Agents as real negotiating parties with personality-driven behavior (greed, loyalty, manipulation, leakiness), including shopping a client around behind your back.
- Loans (recall clauses, future-fee options), contract renewals/extensions.
- Scouting: fog-of-war ability estimates, scout assignment narrowing confidence over time.
- **Acceptance**: you can scout, negotiate, and sign a player through an agent with a distinct, consistent personality, and feel the difference between a greedy and a loyal one.

## Milestone 5 — Board, directors, media, fans, job security, storylines
⬜ Status

- Board agendas per club (profit/trophies/youth/vanity/sell-the-club); board meetings negotiating budget/facilities/objectives.
- Sporting director autonomy/interference tied to your reputation and results; visible job-security meter.
- Country-specific financial/registration rules from `leagues.json` (50+1, LaLiga squad cost limit, Serie B distress) enforced, not just displayed.
- Journalists with individual bias/sensationalism and memory; press conferences with lasting consequences; fan/ultras sentiment; rivalry-driven derby stakes.
- Dynamic storyline engine (contract rebels, personal-life issues, title-race pressure, head-turned star, boardroom struggles) emerging from the systems above.
- Manager career: reputation, growable attributes (man-management, tactics, media handling, youth development), job offers/sackings, staff following you between clubs, career history.
- **Acceptance**: a bad run of results produces believable, systemic knock-on drama — board interference, a leaked story, a dressing-room grumble — without any of it being scripted for that specific moment.

## Milestone 6 — Youth, regens, long-term history, full stats suite, polish
⬜ Status

- Youth intake events generating regens from `name_pools.json`; academy facilities/coaches affecting intake and development.
- Long-term world: aging, retirement, players moving into coaching, multi-decade save stability.
- Full stats suite (§8): tappable profiles everywhere, sortable/filterable tables with per-90 toggle, season/career/club splits, home-away/competition/month/opponent-tier splits, advanced metrics (xG/xA/PPDA/progressive actions/GK stats), league leaders/records/awards/team histories/head-to-heads, trend charts.
- Mobile table polish: sticky column, horizontal scroll, compact density pass across the whole app.
- Performance pass on season rollover and full-world fast-sim given a multi-decade save.
- Hosting write-up: GitHub Pages deploy steps + home-screen install instructions.
- **Acceptance**: a multi-season save holds up — history is queryable, stats are deep and fast to browse on your phone, performance is still snappy.

## Open items to revisit mid-build (not blocking, flagged so they don't get lost)

- Exact default `economyMultiplier` per league — ship at `1.0`, revisit once M1's Premier League numbers are in front of you.
- Whether fast-sim-tier background leagues need their own lighter-weight balance pass per league tier (lower leagues shouldn't necessarily look like the Premier League statistically) — fold into M2's harness extension.
