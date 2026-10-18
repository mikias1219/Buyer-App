import { actAs, expect, test, USERS } from './fixtures';

test('owner lands on the dashboard and sees the full navigation', async ({ page }) => {
  await actAs(page, USERS.owner);
  await page.goto('/');
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByText('Demo mode')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Dashboard', 'Products', 'Sell', 'Sales', 'More']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await nav.getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('link', { name: 'Team', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
});

test('staff land on Sell and cannot open owner screens', async ({ page }) => {
  await actAs(page, USERS.staff);
  await page.goto('/');
  await expect(page).toHaveURL(/#\/sell$/);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'My sales' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await page.goto('/#/more/settings');
  await expect(page.getByText('Owner only')).toBeVisible();
  await page.goto('/#/more');
  await expect(page.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0);
});

test('a user without access sees the no-access screen, no navigation', async ({ page }) => {
  await actAs(page, USERS.stranger);
  await page.goto('/#/dashboard');
  await expect(page.getByText("You don't have access to Demo Shop yet")).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
});

test('owner grants staff access from Team', async ({ page }) => {
  await actAs(page, USERS.owner);
  await page.goto('/#/more/team');
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  await expect(page.getByText('Bethel')).toBeVisible();
  await page.getByRole('button', { name: 'Give access' }).click();
  await expect(page.getByText('Bethel updated')).toBeVisible();
  await expect(page.getByText('No one is waiting')).toBeVisible();
});

test('owner edits settings with validation', async ({ page }) => {
  await actAs(page, USERS.owner);
  await page.goto('/#/more/settings');
  const name = page.getByLabel('Shop name');
  await expect(name).toHaveValue('Demo Shop');
  await name.fill('   ');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Required')).toBeVisible();
  await name.fill('Abebe Electronics');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();
  await page.goto('/#/more');
  await expect(page.getByText('Abebe Electronics')).toBeVisible();
});

test('language switch to Amharic', async ({ page }) => {
  await actAs(page, USERS.owner);
  await page.goto('/#/more');
  await page.getByRole('radio', { name: 'አማርኛ' }).click();
  const nav = page.getByRole('navigation', { name: 'ዋና ማውጫ' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'ዕቃዎች', exact: true })).toBeVisible();
});
