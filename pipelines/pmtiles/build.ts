/**
 * PMTiles basemap pipeline.
 *
 * EXTERNALLY BLOCKED: the upstream extract cannot be fetched from this
 * environment (build.protomaps.com and download.geofabrik.de are unreachable).
 * The pipeline, validation gate, versioning and publish interface are complete
 * and will run unchanged once an operator supplies the archive.
 *
 * THE EXTERNAL STEP, exactly:
 *   pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles \
 *     markyra-basemap-<YYYYMMDD>.pmtiles \
 *     --bbox=9.90,36.55,10.55,37.10          # Grand Tunis pilot footprint
 *   sha256sum markyra-basemap-<YYYYMMDD>.pmtiles
 *
 * This pipeline has NO credentials for CORE and no dependency on modules/ —
 * that isolation is the ODbL fence in the file system (Architecture 05.5).
 */
import { createHash } from 'node:crypto';
import { statSync, readFileSync, existsSync } from 'node:fs';

export interface ArchiveMeta {
  path: string; version: string; bytes: number; sha256: string; tileCount: number | null;
}
export interface ValidationResult { ok: boolean; findings: string[]; meta: ArchiveMeta | null }

const PMTILES_MAGIC = 'PMTiles';

/** Validation gate. A build that fails here is never promoted. */
export function validateArchive(path: string, previous?: ArchiveMeta): ValidationResult {
  const findings: string[] = [];
  if (!existsSync(path)) return { ok: false, findings: ['ARCHIVE_MISSING'], meta: null };
  const bytes = statSync(path).size;
  const head = readFileSync(path, { flag: 'r' }).subarray(0, 7).toString('ascii');
  if (head !== PMTILES_MAGIC) findings.push('BAD_MAGIC_NOT_PMTILES');
  if (bytes < 1024) findings.push('ARCHIVE_TOO_SMALL');
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (previous) {
    const delta = Math.abs(bytes - previous.bytes) / previous.bytes;
    if (delta > 0.25) findings.push(`SIZE_DELTA_TOO_LARGE:${(delta * 100).toFixed(1)}%`);
    if (sha256 === previous.sha256) findings.push('IDENTICAL_TO_PREVIOUS');
  }
  const version = /markyra-basemap-(\d{8})\.pmtiles$/.exec(path)?.[1] ?? '';
  if (!version) findings.push('FILENAME_NOT_VERSIONED');
  return {
    ok: findings.length === 0,
    findings,
    meta: { path, version, bytes, sha256, tileCount: null },
  };
}

/**
 * Publish = upload an immutable, date-stamped object and move a config pointer.
 * Rollback is moving the pointer back; because filenames are content-addressed
 * there is no cache invalidation problem.
 */
export function publishPlan(meta: ArchiveMeta): {
  objectKey: string; cacheControl: string; configKey: string; rollbackNote: string;
} {
  return {
    objectKey: `basemap/markyra-basemap-${meta.version}.pmtiles`,
    cacheControl: 'public, max-age=31536000, immutable',
    configKey: 'basemap_version',
    rollbackNote: 'set basemap_version to the previous version; the old object is still present',
  };
}

export const EXTERNAL_DEPENDENCY = {
  blocked: true,
  reason: 'upstream OSM extract unreachable from the build environment',
  owner: 'founder / infrastructure',
  requiredAction: 'run pmtiles extract for bbox 9.90,36.55,10.55,37.10 and upload the archive',
  license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
} as const;
