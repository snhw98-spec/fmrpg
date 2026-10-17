# FMRPG

Private football management RPG. See [DESIGN.md](DESIGN.md) and [ROADMAP.md](ROADMAP.md).

- `fm-dataset/` — the 2026/27 world database (source of truth, don't edit the JSON by hand — use the in-game editor once it exists).
- `app/` — the PWA (React + TypeScript + Vite).

## Playing it on your iPhone

**Hosted (recommended)** — every push to `main` auto-deploys to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml):

1. On your iPhone, open **https://snhw98-spec.github.io/fmrpg/** in Safari.
2. Tap the Share icon → **Add to Home Screen**. It installs like a normal app icon, opens full-screen, and works offline after the first load.
3. After I push a new milestone, just reopen the app — it checks for an update automatically in the background (standard PWA behavior) and applies it next launch.

If the link 404s, GitHub Pages needs a one-time setup step on your end: repo **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow handles everything after that.

**Local network (fallback / fastest iteration while developing)** — useful if you want to test a change before it's pushed:

1. On your Mac, in `app/`:
   ```bash
   npm --prefix app run preview -- --host
   ```
   (or `npm --prefix app run dev -- --host` for a live-reloading dev build)
2. It prints a `Network:` URL like `http://192.168.1.x:4173`. Make sure your iPhone is on the same Wi-Fi network as your Mac.
3. On your iPhone, open that URL in Safari, then Share → **Add to Home Screen**.

Offline support needs the service worker, which only activates on a production build (`npm run preview` or the hosted Pages link, not `npm run dev`) and needs the page loaded at least once while online.

Note: the hosted and local-network installs are separate home-screen icons/PWA instances with separate save data (different origins) — they won't share a save.
