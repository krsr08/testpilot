import { expect, test } from '@playwright/test';

test('offers account recovery and enters the demo workspace', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password');
  await page.getByRole('link', { name: 'Continue to demo workspace' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
});

test('signs out to a dedicated confirmation page', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signed-out$/);
  await expect(page.getByRole('heading', { name: 'You’re signed out' })).toBeVisible();
});
