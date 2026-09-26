import { test, expect } from '@playwright/test';

test('keyboard opens, traps focus, and dismisses the create project dialog', async ({ page }) => {
  await page.goto('/projects');
  const create = page.getByRole('button', { name: 'Create project', exact: true });
  await create.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Create project' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Project name' })).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('dialog')) || document.activeElement === document.body)).toBeTruthy();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(create).toBeFocused();
});

test('keyboard opens and dismisses the export dialog with focus restored', async ({ page, request }) => {
  const response = await request.get('/api/v1/projects');
  const { projects } = await response.json();
  expect(projects.length).toBeGreaterThan(0);
  await page.goto(`/projects/${projects[0].id}/traceability`);
  const open = page.getByRole('button', { name: 'Export XLSX', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Export test workbook' });
  await expect(dialog).toBeVisible();
  const radio = dialog.getByRole('radio', { name: /Approved only/ });
  await radio.focus();
  await expect(radio).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: /All cases with review status/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
});

