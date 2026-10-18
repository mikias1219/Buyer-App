import { describe, expect, it } from 'vitest';
import type { Me } from '../../lib/api/types';
import { permissionsFor } from './hooks';

const base: Me = {
  public_id: 'p',
  username: '',
  first_name: 'A',
  last_name: '',
  photo_url: '',
  language: 'en',
  role: 'user',
  is_banned: false,
  settings: { shop_name: 'Shop', staff_can_restock: false },
};

describe('permissionsFor', () => {
  it('owner sees cost and can restock', () => {
    const p = permissionsFor({ ...base, role: 'owner' });
    expect(p).toMatchObject({ isOwner: true, isMember: true, canSeeCost: true, canRestock: true });
  });
  it('staff never sees cost; restock follows the setting', () => {
    expect(permissionsFor({ ...base, role: 'staff' })).toMatchObject({ isStaff: true, isMember: true, canSeeCost: false, canRestock: false });
    expect(permissionsFor({ ...base, role: 'staff', settings: { shop_name: 'S', staff_can_restock: true } }).canRestock).toBe(true);
  });
  it('users and banned members have no shop access', () => {
    expect(permissionsFor({ ...base, role: 'user' }).isMember).toBe(false);
    expect(permissionsFor({ ...base, role: 'owner', is_banned: true })).toMatchObject({ isOwner: false, isMember: false, isBanned: true });
    expect(permissionsFor(undefined)).toMatchObject({ role: null, isMember: false });
  });
});
