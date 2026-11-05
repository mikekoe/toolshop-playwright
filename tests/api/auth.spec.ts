/**
 * API tests for the Toolshop authentication endpoints.
 
 * See README > Known limitations.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

/* ------------------------------------------------------------ settings */

/** Host for Toolshop API calls. Set API_BASE_URL in .env to target another environment. */
const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com';

/** Path to the credentials file the setup project writes before each run. */
const CREDENTIALS_FILE = path.resolve('playwright/.auth/credentials.json');

/**
 * Credentials of the throwaway customer the setup project creates.
 * Setup registers a fresh customer per run, so these are always valid locally.
 */
interface Credentials {
  email: string;
  password: string;
  userId: string;
  generatedAt: string;
}

/** Reads the throwaway customer's credentials from the setup-project output. */
function readCredentials(): Credentials {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    throw new Error(
      `Missing ${CREDENTIALS_FILE}. Run the setup project first:\n` +
        `  npx playwright test --project=setup`,
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8')) as Credentials;
}

/* ------------------------------------------------------- response shapes */

/**
 * Success body returned by POST /users/login. Captured from the Network tab;
 * see docs/api.md for the full discovery notes.
 */
interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Error body returned by POST /users/login when credentials are wrong. */
interface LoginError {
  error: string;
}

/** Error body returned by GET /users/me without (or with an invalid) token. */
interface UnauthorizedError {
  message: string;
}

/* --------------------------------------------------------------- tests */

test.describe('API: Authentication', () => {
  test('POST /users/login with wrong credentials returns 401', async ({ request }) => {
    // Act
    const response = await request.post(`${API_BASE_URL}/users/login`, {
      data: {
        email: 'nobody@example.com',
        password: 'definitely-wrong-password',
      },
    });

    // Assert: status + the login endpoint's error shape (note: `error`, not `message`)
    expect(response.status()).toBe(401);
    const body = (await response.json()) as LoginError;
    expect(body.error).toBe('Unauthorized');
  });

  test('POST /users/login with correct credentials returns a bearer token @smoke', async ({
    request,
  }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(
      !fs.existsSync(CREDENTIALS_FILE),
      'No credentials file — setup skipped (likely CI). See README > Known limitations.',
    );

    // Arrange
    const { email, password } = readCredentials();

    // Act
    const response = await request.post(`${API_BASE_URL}/users/login`, {
      data: { email, password },
    });

    // Assert: status + the LoginResponse shape from docs/api.md
    expect(response.status()).toBe(200);
    const body = (await response.json()) as LoginResponse;
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(10);
    expect(body.token_type).toBe('bearer');
    expect(body.expires_in).toBe(300);
  });

  test('GET /users/me with a valid token returns the current user @smoke', async ({ request }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(
      !fs.existsSync(CREDENTIALS_FILE),
      'No credentials file — setup skipped (likely CI). See README > Known limitations.',
    );

    // Arrange: log in to get a bearer token
    const { email, password } = readCredentials();
    const loginResponse = await request.post(`${API_BASE_URL}/users/login`, {
      data: { email, password },
    });
    expect(loginResponse.status()).toBe(200);
    const { access_token } = (await loginResponse.json()) as LoginResponse;

    // Act: call /users/me with the Bearer token
    const meResponse = await request.get(`${API_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // Assert: 200 + a non-empty object (tighten once the /users/me 200 shape is confirmed)
    expect(meResponse.status()).toBe(200);
    const user = (await meResponse.json()) as Record<string, unknown>;
    expect(user).toBeTruthy();
    expect(Object.keys(user).length).toBeGreaterThan(0);
  });

  test('GET /users/me without a token returns 401', async ({ request }) => {
    // Act
    const response = await request.get(`${API_BASE_URL}/users/me`);

    // Assert: status + the /users/me error shape (note: `message`, not `error`)
    expect(response.status()).toBe(401);
    const body = (await response.json()) as UnauthorizedError;
    expect(body.message).toBe('Unauthorized');
  });
});
