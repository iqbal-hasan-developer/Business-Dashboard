select
  not exists (select 1 from public.products where slug = 'pgtap-product-20260720')
    as rollback_product_removed,
  not exists (select 1 from public.product_business_data
    where sku_override = 'PGTAP-DASH-20260720') as rollback_private_product_removed,
  true as no_inventory_cleanup_required;
