import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  dataCheckString,
  parseInitUser,
  parseSharedContact,
  signTelegramData,
  timingSafeEqual,
  verifyTelegramData,
} from './telegramAuth.ts';

const BOT_TOKEN = '123456789:TEST-token_for-unit-tests';
const NOW = 1_760_000_000;

/** Independent reference implementation (node:crypto) of Telegram's algorithm. */
function referenceSign(fields: Record<string, string>, token: string): string {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  return createHmac('sha256', secret).update(check).digest('hex');
}

function buildInitData(fields: Record<string, string>, token = BOT_TOKEN): string {
  const params = new URLSearchParams(fields);
  params.set('hash', referenceSign(fields, token));
  return params.toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Abebe', username: 'abebe_et', language_code: 'am' });
const baseFields = { query_id: 'AAH', user, auth_date: String(NOW - 60), start_param: 'p_abc' };

describe('verifyTelegramData', () => {
  it('accepts a correctly signed payload (known-good vector)', async () => {
    const result = await verifyTelegramData(buildInitData(baseFields), BOT_TOKEN, { maxAgeSeconds: 86400, nowSeconds: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.authDate).toBe(NOW - 60);
      expect(parseInitUser(result.data.fields)).toMatchObject({ id: 42, username: 'abebe_et' });
      expect(result.data.fields.start_param).toBe('p_abc');
    }
  });

  it('matches the reference implementation byte for byte', async () => {
    const params = new URLSearchParams(baseFields);
    expect(await signTelegramData(params, BOT_TOKEN)).toBe(referenceSign(baseFields, BOT_TOKEN));
  });

  it('includes the third-party `signature` field in the check string', async () => {
    const fields = { ...baseFields, signature: 'ed25519sig' };
    const result = await verifyTelegramData(buildInitData(fields), BOT_TOKEN, { maxAgeSeconds: 86400, nowSeconds: NOW });
    expect(result.ok).toBe(true);
  });

  it('rejects a tampered user (privilege/identity spoofing)', async () => {
    const tampered = buildInitData(baseFields).replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":1'));
    const result = await verifyTelegramData(tampered, BOT_TOKEN, { maxAgeSeconds: 86400, nowSeconds: NOW });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects data signed with another bot token', async () => {
    const result = await verifyTelegramData(buildInitData(baseFields, '999:other'), BOT_TOKEN, {
      maxAgeSeconds: 86400,
      nowSeconds: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects stale auth_date (> 24h)', async () => {
    const old = buildInitData({ ...baseFields, auth_date: String(NOW - 86401) });
    expect(await verifyTelegramData(old, BOT_TOKEN, { maxAgeSeconds: 86400, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects auth_date in the future', async () => {
    const future = buildInitData({ ...baseFields, auth_date: String(NOW + 3600) });
    expect(await verifyTelegramData(future, BOT_TOKEN, { maxAgeSeconds: 86400, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'future_auth_date',
    });
  });

  it('rejects missing or malformed hash', async () => {
    expect(await verifyTelegramData('user=x&auth_date=1', BOT_TOKEN, { maxAgeSeconds: 1 })).toEqual({
      ok: false,
      reason: 'missing_hash',
    });
    expect(await verifyTelegramData('hash=zz', BOT_TOKEN, { maxAgeSeconds: 1 })).toEqual({
      ok: false,
      reason: 'missing_hash',
    });
  });

  it('builds the check string sorted and without hash', () => {
    expect(dataCheckString(new URLSearchParams('b=2&hash=x&a=1'))).toBe('a=1\nb=2');
  });
});

describe('parsers', () => {
  it('parses a requestContact payload', () => {
    expect(parseSharedContact({ contact: JSON.stringify({ user_id: 42, phone_number: '251911000000' }) })).toEqual({
      user_id: 42,
      phone_number: '251911000000',
    });
    expect(parseSharedContact({ contact: 'not json' })).toBeNull();
    expect(parseSharedContact({})).toBeNull();
  });

  it('rejects users without a valid id', () => {
    expect(parseInitUser({ user: JSON.stringify({ id: -1 }) })).toBeNull();
    expect(parseInitUser({ user: '{' })).toBeNull();
  });

  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});
