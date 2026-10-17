/** Resolves a path under public/data/ relative to the app's base URL, so data fetches work
 * both at the dev-server root and under a subpath deployment (GitHub Pages serves this app
 * at /fmrpg/, not /). `import.meta.env.BASE_URL` only exists under Vite — the headless
 * harnesses (scripts/run-world-harness.ts etc.) import this same module straight through
 * tsx, with no Vite involved, so this falls back to '/' there rather than throwing. */
export function dataUrl(file: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}data/${file}`;
}
