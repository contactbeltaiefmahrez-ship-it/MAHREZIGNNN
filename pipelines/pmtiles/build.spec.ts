import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateArchive, publishPlan, EXTERNAL_DEPENDENCY } from './build.ts';

const dir = mkdtempSync(join(tmpdir(), 'pm-'));

describe('PMTiles pipeline', () => {
  it('rejects a missing archive', () => {
    expect(validateArchive(join(dir, 'nope.pmtiles')).ok).toBe(false);
  });
  it('rejects a file that is not a PMTiles archive', () => {
    const p = join(dir, 'markyra-basemap-20260828.pmtiles');
    writeFileSync(p, Buffer.alloc(2048, 1));
    const r = validateArchive(p);
    expect(r.ok).toBe(false);
    expect(r.findings).toContain('BAD_MAGIC_NOT_PMTILES');
  });
  it('rejects an unversioned filename', () => {
    const p = join(dir, 'basemap.pmtiles');
    writeFileSync(p, Buffer.concat([Buffer.from('PMTiles'), Buffer.alloc(2048)]));
    expect(validateArchive(p).findings).toContain('FILENAME_NOT_VERSIONED');
  });
  it('accepts a well-formed versioned archive', () => {
    const p = join(dir, 'markyra-basemap-20260901.pmtiles');
    writeFileSync(p, Buffer.concat([Buffer.from('PMTiles'), Buffer.alloc(4096, 7)]));
    const r = validateArchive(p);
    expect(r.ok).toBe(true);
    expect(r.meta?.version).toBe('20260901');
  });
  it('flags a suspicious size change against the previous build', () => {
    const p = join(dir, 'markyra-basemap-20260902.pmtiles');
    writeFileSync(p, Buffer.concat([Buffer.from('PMTiles'), Buffer.alloc(100_000, 3)]));
    const r = validateArchive(p, { path: 'x', version: '20260901', bytes: 4103, sha256: 'a', tileCount: null });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.startsWith('SIZE_DELTA_TOO_LARGE'))).toBe(true);
  });
  it('publishes immutably and rolls back by pointer', () => {
    const plan = publishPlan({ path: 'x', version: '20260901', bytes: 1, sha256: 'a', tileCount: null });
    expect(plan.objectKey).toContain('20260901');
    expect(plan.cacheControl).toContain('immutable');
  });
  it('states the external blocker honestly', () => {
    expect(EXTERNAL_DEPENDENCY.blocked).toBe(true);
    expect(EXTERNAL_DEPENDENCY.attribution).toContain('OpenStreetMap');
  });
});
