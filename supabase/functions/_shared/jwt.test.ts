import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bearerToken, signJwt, verifyJwt, type AccessClaims } from './jwt.ts';

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const NOW = 1_760_000_000;
const claims: AccessClaims = { sub: '42', tg_id: '42', role: 'authenticated', aud: 'authenticated', iat: NOW, exp: NOW + 3600 };

describe('jwt', () => {
  it('signs a token any HS256 verifier accepts (PostgREST-compatible)', async () => {
    const token = await signJwt(claims, SECRET);
    const [h, p, s] = token.split('.');
    const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    expect(s).toBe(expected);
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toMatchObject({ tg_id: '42', role: 'authenticated' });
  });

  it('round-trips and rejects expired, tampered or foreign tokens', async () => {
    const token = await signJwt(claims, SECRET);
    expect(await verifyJwt(token, SECRET, NOW)).toMatchObject({ tg_id: '42' });
    expect(await verifyJwt(token, SECRET, NOW + 3601)).toBeNull();
    expect(await verifyJwt(token, 'another-secret-another-secret-another', NOW)).toBeNull();
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, tg_id: '1' })).toString('base64url');
    expect(await verifyJwt(`${h}.${forged}.${s}`, SECRET, NOW)).toBeNull();
    expect(await verifyJwt('garbage', SECRET, NOW)).toBeNull();
  });

  it('rejects alg=none and non-authenticated roles', async () => {
    const none = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    expect(await verifyJwt(`${none}.${body}.`, SECRET, NOW)).toBeNull();
    const svc = await signJwt({ ...claims, role: 'service_role' as 'authenticated' }, SECRET);
    expect(await verifyJwt(svc, SECRET, NOW)).toBeNull();
  });

  it('extracts bearer tokens', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer  x ')).toBe('x');
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('Basic x')).toBeNull();
  });
});
