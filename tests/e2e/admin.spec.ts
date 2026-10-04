import { actAs, expect, test, USERS } from './fixtures';

test('admin confirms a waiting payment → listing goes live', async ({ page }) => {
  await actAs(page, USERS.admin);
  await page.goto('/#/admin/payments');
  await expect(page.getByText('CKK12ABC34')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Payment confirmed').first()).toBeVisible();
  await expect(page.getByText('No payments waiting')).toBeVisible();

  await page.goto('/#/search?q=pixel');
  await expect(page.getByRole('link', { name: /Pixel 7/ })).toBeVisible();
});

test('admin rejects a payment → seller fixes and resubmits', async ({ page }) => {
  await actAs(page, USERS.admin);
  await page.goto('/#/admin/payments');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Telebirr reference not found' }).click();
  await sheet.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText(/Payment rejected/).first()).toBeVisible();

  // Same browser context keeps the mock DB; switch to the seller.
  await page.evaluate(() => window.localStorage.setItem('tm_mock_user', '1002'));
  await page.goto('/#/mine?tab=action');
  await page.reload();
  await expect(page.getByText('Pixel 7 128GB')).toBeVisible();
  await expect(page.getByText('Telebirr reference not found')).toBeVisible();
  await page.getByRole('button', { name: 'Resubmit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Pay listing fee' })).toBeVisible();
  await expect(page.getByLabel('Transaction ID')).toBeVisible();
});

test('moderator approves from the review queue with an undo window', async ({ page }) => {
  await actAs(page, USERS.moderator);
  await page.goto('/#/admin/queue');
  await expect(page.getByRole('heading', { name: 'Redmi Note 12 128GB' })).toBeVisible();
  await expect(page.getByText('Price far below market')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Redmi Note 12 128GB' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText("Approved — it's live")).toBeVisible({ timeout: 10_000 });
});

test('moderators cannot open admin-only sections', async ({ page }) => {
  await actAs(page, USERS.moderator);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Payments' })).toHaveCount(0);
  await page.goto('/#/admin/settings');
  await expect(page).toHaveURL(/#\/admin$/);
});

test('regular users see no admin area', async ({ page }) => {
  await actAs(page, USERS.buyer);
  await page.goto('/#/admin');
  await expect(page.getByText('No access')).toBeVisible();
});
