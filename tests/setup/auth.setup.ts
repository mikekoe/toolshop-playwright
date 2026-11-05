/**
 * Auth setup — runs once per test run as a Playwright setup project.
 *   See README > Known limitations for the full story.
 */

import { test as setup, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com';
const FRONTEND_BASE_URL = process.env.BASE_URL ?? 'https://practicesoftwaretesting.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const TEST_EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? 'example.com';
const IS_CI = Boolean(process.env.CI);

// The key Angular reads from localStorage on page load.
const AUTH_TOKEN_KEY = 'auth-token';

const AUTH_FILE = path.resolve('playwright/.auth/customer.json');
const CREDENTIALS_FILE = path.resolve('playwright/.auth/credentials.json');

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface RegisterResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  created_at: string;
  address: {
    street: string;
    house_number: string | null;
    city: string;
    state: string;
    country: string;
    postal_code: string;
  };
}

// Precondition — module-level so there's no conditional inside the setup body.
// Only checked for local runs; CI skips the setup entirely.
if (!IS_CI && !TEST_USER_PASSWORD) {
  throw new Error(
    'Local run: TEST_USER_PASSWORD must be set in .env to register a throwaway customer.',
  );
}

// faker sometimes produces names with apostrophes or accents; the register
// endpoint rejects them. Keep letters only.
const lettersOnly = (s: string): string => s.replace(/[^A-Za-z]/g, '');

setup('register, log in, and save a logged-in browser state', async ({ page, request }) => {
  // eslint-disable-next-line playwright/no-skipped-test
  setup.skip(
    IS_CI,
    'Toolshop API rejects register from shared CI runner IPs (500) and reaps ' +
      'pre-registered accounts too quickly to use as a workaround. ' +
      'Auth-dependent tests run locally only. See README > Known limitations.',
  );

  // Register a fresh throwaway customer via API
  const uniqueTag = `setup-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${uniqueTag}@${TEST_EMAIL_DOMAIN}`;
  const password = TEST_USER_PASSWORD!;

  const customer = {
    first_name: lettersOnly(faker.person.firstName()) || 'Setup',
    last_name: lettersOnly(faker.person.lastName()) || 'User',
    dob: '1990-01-01',
    email,
    password,
    phone: `080${faker.string.numeric(8)}`,
    address: {
      street: '12 Setup Street',
      city: 'Lagos',
      state: 'Lagos',
      country: 'NG',
      postal_code: '100001',
      house_number: '12',
    },
  };

  const registerResponse = await request.post(`${API_BASE_URL}/users/register`, {
    data: customer,
  });
  expect(registerResponse.status(), `Register failed: ${await registerResponse.text()}`).toBe(201);
  const registered = (await registerResponse.json()) as RegisterResponse;
  const userId = registered.id;

  // Log in via API to get a bearer token
  const loginResponse = await request.post(`${API_BASE_URL}/users/login`, {
    data: { email, password },
  });
  expect(loginResponse.status(), `Login failed: ${await loginResponse.text()}`).toBe(200);
  const { access_token } = (await loginResponse.json()) as LoginResponse;
  expect(access_token.length).toBeGreaterThan(10);

  // Open the frontend, inject the token into localStorage
  await page.goto(FRONTEND_BASE_URL);
  await page.evaluate(
    ([key, token]) => {
      window.localStorage.setItem(key, token);
    },
    [AUTH_TOKEN_KEY, access_token],
  );

  // Save the full storageState (cookies + localStorage) for UI tests
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });

  // Save credentials for API tests to read
  const credentials = {
    email,
    password,
    userId,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), 'utf-8');

  // Sanity-check: reload and confirm the frontend treats us as logged in
  await page.goto(FRONTEND_BASE_URL);
  await expect(page.getByTestId('nav-sign-in')).toBeHidden();

  console.log(
    `[auth.setup] Logged in as ${email} (id ${userId}), storageState saved to ${path.relative(process.cwd(), AUTH_FILE)}`,
  );
});
