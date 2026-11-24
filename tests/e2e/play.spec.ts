import { mkdir } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const catalogHeading = 'A little rivalry. A good time.';
const playLink = (game: string) => 'Create private room · ' + game;
const fixture = [
  { game: 'Tic-Tac-Toe', moves: [0, 3, 1, 4, 2], isGrid: true },
  { game: 'Four in a Row', moves: [0, 0, 1, 1, 2, 2, 3], isGrid: false },
];

async function saveShot(page: Page, name: string) {
  const output = process.env.TABLEMATE_QA_SCREENSHOTS;
  if (!output) return;
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' });
}

test('CAT-01 · catalog has two games and accessible navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: catalogHeading })).toBeVisible();
  await expect(page.getByRole('link', { name: /Create private room ·/ })).toHaveCount(2);
  await expect(page.getByRole('link', { name: playLink('Tic-Tac-Toe'), exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: playLink('Four in a Row'), exact: true })).toBeVisible();
  for (const { game } of fixture) {
    const callToAction = await page.getByRole('link', { name: playLink(game), exact: true }).boundingBox();
    expect(callToAction).not.toBeNull();
    expect(callToAction!.y + callToAction!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await saveShot(page, 'catalog-desktop-en');
});

for (const sample of fixture) {
  test(sample.game + ' · isolated browser sessions, live invitation, win, reload and rematch', async ({ browser, baseURL }) => {
    const hostContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 930 } });
    const guestContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: browser.browserType().name() !== 'firefox', hasTouch: true });
    try {
      const host = await hostContext.newPage();
      const guest = await guestContext.newPage();
      await host.goto('/');
      await host.getByRole('link', { name: playLink(sample.game), exact: true }).click();
      await host.getByLabel('Nickname (optional)').fill('Rowan');
      await host.getByRole('button', { name: 'Create private room', exact: true }).click();
      const start = host.getByRole('button', { name: 'Start game', exact: true });
      await expect(start).toBeDisabled();
      const invite = await host.getByRole('textbox', { name: 'Invite a friend', exact: true }).inputValue();
      await guest.goto(invite);
      await expect(guest.getByRole('heading', { name: 'A friend invited you' })).toBeVisible();
      await guest.getByLabel('Nickname (optional)').fill('Dara');
      await guest.getByRole('button', { name: 'Join game', exact: true }).click();
      await expect(guest.getByText("You're in! Waiting for the host to start.")).toBeVisible();
      await expect(guest.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0);
      await expect(start).toBeEnabled();
      await saveShot(host, sample.isGrid ? 'lobby-ready-desktop' : 'four-lobby-ready-desktop');
      await start.click();
      await expect(host).toHaveURL(/\/matches\//);
      await expect(guest).toHaveURL(host.url());
      const opening = await Promise.any([host, guest].map(async (page) => {
        await expect(page.getByText('Your turn.', { exact: true })).toBeVisible();
        return page;
      }));
      const openingPage = opening;
      const otherPage = openingPage === host ? guest : host;
      for (const [ply, position] of sample.moves.entries()) {
        const player = ply % 2 === 0 ? openingPage : otherPage;
        await expect(player.getByText('Your turn.', { exact: true })).toBeVisible();
        const label = sample.isGrid
          ? new RegExp('Row ' + (Math.floor(position / 3) + 1) + ', column ' + (position % 3 + 1) + ', empty', 'i')
          : new RegExp('^Column ' + (position + 1) + ',');
        const square = player.getByRole('button', { name: label });
        await expect(square).toBeEnabled();
        if (sample.isGrid) {
          await square.focus();
          await square.press('Enter');
        } else await square.click();
      }
      await expect(openingPage.getByText('You won!', { exact: true })).toBeVisible();
      await expect(otherPage.getByText(/won this round/)).toBeVisible();
      await saveShot(guest, sample.isGrid ? 'tic-tac-toe-result-mobile-en' : 'four-in-a-row-result-mobile-en');
      const oldUrl = host.url();
      await guest.reload();
      await expect(guest.getByRole('button', { name: 'Request rematch', exact: true })).toBeEnabled();
      await host.getByRole('button', { name: 'Request rematch', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Start rematch', exact: true })).toHaveCount(0);
      await guest.getByRole('button', { name: 'Accept rematch', exact: true }).click();
      await host.getByRole('button', { name: 'Start rematch', exact: true }).click();
      await expect(host).not.toHaveURL(oldUrl);
      await expect(guest).toHaveURL(host.url());
      await expect(otherPage.getByText('Your turn.', { exact: true })).toBeVisible();
      expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
}
