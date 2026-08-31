import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { normalizeArabic, searchVariants } from '../../../packages/arabic/normalize.ts';

export interface IndexableBusiness {
  businessId: string; nameAr: string; nameFr: string | null;
  aliases: readonly string[]; delegationCode: string; categoryId: string;
  trustLevel: 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED'; searchable: boolean;
}

/**
 * Called by the business module INSIDE its own transaction, so the index can
 * never lag the record. The search module owns the table; the business module
 * hands it a plain data object and never touches search_document itself.
 */
export async function reindex(
  _actor: ActorContext, tx: Tx, b: IndexableBusiness,
): Promise<void> {
  // Same normaliser as the query path, so index and query can never diverge.
  const normalized = normalizeArabic(b.nameAr);
  const aliasSet = new Set<string>();
  const addAll = (raw: string): void => {
    for (const v of searchVariants(raw)) {
      aliasSet.add(v);
      // Index individual word tokens too. Without this, a user searching the
      // distinctive word of a multi-word name ("الشمس" in "مقهى الشمس") gets a
      // trigram similarity far below threshold against the whole string, and
      // finds nothing. Found by test, not by inspection.
      for (const token of v.split(' ')) {
        if (token.length >= 3) aliasSet.add(token);
      }
    }
  };
  addAll(b.nameAr);
  if (b.nameFr) addAll(b.nameFr);
  for (const a of b.aliases) addAll(a);
  aliasSet.delete(normalized);

  await tx.query(
    `insert into search_document
       (business_id,name_ar,name_fr,name_normalized,aliases,delegation_code,
        category_id,trust_level,searchable,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::trust_level,$9,now())
     on conflict (business_id) do update set
       name_ar=excluded.name_ar, name_fr=excluded.name_fr,
       name_normalized=excluded.name_normalized, aliases=excluded.aliases,
       delegation_code=excluded.delegation_code, category_id=excluded.category_id,
       trust_level=excluded.trust_level, searchable=excluded.searchable,
       updated_at=now()`,
    [b.businessId, b.nameAr, b.nameFr, normalized, [...aliasSet],
     b.delegationCode, b.categoryId, b.trustLevel, b.searchable],
  );
}

export async function removeFromIndex(
  _actor: ActorContext, tx: Tx, businessId: string,
): Promise<void> {
  await tx.query(`update search_document set searchable=false where business_id=$1`, [businessId]);
}
