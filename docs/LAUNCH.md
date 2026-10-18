# Launch checklist

## One-time setup

1. **Supabase**: project running (free projects pause after a week without traffic; restore it in
   the dashboard if the app shows "not configured" or CI fails with `tenant/user not found`).
2. **Edge Function secrets** (`supabase secrets set …`): `BOT_TOKEN`, `JWT_SECRET`, `WEBHOOK_SECRET`,
   `CRON_SECRET`, `MINI_APP_URL`, `INITIAL_ADMIN_TELEGRAM_IDS` (your numeric Telegram id).
3. **Cron**: Dashboard → Integrations → Cron → Edge Function `notify`, `* * * * *`, header
   `x-cron-secret: <CRON_SECRET>`.
4. **Bot** (@BotFather): set the menu button to `MINI_APP_URL`; commands:
   ```
   today - Today's sales and profit (owner)
   lowstock - Products running out
   help - How to use the shop app
   ```
   Webhook: `curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" -d url="https://<ref>.supabase.co/functions/v1/bot-webhook" -d secret_token="$WEBHOOK_SECRET"`
5. **Clean up the old marketplace** (Supabase dashboard): delete the `listing-images` and
   `payment-proofs` buckets; `supabase functions delete verify-phone`.

## First day in the shop

1. Open the app from the bot → you become the owner (first login only).
2. More → Settings: shop name, low-stock level, staff permissions, bot messages.
3. More → Categories (optional) → More → Import products (download the template, fill it in
   Excel/Google Sheets, export as CSV, check, import). Or add products one by one.
4. Staff open the app from the bot once → More → Team → Give access.
5. Record a test sale, open the receipt, cancel it (stock comes back), check the dashboard.

## Smoke test after every deploy

- Owner: Dashboard loads; Products list/search; add a product; restock; stock count.
- Sell: add items, discount, cash sale → receipt; credit sale with a customer → Customers shows
  the debt → record a payment.
- Sales: filter by period; return one item; cancel a sale.
- Expenses: add one; Dashboard net profit changes.
- Reports: download a CSV (Telegram Desktop or browser).
- Staff account: no cost/profit anywhere, no Dashboard, only own sales today.
- Bot: `/today`, `/lowstock`.

## Start over (remove all shop data)

`bash scripts/reset-shop-data.sh` with `SUPABASE_DB_URL` set. It shows what will be deleted,
saves a backup to `backups/` (git-ignored), and asks you to type `DELETE`. Products, categories,
sales, stock history, expenses and customers are removed; team members and settings stay.
