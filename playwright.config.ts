import { defineConfig, devices } from '@playwright/test';

const browser = process.env.TABLEMATE_TEST_BROWSER;
const browserName = browser === 'firefox' || browser === 'webkit' ? browser : 'chromium';

const desktopDevice = browserName === 'firefox' ? 'Desktop Firefox'
  : browserName === 'webkit' ? 'Desktop Safari' : 'Desktop Chrome';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: process.env.TABLEMATE_TEST_ORIGIN ?? 'http://localhost:8080',
    ...devices[desktopDevice],
    browserName,
    ...(browserName === 'chromium' && process.env.TABLEMATE_CHROME === '1' ? { channel: 'chrome' } : {}),
    trace: 'off',
  },
});
