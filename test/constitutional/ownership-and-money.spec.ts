import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fc from 'fast-check';
import { getPool, closePool } from '../../platform/db.ts';
import { canReadBusinessPrivate, ownsBusiness, anon, system } from '../../platform/actor.ts';
import { reconciles, nextOrderState, type OrderState } from '../../modules/payment/domain/order.ts';
import { AppError } from '../../platform/errors.ts';
import {
  resetDb, seedTaxonomy, seedBusiness, seedCycle, seedStaff, seedConfirmedOrder, ownerOf,
} from '../fixtures.ts';

let categoryId: string; let delegation: string; let staffId: string;
beforeEach(async () => {
  await resetDb();
  const t = await seedTaxonomy();
  categoryId = t.categoryId; delegation = t.delegation;
  staffId = await seedStaff();
});
afterAll(async () => { await closePool(); });

describe('INVARIANT 4 · a business owner cannot reach another business', () => {
  it('grants private access to the owner and denies it to a different owner', async () => {
    const bizA = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const bizB = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const accounts = await getPool().query<{ id: string; b: string }>(
      `select owner_account_id id, id b from business where id in ($1,$2)`, [bizA, bizB]);
    const ownerA = accounts.rows.find((r) => r.b === bizA)!.id;

    const actorA = ownerOf(ownerA, [bizA]);
    expect(canReadBusinessPrivate(actorA, bizA)).toBe(true);
    expect(canReadBusinessPrivate(actorA, bizB)).toBe(false);
    expect(ownsBusiness(actorA, bizB)).toBe(false);
  });

  it('denies anonymous actors any private access', async () => {
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    expect(canReadBusinessPrivate(anon('r'), biz)).toBe(false);
  });

  it('an owner of several businesses reaches exactly those and no others', async () => {
    const b1 = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const b2 = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const b3 = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const actor = ownerOf('acct-1', [b1, b2]);
    expect(canReadBusinessPrivate(actor, b1)).toBe(true);
    expect(canReadBusinessPrivate(actor, b2)).toBe(true);
    expect(canReadBusinessPrivate(actor, b3)).toBe(false);
  });

  it('a SYSTEM actor owns nothing — jobs act on explicit ids, never by ownership', () => {
    expect(ownsBusiness(system('r'), 'any-business')).toBe(false);
  });

  it('every business-scoped repository function takes ActorContext first', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const p = join(d, e);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    const repoFiles = walk('modules').filter((f) => f.includes('/repository/'));
    expect(repoFiles.length).toBeGreaterThan(0);
    for (const f of repoFiles) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/export async function (\w+)\(\s*([^,)]*)/g)) {
        // first parameter must be the actor (named actor or explicitly unused _actor)
        expect(m[2], `${f}: ${m[1]} first param`).toMatch(/^_?actor:/);
      }
    }
  });
});

describe('Money · explicit states and a reconciliation invariant', () => {
  it('reconciles payments minus refunds against the order amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { maxLength: 4 }),
        (amount, payments) => {
          const paid = payments.reduce((a, b) => a + b, 0);
          const state: OrderState = 'CONFIRMED';
          const refunds = paid > amount ? [BigInt(paid - amount)] : [];
          const ok = reconciles({
            state, amountMillimes: BigInt(amount),
            payments: payments.map(BigInt), refunds,
          });
          expect(ok).toBe(paid >= amount);
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it('treats an unsettled order as reconciling (nothing is owed yet)', () => {
    expect(reconciles({
      state: 'APPROVED_AWAITING_PAYMENT', amountMillimes: 150000n, payments: [], refunds: [],
    })).toBe(true);
  });

  it('flags a confirmed order with no payment', () => {
    expect(reconciles({
      state: 'CONFIRMED', amountMillimes: 150000n, payments: [], refunds: [],
    })).toBe(false);
  });

  it('an owner claiming payment does NOT confirm it', () => {
    const after = nextOrderState('APPROVED_AWAITING_PAYMENT', 'owner_claims_payment', 'OWNER');
    expect(after).toBe('PAYMENT_CLAIMED');
    expect(after).not.toBe('CONFIRMED');
  });

  it('only ops or admin may confirm a payment', () => {
    expect(nextOrderState('PAYMENT_CLAIMED', 'ops_confirm', 'OPS')).toBe('CONFIRMED');
    expect(() => nextOrderState('PAYMENT_CLAIMED', 'ops_confirm', 'OWNER'))
      .toThrow(AppError);
  });

  it('rejects impossible order transitions', () => {
    expect(() => nextOrderState('PENDING_REVIEW', 'publish', 'SYSTEM')).toThrow(/cannot publish/);
    expect(() => nextOrderState('EXPIRED', 'ops_confirm', 'OPS')).toThrow(/cannot ops_confirm/);
  });

  it('refuses a duplicate external payment reference at the database', async () => {
    const cycleId = await seedCycle();
    const bizA = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const bizB = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const orderA = await seedConfirmedOrder(cycleId, bizA, 'STANDARD', staffId);
    const orderB = await seedConfirmedOrder(cycleId, bizB, 'STANDARD', staffId);
    const ref = await getPool().query<{ external_reference: string }>(
      `select external_reference from payment where seat_order_id=$1`, [orderA]);
    await expect(
      getPool().query(
        `insert into payment (seat_order_id,method,amount_millimes,external_reference,confirmed_by_staff_id)
         values ($1,'BANK_TRANSFER',150000,$2,$3)`,
        [orderB, ref.rows[0]!.external_reference, staffId],
      ),
    ).rejects.toThrow(/payment_external_ref_ix|duplicate key/);
  });

  it('rejects a cash payment with no receipt number or agent', async () => {
    const cycleId = await seedCycle();
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const order = await seedConfirmedOrder(cycleId, biz, 'STANDARD', staffId);
    await expect(
      getPool().query(
        `insert into payment (seat_order_id,method,amount_millimes,confirmed_by_staff_id)
         values ($1,'CASH_AGENT',150000,$2)`, [order, staffId],
      ),
    ).rejects.toThrow(/payment_cash_requires_receipt/);
  });

  it('has no boolean paid column anywhere in the schema', async () => {
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from information_schema.columns
        where table_schema='public' and data_type='boolean'
          and column_name ~* '(^|_)paid(_|$)'`);
    expect(r.rows[0]!.n).toBe('0');
  });
});

describe('Audit · append-only', () => {
  it('rejects UPDATE and DELETE on audit_entry', async () => {
    await getPool().query(
      `insert into audit_entry (actor_type,action,target_table,target_id,request_id,entry_hash)
       values ('OPS','test.action','business',uuid_generate_v7(),'req-1',sha256('x'))`);
    await expect(getPool().query(`update audit_entry set action='tampered'`))
      .rejects.toThrow(/append-only/);
    await expect(getPool().query(`delete from audit_entry`))
      .rejects.toThrow(/append-only/);
  });
});
