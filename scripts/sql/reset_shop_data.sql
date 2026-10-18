-- Wipes the shop's business data so you can start again (e.g. before a fresh product import).
--
-- Removed: products, categories, sales (with items, returns and voids), stock history,
--          expenses, customers and their payments, unsent low-stock / daily-summary messages.
-- Kept:    team members and roles (profiles), shop settings, the audit log.
-- Receipt numbers start again from 1.
--
-- Run it with scripts/reset-shop-data.sh, which shows counts, asks for confirmation and takes a
-- backup first. This is NOT a migration: never copy it into supabase/migrations/.

begin;

truncate table
  public.customer_payments,
  public.sale_return_items,
  public.sale_returns,
  public.stock_movements,
  public.sale_items,
  public.sales,
  public.customers,
  public.expenses,
  public.products,
  public.categories
restart identity;

delete from public.notifications_outbox
 where sent_at is null
   and kind in ('low_stock', 'daily_summary');

update public.shop_settings set daily_summary_last_sent = null;

commit;
