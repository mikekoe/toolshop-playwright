/**
 * Auth setup — runs once per test run as a Playwright setup project.
 *
 * What it does:
 *   1. Generates a unique throwaway customer.
 *   2. Registers them via POST /users/register — bypasses Cloudflare
 *      because the API subdomain isn't behind the bot challenge.
 *   3. Logs them in via POST /users/login to get a bearer token.
 *   4. Opens a browser context, navigates to the frontend, and injects
 *      the token into localStorage under the key Angular reads (`auth-token`).
 *   5. Saves the full storageState (cookies + localStorage) to
 *      `playwright/.auth/customer.json`.
 */

import { test as setup, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { randomUUID } from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com';
const FRONTEND_BASE_URL = process.env.BASE_URL ?? 'https://practicesoftwaretesting.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const TEST_EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? 'example.com';

// The key Angular reads from localStorage on page load. Confirmed by
// inspecting DevTools > Application > Local Storage after a UI login.
// If the frontend ever renames it, this is the one line to update.
const AUTH_TOKEN_KEY = 'auth-token';

const AUTH_FILE = path.resolve('playwright/.auth/customer.json');

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
if (!TEST_USER_PASSWORD) {
  throw new Error(
    'TEST_USER_PASSWORD must be set in .env to register a customer in the auth setup',
  );
}

// faker sometimes produces names with apostrophes or accents; the register
// endpoint rejects them. Keep letters only.
const lettersOnly = (s: string): string => s.replace(/[^A-Za-z]/g, '');

setup('register, log in, and save a logged-in browser state', async ({ page, request }) => {
  // Step 1: generate a unique throwaway customer
  const uniqueTag = `setup-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${uniqueTag}@${TEST_EMAIL_DOMAIN}`;

  const customer = {
    first_name: lettersOnly(faker.person.firstName()) || 'Setup',
    last_name: lettersOnly(faker.person.lastName()) || 'User',
    dob: '1990-01-01',
    email,
    password: TEST_USER_PASSWORD,
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

  // Step 2: register via API
  const registerResponse = await request.post(`${API_BASE_URL}/users/register`, {
    data: customer,
  });
  expect(registerResponse.status(), `Register failed: ${await registerResponse.text()}`).toBe(201);
  const registered = (await registerResponse.json()) as RegisterResponse;

  // Step 3: log in via API
  const loginResponse = await request.post(`${API_BASE_URL}/users/login`, {
    data: { email: customer.email, password: customer.password },
  });
  expect(loginResponse.status(), `Login failed: ${await loginResponse.text()}`).toBe(200);
  const { access_token } = (await loginResponse.json()) as LoginResponse;
  expect(access_token.length).toBeGreaterThan(10);

  // Step 4: open the frontend, inject the token into localStorage.
  // We must navigate before setting localStorage — localStorage is scoped
  // to the origin, and setting it requires the page to be on that origin.
  await page.goto(FRONTEND_BASE_URL);
  await page.evaluate(
    ([key, token]) => {
      window.localStorage.setItem(key, token);
    },
    [AUTH_TOKEN_KEY, access_token],
  );

  // Step 5: save the full storageState (cookies + localStorage) for other tests.
  await page.context().storageState({ path: AUTH_FILE });

  // Sanity-check: reload and confirm the frontend treats us as logged in.
  // We assert on a stable, data-test-anchored signal — the sign-in link
  // disappears from the nav when a session is active.
  await page.goto(FRONTEND_BASE_URL);
  await expect(page.getByTestId('nav-sign-in')).toBeHidden();

  console.log(
    `[auth.setup] Registered ${email} (id ${registered.id}), storageState saved to ${path.relative(process.cwd(), AUTH_FILE)}`,
  );
});
