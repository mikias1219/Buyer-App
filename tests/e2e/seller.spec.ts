import type { Page } from '@playwright/test';
import { actAs, expect, PNG, test, USERS } from './fixtures';

async function fillWizard(page: Page, title: string, price: string) {
  // Step 1 — photos
  await expect(page.getByRole('heading', { name: 'Add photos' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'phone.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Cover', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2 — details (validation first)
  await expect(page.getByRole('heading', { name: 'Describe your item' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose a category')).toBeVisible();
  await page.getByRole('button', { name: 'Phones' }).click();
  await page.getByLabel('Brand').fill('Samsung');
  await page.getByLabel('Model').fill('Galaxy A54');
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill('Works perfectly, comes with the original box and charger.');
  await page.getByLabel('City').selectOption('Addis Ababa');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3 — price
  await expect(page.getByRole('heading', { name: 'Set your price' })).toBeVisible();
  await page.getByLabel('Price', { exact: true }).fill(price);
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 4 — review
  await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
}

test('sell (free quota) → submitted for review', async ({ page }) => {
  await actAs(page, USERS.buyer); // Abel: phone not verified, 2 free listings
  await page.goto('/#/sell');
  await page.getByRole('button', { name: 'Share my phone number' }).click();
  await fillWizard(page, 'Samsung Galaxy A54 128GB', '24000');
  await expect(page.getByText('This listing is free')).toBeVisible();
  await page.getByRole('button', { name: 'Submit listing' }).click();
  await expect(page.getByRole('heading', { name: 'Submitted!' })).toBeVisible();

  await page.goto('/#/mine?tab=review');
  await expect(page.getByText('Samsung Galaxy A54 128GB')).toBeVisible();
});

test('sell (quota used) → pay listing fee → payment submitted', async ({ page }) => {
  await actAs(page, USERS.seller); // Meron: free quota used up
  await page.goto('/#/sell');
  await fillWizard(page, 'Samsung Galaxy A54 256GB', '27000');
  await expect(page.getByText('Listing fee: ETB 100')).toBeVisible();
  await page.getByRole('button', { name: 'Submit listing' }).click();

  await expect(page.getByRole('heading', { name: 'Pay listing fee' })).toBeVisible();
  await expect(page.getByText('0900000000')).toBeVisible();
  await page.getByRole('button', { name: "I've paid — submit" }).click();
  await expect(page.getByText(/Enter the transaction ID/)).toBeVisible();
  await page.getByLabel('Transaction ID').fill('ckk 99 xyz 12');
  await page.getByRole('button', { name: "I've paid — submit" }).click();
  await expect(page.getByRole('heading', { name: "Payment received — we're checking it" })).toBeVisible();
  await expect(page.getByText('CKK99XYZ12')).toBeVisible();
});

test('drafts are saved per step and can be resumed', async ({ page }) => {
  await actAs(page, USERS.buyer);
  await page.goto('/#/sell');
  await page.getByRole('button', { name: 'Share my phone number' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Cover', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Describe your item' })).toBeVisible();

  await page.goto('/#/mine?tab=drafts');
  await expect(page.getByText('Untitled draft')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await expect(page.getByRole('heading', { name: 'Describe your item' })).toBeVisible();
});
