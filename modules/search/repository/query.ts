import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { normalizeArabic } from '../../../packages/arabic/normalize.ts';

export interface SuggestRow {
  id: string; name_ar: string; name_fr: string | null;
  delegation_code: string; category_id: string;
  trust_level: string; match_score: number;
}

export const MIN_QUERY_LENGTH = 2;
export const SUGGEST_LIMIT = 8;

/**
 * Search ranking, deliberately separate from discovery ranking.
 *
 * CONSTITUTIONAL: discovery_score, attention_weight and attention_grant do not
 * appear here and cannot - the search module is forbidden by lint from importing
 * `attention` at all, and it reads only its own projection. A merchant cannot buy
 * their way to the top of a search for a competitor's name. Tie-breaks are match
 * quality, then trust, then id for stability.
 */
export async function suggest(
  _actor: ActorContext, tx: Tx, rawQuery: string,
  opts: { limit?: number } = {},
): Promise<SuggestRow[]> {
  const q = normalizeArabic(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const res = await tx.query<Omit<SuggestRow, 'match_score'> & { match_score: string }>(
    `select d.business_id as id, d.name_ar, d.name_fr, d.delegation_code,
            d.category_id, d.trust_level::text as trust_level,
            greatest(
              similarity(d.name_normalized, $1),
              coalesce((select max(similarity(a, $1)) from unnest(d.aliases) a), 0)
            )::text as match_score
       from search_document d
      where d.searchable
        and (d.name_normalized % $1
             or d.name_normalized like $2
             or exists (select 1 from unnest(d.aliases) a where a % $1 or a like $2))
      order by greatest(
                 similarity(d.name_normalized, $1),
                 coalesce((select max(similarity(a, $1)) from unnest(d.aliases) a), 0)
               ) desc,
               d.trust_level desc,
               d.business_id
      limit $3`,
    [q, `${q}%`, opts.limit ?? SUGGEST_LIMIT],
  );
  return res.rows.map((r) => ({ ...r, match_score: Number(r.match_score) }));
}

/** Degraded path when the trigram query times out (Architecture 06.3). */
export async function suggestPrefixOnly(
  _actor: ActorContext, tx: Tx, rawQuery: string, limit = SUGGEST_LIMIT,
): Promise<SuggestRow[]> {
  const q = normalizeArabic(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const res = await tx.query<SuggestRow>(
    `select d.business_id as id, d.name_ar, d.name_fr, d.delegation_code,
            d.category_id, d.trust_level::text as trust_level, 1 as match_score
       from search_document d
      where d.searchable and d.name_normalized like $1
      order by d.name_normalized, d.business_id
      limit $2`,
    [`${q}%`, limit],
  );
  return res.rows;
}

/** Zero-result queries are the demand signal that drives the next seeding batch. */
export async function recordZeroResult(
  _actor: ActorContext, tx: Tx, rawQuery: string, deviceHash: string,
): Promise<void> {
  await tx.query(
    `insert into search_zero_result (query_text, query_normalized, device_hash)
     values ($1,$2,$3)`,
    [rawQuery, normalizeArabic(rawQuery), deviceHash],
  );
}
