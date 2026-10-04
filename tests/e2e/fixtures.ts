import { test as base, expect, type Page } from '@playwright/test';

/** 1x1 PNG used as a listing photo. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Mock identities seeded in src/lib/api/mock/seed.ts */
export const USERS = { buyer: '1001', seller: '1002', sellerNoUsername: '1003', moderator: '9002', admin: '9001' } as const;

export async function actAs(page: Page, user: string) {
  await page.addInitScript((id) => {
    if (!window.sessionStorage.getItem('tm_e2e_identity_set')) {
      window.localStorage.setItem('tm_mock_user', id);
      window.sessionStorage.setItem('tm_e2e_identity_set', '1');
    }
  }, user);
}

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    // Hermetic: never load Telegram's SDK from the network in tests.
    await page.route('**/telegram-web-app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await use(page);
  },
});

export { expect };
