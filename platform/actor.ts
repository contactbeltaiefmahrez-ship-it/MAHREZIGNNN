/**
 * ActorContext — Invariant 4 expressed in the type system.
 *
 * Every business-scoped repository method takes this as its FIRST argument.
 * There is no repository method that accepts a bare business_id, so a developer
 * cannot forget the ownership check: the code will not compile.
 */
export type ActorKind = 'ANON' | 'OWNER' | 'OPS' | 'ADMIN' | 'SYSTEM';

export interface ActorContext {
  readonly kind: ActorKind;
  readonly actorId: string | null;
  /** Businesses this actor owns. Empty for everyone except OWNER. */
  readonly ownedBusinessIds: ReadonlySet<string>;
  readonly sessionId: string | null;
  readonly requestId: string;
}

export const anon = (requestId: string): ActorContext => ({
  kind: 'ANON', actorId: null, ownedBusinessIds: new Set(), sessionId: null, requestId,
});

export const owner = (
  actorId: string, ownedBusinessIds: Iterable<string>, sessionId: string, requestId: string,
): ActorContext => ({
  kind: 'OWNER', actorId, ownedBusinessIds: new Set(ownedBusinessIds), sessionId, requestId,
});

export const staff = (
  kind: 'OPS' | 'ADMIN', actorId: string, sessionId: string, requestId: string,
): ActorContext => ({ kind, actorId, ownedBusinessIds: new Set(), sessionId, requestId });

export const system = (requestId: string): ActorContext => ({
  kind: 'SYSTEM', actorId: null, ownedBusinessIds: new Set(), sessionId: null, requestId,
});

export const isStaff = (a: ActorContext): boolean => a.kind === 'OPS' || a.kind === 'ADMIN';

/** Does this actor own the business? Staff do not "own" — they are authorised separately. */
export const ownsBusiness = (a: ActorContext, businessId: string): boolean =>
  a.kind === 'OWNER' && a.ownedBusinessIds.has(businessId);

/** Read access to a business's private data: the owner, or staff. */
export const canReadBusinessPrivate = (a: ActorContext, businessId: string): boolean =>
  ownsBusiness(a, businessId) || isStaff(a);
