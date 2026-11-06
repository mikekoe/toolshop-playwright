import dotenv from 'dotenv';
import fs from 'fs';
import { defineConfig, devices } from '@playwright/test';

dotenv.config({ override: true });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const STORAGE_STATE_PATH = 'playwright/.auth/customer.json';

/**
 * Use the saved storageState if the setup project wrote one (local runs).
 * Fall back to an empty logged-out state otherwise (CI, where setup skips
 * because Toolshop blocks shared runner IPs). See README > Known limitations.
 */
const storageState = fs.existsSync(STORAGE_STATE_PATH)
  ? STORAGE_STATE_PATH
  : { cookies: [], origins: [] };

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  globalTimeout: 60 * 60 * 1000,
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? 'blob' : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  expect: {
    timeout: 10_000,
  },

  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'https://practicesoftwaretesting.com',
    testIdAttribute: 'data-test',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /.*setup\.ts/,
    },
    {
      name: 'chromium',
      testIgnore: /.*setup\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState },
    },
    ...(process.env.CROSS_BROWSER
      ? [
          { name: 'firefox', testIgnore: /.*setup\.ts/, use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', testIgnore: /.*setup\.ts/, use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
});
