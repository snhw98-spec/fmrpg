I want you to build a football management game for my personal use, playable on my iPhone. The target depth is Out of the Park Baseball: deep, systemic, stat-heavy and long-term. The thing that should set it apart from Football Manager is a much stronger RPG layer: real relationships and consequences with players, staff, the board, directors, agents and the media.

This is a private project, never distributed, so use real player names, club names and competitions.

## How I want you to work

1. BEFORE writing any code, read `DATA.md` and look through the files in `data/`. Then ask me any questions that would change the design. Then write DESIGN.md (systems, data model, how they interact) and ROADMAP.md (milestones). Wait for my approval.
2. Build in milestones. Every milestone ends with a playable build I can test on my phone. Commit at the end of each one and keep ROADMAP.md updated.
3. Within the direction we agree, make confident implementation decisions yourself. Only stop to ask when a choice meaningfully changes how the game plays.

## Platform & tech

- Progressive Web App, installable to the iPhone home screen, fully offline. (I have a Mac, but I want a web app, not native.)
- React + TypeScript (strict) + Vite. IndexedDB (via Dexie) for the database and saves.
- Keep all simulation logic in a pure TypeScript engine, separate from the UI. Use a seeded RNG so results are reproducible.
- Multiple save slots, plus export/import of save files as JSON backups (iOS can clear web storage).
- Give me simple instructions for hosting it (GitHub Pages or similar) and adding it to my home screen.

## Data (already built: don't make your own)

- The full 2026/27 database is in `data/`, documented in `DATA.md`. It contains real squads from EA FC 27 (Sept 2026), FM-style 1–20 attributes, hidden/personality attributes, contracts, values, club info, league rules, cups and the real 2026/27 UEFA league-phase entrants.
- Playable leagues: Premier League, Championship, League One, League Two, Serie A, Serie B, LaLiga, LaLiga Hypermotion, Bundesliga, 2. Bundesliga. Every other club in the data is a background transfer pool and European opposition; 3. Liga is simulated in the background as the 2. Bundesliga's feeder.
- Import it into IndexedDB on first launch. Treat it as the starting world; never overwrite it with invented players.
- Handle the gaps listed in DATA.md: top up thin squads with generated youth, generate clubs for relegation/cup slots outside the data, and generate all non-player people (staff, boards, owners, directors, agents, journalists) using `name_pools.json`.
- Build an in-game editor for players, clubs, people and league settings, so I can fix anything that's wrong.
- Long-term world: youth intakes, regens (named from `name_pools.json`), retirement, players moving into coaching, and a persistent history of every season.

## Match simulation (text-based)

- No 2D/3D engine. The text must be driven by a real underlying event model (possession phases, chances with xG, fouls, cards, injuries, set pieces). It should not be random commentary with a scoreline bolted on.
- Results must be statistically realistic. Build a headless simulator that runs 10+ seasons and checks league-wide goals per game, home/draw/away splits, points totals of champions and relegated sides, and scoring distributions against real-world benchmarks. Tune until they match.
- Viewing modes: full minute-by-minute commentary, key moments only, or instant result.
- In-match management: tactical changes, shouts, subs, and half-time team talks whose effect depends on player personalities.
- Tactics: formations, roles, instructions, set pieces, and opposition instructions, all meaningfully reflected in the sim.

## RPG layer (the heart of the game)

Tone: grounded, but with a healthy dose of melodrama. Think calcio: owners who sack managers in October, sporting directors leaking stories, ultras banners, players' agents stirring the pot, derby-week hysteria, dressing-room coups. Events should feel dramatic but always emerge from the systems and the personalities in the data.

- **Relationships with memory.** Every player, staff member, board member, agent and journalist has a relationship with me that remembers past interactions. They respond to what I actually did, not to a single morale number.
- **Conversations.** One-to-ones with dialogue options in different tones (calm, assertive, passionate, joking, honest, evasive). Outcomes depend on the other person's personality and our history.
- **Promises.** Playing time, signings, contract renewals and squad role are all tracked. Broken promises have real consequences: unrest, transfer requests, leaks to the press, damage to my reputation with other players.
- **Dressing room.** Hierarchy, leaders, cliques (nationality, age, tenure) and influence networks. Unrest spreads through influential players. Captaincy matters.
- **Board & directors.** An owner with a specific agenda (profit, trophies, youth, vanity signings, selling the club). A sporting director who may push signings I don't want or sell players behind my back. Board meetings where I negotiate budgets, facilities and objectives. A visible job-security meter, and interference that grows when results are bad. Respect country-specific realities from `leagues.json` (e.g. 50+1 member power in Germany, LaLiga's squad cost limit blocking registrations, Serie B clubs in financial trouble).
- **Agents.** Distinct personalities: greedy, loyal, manipulative, leaky. They affect transfers, contracts and player happiness.
- **Media & fans.** Press conferences with lasting consequences. Individual journalists with biases and memories. Fan sentiment, including ultras, reacting to results, signings, selection and what I say. Rivalries from `clubs.json` should matter.
- **My manager career.** Reputation, coaching philosophy, and manager attributes that grow (man-management, tactics, media handling, youth development). Job offers, sackings, staff who follow me between clubs, and a career history. I can start unemployed or pick any club in the 10 leagues.
- **Dynamic storylines.** Contract rebels, personal-life issues, rivalries, derby weeks, title-race pressure, a star player getting his head turned, and boardroom power struggles. Use the hidden personality data (controversy, temperament, ambition, loyalty, professionalism) to decide who causes drama.

## Other systems

Transfers and contracts with real negotiation (clauses, bonuses, agent fees, sell-ons, release clauses). Scouting with fog of war. Loans. Youth academy. Training and individual development. Finances (wages, revenue, the league financial rules in `leagues.json`). Every domestic cup in `cups.json`, the UCL/UEL/UECL with their 36-team league phase, international breaks, injuries and season rollover with correct promotion, relegation, playoffs and playouts per league.

## Stats (OOTP-level, easy to view)

- Every name, club and competition is tappable and opens its own profile.
- Sortable, filterable tables with a per-90 toggle. Season, career and club-by-club history. Splits: home/away, by competition, by month, versus opponent tier.
- Advanced metrics: xG, xA, shots, key passes, progressive passes/carries, pressures, PPDA, defensive actions, goalkeeper stats.
- League leaders, records, awards, team histories, head-to-heads, and simple trend charts.
- Tables must work on a phone: sticky first column, horizontal scroll, compact density.

## UI

iPhone-first, dark mode, thumb-friendly bottom navigation, and an inbox-centred flow like FM. Fast. Dense with information but never cluttered.

## Suggested milestones (refine in ROADMAP.md)

1. Data import, editor, one league playable for a full season. Text match engine, squad, tactics, basic stats. Balance-tested.
2. All 10 leagues, promotion/relegation, cups, Europe, multi-season rollover.
3. Core RPG layer: relationships, conversations, promises, dressing room.
4. Transfers, contracts, agents, scouting.
5. Board, directors, media, fans, job security, storylines.
6. Youth, regens, long-term history, full stats suite, polish and balancing.

Start by reading DATA.md, then ask me your questions.
