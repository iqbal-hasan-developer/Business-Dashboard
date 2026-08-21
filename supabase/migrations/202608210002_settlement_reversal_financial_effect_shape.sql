begin;

alter table public.settlement_reversals
  alter column cash_reversal_id drop not null,
  drop constraint if exists settlement_reversals_financial_effect_shape,
  add constraint settlement_reversals_financial_effect_shape check (
    (cash_reversal_id is not null and owner_held_reversal_id is null)
    or (cash_reversal_id is null and owner_held_reversal_id is not null)
  );

create unique index if not exists settlement_reversals_owner_held_reversal_uidx
  on public.settlement_reversals (owner_held_reversal_id)
  where owner_held_reversal_id is not null;

commit;
