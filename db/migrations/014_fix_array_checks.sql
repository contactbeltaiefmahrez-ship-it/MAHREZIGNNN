-- 014 · Fix two CHECK constraints that a NULL array length bypassed.
--
-- `array_length('{}', 1)` returns NULL, not 0, and `NULL >= 1` evaluates to
-- NULL — which a CHECK treats as SATISFIED. Both guards therefore accepted the
-- exact case they existed to reject: a legal basis active with no decisions,
-- and an authorisation naming no fields. Found by test.
alter table legal_basis drop constraint active_requires_decision;
alter table legal_basis add constraint active_requires_decision
  check (not active or coalesce(array_length(decision_refs, 1), 0) >= 1);

alter table business_participation drop constraint authorisation_names_fields;
alter table business_participation add constraint authorisation_names_fields
  check (authorisation_method = 'NONE'
         or coalesce(array_length(authorised_fields, 1), 0) >= 1);
