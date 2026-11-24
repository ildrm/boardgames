import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('UX-02/03/14 · Persian RTL preserves the board, keyboard focus and duplicate-name identity', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext({ baseURL, viewport: { width: 320, height: 720 }, colorScheme: 'light' });
  const guestContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const nickname = 'آرمان‌Smith';
    await host.goto('/');
    await host.getByRole('link', { name: 'Create private room · Tic-Tac-Toe', exact: true }).click();
    await host.getByLabel('Nickname (optional)').fill(nickname);
    await host.getByRole('button', { name: 'Create private room', exact: true }).click();
    const invite = await host.getByRole('textbox', { name: 'Invite a friend' }).inputValue();

    await guest.goto(invite);
    await guest.getByLabel('Nickname (optional)').fill(nickname);
    await guest.getByRole('button', { name: 'Join game', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled();
    await host.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect(host).toHaveURL(/\/matches\//);
    await expect(guest).toHaveURL(host.url());

    await host.getByRole('button', { name: 'تغییر زبان به فارسی' }).click();
    await expect(host.locator('html')).toHaveAttribute('dir', 'rtl');
    const grid = host.getByRole('grid', { name: 'دوز' });
    await expect(grid.locator('..')).toHaveAttribute('dir', 'ltr');
    await expect(host.getByText(nickname, { exact: true })).toHaveCount(2);
    await expect(host.getByText(/شما · میزبان/)).toBeVisible();
    const first = host.getByRole('button', { name: 'ردیف ۱، ستون ۱، خالی' });
    const second = host.getByRole('button', { name: 'ردیف ۱، ستون ۲، خالی' });
    await first.focus();
    await first.press('ArrowRight');
    await expect(second).toBeFocused();
    expect((await second.boundingBox())?.x).toBeGreaterThan((await first.boundingBox())?.x ?? Infinity);

    await host.getByRole('button', { name: 'تنظیمات' }).click();
    const settings = host.getByRole('dialog', { name: 'تنظیمات' });
    await settings.getByLabel('ظاهر').selectOption('dark');
    await settings.getByLabel('کاهش حرکت').check();
    await host.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(host.getByRole('button', { name: 'تنظیمات' })).toBeFocused();
    await expect(host.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(host.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await expect(second).toBeVisible();
    expect(await host.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const output = process.env.TABLEMATE_QA_SCREENSHOTS;
    if (output) {
      await mkdir(output, { recursive: true });
      await host.screenshot({ path: output + '/tic-tac-toe-mobile-fa-dark.png', animations: 'disabled' });
    }
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
