import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openSaveDatabase } from './db';

describe('GameDatabase', () => {
  it('opens and exposes the expected tables', async () => {
    const db = openSaveDatabase('vitest');
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['clubs', 'cups', 'kv', 'leagues', 'people', 'players', 'saves'].sort(),
    );
    db.close();
  });
});
