import { getPool, withTx } from '../platform/db.ts';
import { system, owner, staff, type ActorContext } from '../platform/actor.ts';
import { seatPlan } from '../modules/market/domain/cycle.ts';
import { createSeatsForCycle } from '../modules/market/repository/seat.ts';

export const SYS: ActorContext = system('test-req');
export const OPS: ActorContext = staff('OPS', '00000000-0000-7000-8000-000000000001', 's', 'r');

export async function resetDb(): Promise<void> {
  const p = getPool();
  await p.query(`truncate
    attention_grant, market_seat, seat_order, seat_application, cycle_transition,
    cycle_open_snapshot, market_cycle, payment, refund, attention_receipt, receipt_line,
    offer, business_service, business_photo_ref, claim_evidence, claim,
    verification_document, verification, business, media_object,
    delegation_density, delegation, category, session, otp_challenge,
    owner_account, staff_user, report, moderation_action, notification,
    staging_business, duplicate_review, import_batch, search_document,
    -- rate limits are DB-backed so they survive a restart; tests must clear them
    otp_rate, sms_outbox, audit_entry, event_telemetry, event_record
    restart identity cascade`);
}

export async function seedTaxonomy(): Promise<{ categoryId: string; delegation: string }> {
  const p = getPool();
  const c = await p.query<{ id: string }>(
    `insert into category (slug,name_ar,name_fr,color_hex,sort_order)
     values ('cafes','مقاهي ومطاعم','Cafés et restaurants','#6D3BF5',1) returning id`,
  );
  await p.query(
    `insert into delegation (code,name_ar,name_fr,governorate)
     values ('TUN-MARSA','المرسى','La Marsa','Tunis')`,
  );
  return { categoryId: c.rows[0]!.id, delegation: 'TUN-MARSA' };
}

export async function seedStaff(): Promise<string> {
  const r = await getPool().query<{ id: string }>(
    `insert into staff_user (email,password_hash,role) values ('ops@markyra.tn','x','OPS') returning id`,
  );
  return r.rows[0]!.id;
}

let bizSeq = 0;
export async function seedBusiness(opts: {
  categoryId: string; delegation: string;
  trust?: 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
  name?: string; ownerAccountId?: string | null;
}): Promise<string> {
  const n = ++bizSeq;
  const trust = opts.trust ?? 'UNCLAIMED';
  let ownerId = opts.ownerAccountId ?? null;
  if (trust !== 'UNCLAIMED' && !ownerId) {
    const o = await getPool().query<{ id: string }>(
      `insert into owner_account (phone_e164) values ($1) returning id`,
      [`+2169${String(1000000 + n).slice(0, 7)}`],
    );
    ownerId = o.rows[0]!.id;
  }
  const r = await getPool().query<{ id: string }>(
    `insert into business
      (name_ar,name_normalized,category_id,delegation_code,location,state,trust_level,
       owner_account_id,completeness_score,phone_e164,coordinate_confidence,provenance)
     values ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326),'PUBLISHED',$7::trust_level,$8,80,
             $9,
             'HIGH'::coord_confidence,
             '{"source":"test","collector":"fixture"}'::jsonb)
     returning id`,
    [
      opts.name ?? `نشاط ${n}`, `نشاط ${n}`, opts.categoryId, opts.delegation,
      10.2 + (n % 50) * 0.002, 36.8 + (n % 50) * 0.002, trust, ownerId,
      `+2167${String(3000000 + n).slice(0, 7)}`,
    ],
  );
  return r.rows[0]!.id;
}

export async function seedCycle(state = 'LOCKED', weekOffset = 0): Promise<string> {
  const base = new Date('2026-09-01T00:00:00Z').getTime() + weekOffset * 7 * 864e5;
  const d = (h: number) => new Date(base + h * 36e5).toISOString();
  const r = await getPool().query<{ id: string }>(
    `insert into market_cycle
      (week_number,opens_at,applications_close_at,payment_deadline_at,lock_at,live_at,closes_at,state)
     values ($1,$2,$3,$4,$5,$6,$7,$8::cycle_state) returning id`,
    [1000 + weekOffset, d(0), d(72), d(96), d(100), d(120), d(288), state],
  );
  const cycleId = r.rows[0]!.id;
  await withTx((tx) => createSeatsForCycle(SYS, tx, cycleId, seatPlan()));
  return cycleId;
}

/** An approved, paid, CONFIRMED order — the only state from which a seat may go live. */
export async function seedConfirmedOrder(
  cycleId: string, businessId: string, tier: 'STANDARD' | 'PREMIUM' | 'FEATURED',
  staffId: string, amount = 150000n,
): Promise<string> {
  const p = getPool();
  const app = await p.query<{ id: string }>(
    `insert into seat_application (cycle_id,business_id,tier,state,eligibility)
     values ($1,$2,$3::seat_tier,'APPROVED','{"ok":true}'::jsonb) returning id`,
    [cycleId, businessId, tier],
  );
  // invoice_number and payment_reference come from DB sequences (migration 005)
  const o = await p.query<{ id: string; payment_reference: string }>(
    `insert into seat_order
      (application_id,cycle_id,business_id,tier,amount_millimes,state,payment_deadline_at)
     values ($1,$2,$3,$4::seat_tier,$5,'CONFIRMED',now()+interval '1 day')
     returning id, payment_reference`,
    [app.rows[0]!.id, cycleId, businessId, tier, amount],
  );
  const orderId = o.rows[0]!.id;
  await p.query(
    `insert into payment (seat_order_id,method,amount_millimes,external_reference,confirmed_by_staff_id)
     values ($1,'BANK_TRANSFER',$2,$3,$4)`,
    [orderId, amount, o.rows[0]!.payment_reference, staffId],
  );
  return orderId;
}

export const ownerOf = (accountId: string, businessIds: string[]): ActorContext =>
  owner(accountId, businessIds, 'sess', 'req');
