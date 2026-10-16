#!/usr/bin/env node
// Copies fm-dataset/data/*.json into app/public/data verbatim, plus a manifest with a
// content hash per file so the importer (src/data) can cache-bust on re-import.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', '..', 'fm-dataset', 'data');
const outDir = join(here, '..', 'public', 'data');

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith('.json'));
const manifest = {};

for (const file of files) {
  const bytes = readFileSync(join(srcDir, file));
  writeFileSync(join(outDir, file), bytes);
  manifest[file] = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Synced ${files.length} data files to public/data (${Object.values(manifest).reduce((a, m) => a + m.bytes, 0).toLocaleString()} bytes).`);
