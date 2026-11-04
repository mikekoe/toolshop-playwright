import { test as setup, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.practicesoftwaretesting.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const TEST_EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? 'example.com';

const AUTH_DIR = path.resolve('playwright/.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'customer.json');

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

// faker sometimes produces names with apostrophes or accents; Toolshop's
// register endpoint rejects them. Keep letters only.
const lettersOnly = (s: string): string => s.replace(/[^A-Za-z]/g, '');

if (!TEST_USER_PASSWORD) {
  throw new Error(
    'TEST_USER_PASSWORD must be set in .env to register a customer in the auth setup',
  );
}

setup('register and log in a throwaway customer', async ({ request }) => {
  // Generate a unique customer so parallel / repeat runs do not collide
  const uniqueTag = `setup-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${uniqueTag}@${TEST_EMAIL_DOMAIN}`;

  const customer = {
    first_name: lettersOnly(faker.person.firstName()) || 'Setup',
    last_name: lettersOnly(faker.person.lastName()) || 'User',
    dob: '1990-01-01',
    email,
    password: TEST_USER_PASSWORD!,
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

  // Step 1: register
  const registerResponse = await request.post(`${API_BASE_URL}/users/register`, {
    data: customer,
  });
  expect(registerResponse.status(), `Register failed: ${await registerResponse.text()}`).toBe(201);
  const registered = (await registerResponse.json()) as RegisterResponse;

  // Step 2: log in
  const loginResponse = await request.post(`${API_BASE_URL}/users/login`, {
    data: { email: customer.email, password: customer.password },
  });
  expect(loginResponse.status(), `Login failed: ${await loginResponse.text()}`).toBe(200);
  const { access_token } = (await loginResponse.json()) as LoginResponse;
  expect(access_token.length).toBeGreaterThan(10);

  // Step 3: save the session cookies to a file so Playwright tests can use them
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const session = {
    token: access_token,
    email: customer.email,
    password: customer.password,
    user: registered,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), 'utf-8');

  console.log(
    `[auth.setup] Registered ${email}, token saved to ${path.relative(process.cwd(), AUTH_FILE)}`,
  );
});
