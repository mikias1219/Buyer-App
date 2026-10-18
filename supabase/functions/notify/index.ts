// Scheduled worker (call every minute with header `x-cron-secret: $CRON_SECRET`).
// Drains notifications_outbox with retries/backoff; permanent failures stop and mark bot_blocked.
import { isPermanentTelegramError, renderNotification, type LinkConfig, type OutboxRow } from '../_shared/messages.ts';
import { timingSafeEqual } from '../_shared/telegramAuth.ts';
import { env, serve, serviceClient } from '../_shared/runtime.ts';

interface TelegramResult {
  ok: boolean;
  status: number;
  description: string;
  retryAfter?: number;
}

async function telegram(method: string, payload: Record<string, unknown>): Promise<TelegramResult> {
  const res = await fetch(`https://api.telegram.org/bot${env('BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    parameters?: { retry_after?: number };
  };
  return {
    ok: Boolean(body.ok),
    status: res.status,
    description: body.description ?? res.statusText,
    ...(body.parameters?.retry_after ? { retryAfter: body.parameters.retry_after } : {}),
  };
}

serve(async (req) => {
  const secret = req.headers.get('x-cron-secret') ?? '';
  const expected = env('CRON_SECRET');
  if (!secret || !timingSafeEqual(secret, expected)) return new Response('forbidden', { status: 403 });

  const db = serviceClient();
  const cfg: LinkConfig = { miniAppUrl: env('MINI_APP_URL', false) };

  const { data: rows, error } = await db.rpc('claim_outbox', { p_limit: 50 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    const msg = renderNotification(row, cfg);
    if (!msg) {
      await db.rpc('complete_outbox', { p_id: row.id, p_ok: false, p_error: `unknown kind ${row.kind}`, p_permanent: false });
      failed++;
      continue;
    }
    const result = await telegram('sendMessage', {
      chat_id: row.chat_id,
      text: msg.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(msg.button
        ? { reply_markup: { inline_keyboard: [[{ text: msg.button.text, web_app: { url: msg.button.webAppUrl } }]] } }
        : {}),
    });

    if (result.ok) {
      sent++;
      await db.rpc('complete_outbox', { p_id: row.id, p_ok: true });
    } else {
      failed++;
      await db.rpc('complete_outbox', {
        p_id: row.id,
        p_ok: false,
        p_error: `${result.status} ${result.description}`,
        p_permanent: isPermanentTelegramError(result.status, result.description),
      });
      if (result.status === 429) break; // flood control: stop this run, rows are already backed off
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
