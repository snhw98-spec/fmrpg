# FMRPG

Private football management RPG. See [DESIGN.md](DESIGN.md) and [ROADMAP.md](ROADMAP.md).

- `fm-dataset/` — the 2026/27 world database (source of truth, don't edit the JSON by hand — use the in-game editor once it exists).
- `app/` — the PWA (React + TypeScript + Vite).

## Testing on your iPhone during development

Until Milestone 6's GitHub Pages write-up, the fastest way to try each milestone's build on your phone is over your home Wi-Fi:

1. On your Mac, in `app/`:
   ```bash
   npm --prefix app run preview -- --host
   ```
   (or `npm --prefix app run dev -- --host` for a live-reloading dev build)
2. It prints a `Network:` URL like `http://192.168.1.x:4173`. Make sure your iPhone is on the same Wi-Fi network as your Mac.
3. On your iPhone, open that URL in Safari.
4. Tap the Share icon → **Add to Home Screen**. It installs like a normal app icon and opens full-screen.

Your Mac's current LAN address: `192.168.1.109` (this changes if you switch networks — re-run `ipconfig getifaddr en0` in Terminal to check).

Offline support needs the service worker, which only activates on a production build (`npm run preview`, not `npm run dev`) and needs the page loaded at least once while online.
