import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { AppError } from '../../../platform/errors.ts';

export interface CounselDecision {
  decisionRef: string; questionId: string; counselName: string; counselFirm?: string;
  decidedOn: string; decision: string; scope: string;
  conditions?: string; reviewBy?: string; documentReference?: string;
}

/**
 * Record a decision exactly as counsel returned it. The system never authors a
 * legal conclusion; it stores one that a named person, on a named date, made.
 * The document itself is NOT stored — only a reference to where it lives.
 */
export async function recordDecision(
  actor: ActorContext, tx: Tx, d: CounselDecision,
): Promise<string> {
  if (!d.counselName.trim() || !d.decidedOn) {
    throw new AppError('VALIDATION_FAILED', 'a decision requires a named counsel and a date');
  }
  const r = await tx.query<{ id: string }>(
    `insert into legal_decision
       (decision_ref,question_id,counsel_name,counsel_firm,decided_on,decision,
        scope,conditions,review_by,document_reference,recorded_by)
     values ($1,$2,$3,$4,$5::date,$6,$7,$8,$9::date,$10,$11)
     returning id`,
    [d.decisionRef, d.questionId, d.counselName, d.counselFirm ?? null, d.decidedOn,
     d.decision, d.scope, d.conditions ?? null, d.reviewBy ?? null,
     d.documentReference ?? null, actor.actorId]);
  return r.rows[0]!.id;
}

export interface LegalBasisInput {
  ref: string; description: string; decisionRefs: readonly string[];
  dataCategories: readonly string[]; grantedOn?: string; expiresOn?: string;
}

/**
 * Register a legal basis. It cannot be activated without at least one recorded
 * counsel decision — enforced by a CHECK constraint, so no code path can create
 * an active basis out of nothing.
 */
export async function registerBasis(
  _actor: ActorContext, tx: Tx, b: LegalBasisInput,
): Promise<void> {
  for (const ref of b.decisionRefs) {
    const found = await tx.query(`select 1 from legal_decision where decision_ref=$1`, [ref]);
    if (found.rowCount === 0) {
      throw new AppError('VALIDATION_FAILED',
        `decision '${ref}' is not recorded; record the counsel decision first`);
    }
  }
  await tx.query(
    `insert into legal_basis (ref,description,decision_refs,data_categories,granted_on,expires_on,active)
     values ($1,$2,$3,$4,$5::date,$6::date,false)
     on conflict (ref) do update set description=excluded.description,
       decision_refs=excluded.decision_refs, data_categories=excluded.data_categories`,
    [b.ref, b.description, [...b.decisionRefs], [...b.dataCategories],
     b.grantedOn ?? null, b.expiresOn ?? null]);
}

export async function activateBasis(
  _actor: ActorContext, tx: Tx, ref: string,
): Promise<void> {
  const r = await tx.query(`update legal_basis set active=true where ref=$1 returning ref`, [ref]);
  if (r.rowCount === 0) throw new AppError('RESOURCE_NOT_FOUND', `no legal basis '${ref}'`);
}

export interface BasisStatus {
  ref: string; active: boolean; expired: boolean; decision_refs: string[];
  data_categories: string[];
}

export async function basisStatus(
  _actor: ActorContext, tx: Tx, ref: string,
): Promise<BasisStatus | null> {
  const r = await tx.query<BasisStatus>(
    `select ref, active,
            (expires_on is not null and expires_on < current_date) as expired,
            decision_refs, data_categories
       from legal_basis where ref=$1`, [ref]);
  return r.rows[0] ?? null;
}

/** Open questions awaiting counsel, for the dossier and the entry gate. */
export async function openQuestions(
  _actor: ActorContext, tx: Tx, questionIds: readonly string[],
): Promise<string[]> {
  const r = await tx.query<{ question_id: string }>(
    `select distinct question_id from legal_decision where question_id = any($1::text[])`,
    [[...questionIds]]);
  const answered = new Set(r.rows.map((x) => x.question_id));
  return questionIds.filter((q) => !answered.has(q));
}
