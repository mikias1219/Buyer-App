import { actAs, expect, test, USERS } from './fixtures';

test('browse → category → listing detail → save to favorites', async ({ page }) => {
  await actAs(page, USERS.buyer);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TechMarket ET' })).toBeVisible();
  await expect(page.getByText('Demo mode')).toBeVisible();

  await page.getByRole('link', { name: /Laptops/ }).click();
  await expect(page).toHaveURL(/search\?category=laptop/);
  await expect(page.getByText(/\d+ results?/)).toBeVisible();

  await page.getByRole('link', { name: /MacBook Air M1/ }).first().click();
  await expect(page.getByRole('heading', { name: 'MacBook Air M1 8/256' })).toBeVisible();
  await expect(page.getByText('ETB 68,000')).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove from saved' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/#/favorites');
  await expect(page.getByRole('link', { name: /MacBook Air M1/ })).toBeVisible();
});

test('search with no results shows a helpful empty state', async ({ page }) => {
  await actAs(page, USERS.buyer);
  await page.goto('/#/search?q=nonexistentgadget');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all' }).last().click();
  await expect(page.getByText(/\d+ results/)).toBeVisible();
});

test('contacting a seller requires phone verification and the safety check', async ({ page }) => {
  await actAs(page, USERS.buyer);
  await page.goto('/');
  await page.getByRole('link', { name: /iPhone 13 128GB/ }).first().click();
  await page.getByRole('button', { name: 'Contact seller' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your phone' })).toBeVisible();
  await page.getByRole('button', { name: 'Share my phone number' }).click();
  await expect(page.getByRole('heading', { name: /iPhone 13 128GB/ })).toBeVisible();
  await page.getByRole('button', { name: 'Contact seller' }).click();
  const sheet = page.getByRole('dialog', { name: 'Before you contact the seller' });
  await expect(sheet.getByRole('button', { name: 'Open chat with seller' })).toBeDisabled();
  await sheet.getByLabel('I understand').check();
  await expect(sheet.getByRole('button', { name: 'Open chat with seller' })).toBeEnabled();
});

test('language switch to Amharic', async ({ page }) => {
  await actAs(page, USERS.buyer);
  await page.goto('/#/profile');
  await page.getByRole('button', { name: /Language/ }).click();
  await page.getByRole('button', { name: 'አማርኛ' }).click();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'ፈልግ' })).toBeVisible();
});
