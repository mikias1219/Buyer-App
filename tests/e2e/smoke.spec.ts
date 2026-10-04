import { expect, test } from '@playwright/test';

// Minimal production-bundle smoke: mock backend build must boot and render a shell.
test('app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();
});
