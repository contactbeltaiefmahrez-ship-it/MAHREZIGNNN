-- 005 · Invoice and payment-reference generation.
--
-- Found during integration testing: uuid v7 is TIME-ORDERED, so ids created in
-- the same millisecond share a long prefix. Any scheme that slices a uuid to
-- build a human reference will collide under load. Financial identifiers get a
-- real sequence. The unique constraints caught this, which is the point of them.

create sequence invoice_number_seq;
create sequence payment_reference_seq;

create or replace function next_invoice_number() returns text
language sql volatile as $$
  select 'INV-' || to_char(now() at time zone 'Africa/Tunis', 'YYMM')
       || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
$$;

-- Short enough for a merchant to copy into a bank transfer's reference field,
-- and checksummed so a mistyped reference fails fast instead of reconciling
-- against the wrong order.
create or replace function next_payment_reference() returns text
language plpgsql volatile as $$
declare
  n bigint := nextval('payment_reference_seq');
  body text := 'MK' || to_char(now() at time zone 'Africa/Tunis','YYMM')
               || lpad(n::text, 5, '0');
  chk int := 0;
  i int;
begin
  for i in 1..length(body) loop
    chk := (chk * 31 + ascii(substr(body, i, 1))) % 97;
  end loop;
  return body || '-' || lpad(chk::text, 2, '0');
end $$;

alter table seat_order alter column invoice_number set default next_invoice_number();
alter table seat_order alter column payment_reference set default next_payment_reference();
