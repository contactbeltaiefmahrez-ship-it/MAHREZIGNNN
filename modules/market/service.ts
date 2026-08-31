/** Public interface of the market module. */
export { publishCycle, type PublishResult } from './repository/publish.ts';
export { allocateSeat, createSeatsForCycle, countOccupied, assignCuratedSeat } from './repository/seat.ts';
export {
  nextState, canTransition, seatPlan, SEAT_LAYOUT, TOTAL_SEATS, SELLABLE_SEATS,
  tierRequiresVerified, tierBelow, selectRising, selectNewcomer, improvementScore,
  SELLABLE_TIERS, type CycleState, type CycleEvent, type SeatTier, type SeatSource,
  type CuratedCandidate,
} from './domain/cycle.ts';
