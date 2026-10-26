-- Update only the defaults copied into future order snapshots. Existing order
-- courier and packaging snapshots remain immutable and are intentionally not
-- touched by this migration.

do $migration$
declare
  updated_setting_count integer;
begin
  update public.business_settings
  set
    setting_value = case setting_key
      when 'outside_dhaka_courier_cost_poisha' then to_jsonb(13500::bigint)
      when 'packaging_cost_per_order_poisha' then to_jsonb(800::bigint)
    end,
    description = case setting_key
      when 'outside_dhaka_courier_cost_poisha' then 'Default Outside Dhaka courier cost in integer poisha'
      when 'packaging_cost_per_order_poisha' then 'Default packaging cost per order in integer poisha'
    end,
    updated_by = null
  where setting_key in (
    'outside_dhaka_courier_cost_poisha',
    'packaging_cost_per_order_poisha'
  );

  get diagnostics updated_setting_count = row_count;
  if updated_setting_count <> 2 then
    raise exception 'Expected both courier and packaging settings to exist; updated % rows', updated_setting_count;
  end if;
end
$migration$;
