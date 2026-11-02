import { randomBytes } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { test, expect, type Page } from '@playwright/test';

interface Customer {
  firstName: string;
  lastName: string;
  dob: string;
  country: string;
  postalCode: string;
  houseNumber: string;
  phone: string;
  email: string;
  password: string;
}

/* ------------------------------------------------------------ settings */

/** Reads a required setting from the environment (see .env.example). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

/** Domain for generated email addresses. Only the part after the "@" is configurable. */
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? 'example.com';

/* ----------------------------------------------------------- test data */

function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** Country codes confirmed to work in the registration form during exploration. */
const COUNTRY_CODES = ['NG', 'AS', 'AD'];

/** Keeps letters only, so punctuation in a generated name can never trip form validation. */
function lettersOnly(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z]/g, '') || fallback;
}

/**
 * A different, realistic-looking customer on every call. Nothing here is a real person.
 * The password comes from TEST_USER_PASSWORD.
 */
function newCustomer(overrides: Partial<Customer> = {}): Customer {
  const firstName = lettersOnly(faker.person.firstName(), 'Test');
  const lastName = lettersOnly(faker.person.lastName(), 'Customer');
  return {
    firstName,
    lastName,
    // 21 or older, which stays safely above any age limit whatever the time zone
    dob: faker.date.birthdate({ min: 21, max: 65, mode: 'age' }).toISOString().slice(0, 10),
    country: faker.helpers.arrayElement(COUNTRY_CODES),
    postalCode: faker.string.numeric(6),
    houseNumber: faker.string.numeric({ length: { min: 1, max: 3 }, allowLeadingZeros: false }),
    phone: `0${faker.string.numeric(10)}`, // digits only: a leading "+" appears to be rejected
    email: `${firstName}.${lastName}.${uniqueId()}@${EMAIL_DOMAIN}`.toLowerCase(),
    password: overrides.password ?? requireEnv('TEST_USER_PASSWORD'),
    ...overrides,
  };
}

/** A random password that is valid in format but wrong for any account. */
function randomWrongPassword(): string {
  return `Aa1!${randomBytes(8).toString('hex')}`;
}

/** A random password with no upper-case letter, which the site appears to reject. */
function passwordWithoutUpperCase(): string {
  return `weak!${randomBytes(6).toString('hex')}1`;
}

/* ------------------------------------------------------------- actions */

async function openRegistrationForm(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('nav-sign-in').click();
  await page.getByTestId('register-link').click();
  await expect(page.getByRole('heading', { name: 'Customer registration' })).toBeVisible();
}

async function fillRegistrationForm(page: Page, c: Customer): Promise<void> {
  await page.getByTestId('first-name').fill(c.firstName);
  await page.getByTestId('last-name').fill(c.lastName);
  await page.getByTestId('dob').fill(c.dob);
  await page.getByTestId('country').selectOption(c.country);
  await page.getByTestId('postal_code').fill(c.postalCode);
  await page.getByTestId('house_number').fill(c.houseNumber);
  await page.getByTestId('phone').fill(c.phone);
  await page.getByTestId('email').fill(c.email);
  await page.getByTestId('password').fill(c.password);
}

/** Registers through the UI and waits for the redirect to the login page. */
async function registerCustomer(page: Page, c: Customer): Promise<void> {
  await openRegistrationForm(page);
  await fillRegistrationForm(page, c);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/auth\/login/);
}

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill(password);
  await page.getByTestId('login-submit').click();
}

/* --------------------------------------------------------------- tests */

test.describe('Authentication', () => {
  // Flow 1: a visitor reaches the login page
  test.describe('Login page', () => {
    test('Sign in opens the login page with links to register and recover a password @smoke', async ({
      page,
    }) => {
      // Arrange
      await page.goto('/');

      // Act
      await page.getByTestId('nav-sign-in').click();

      // Assert
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
      await expect(page.getByTestId('register-link')).toBeVisible();
      await expect(page.getByTestId('forgot-password-link')).toBeVisible();
    });

    test('the Google button opens a Google sign-in window @external', async ({ page }) => {
      // Arrange: This depends on Google being reachable
      await page.goto('/auth/login');
      const popupPromise = page.waitForEvent('popup');

      // Act
      await page.getByRole('button', { name: 'Sign in with Google' }).click();

      // Assert: we only check that the window opens, never automate Google's own pages
      const popup = await popupPromise;
      await expect(popup).toHaveURL(/google\.com/);
    });
  });

  // Flow 2: a new visitor registers
  test.describe('Registration', () => {
    test('a new customer can register and is sent to the login page @smoke', async ({ page }) => {
      // Arrange
      const customer = newCustomer();

      // Act + Assert: the helper submits the form and waits for the login redirect
      await registerCustomer(page, customer);
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    });

    test('registration with an invalid phone number is rejected', async ({ page }) => {
      // Arrange: a "+" in the phone number appears to be rejected (confirm by hand)
      const customer = newCustomer({ phone: `+${faker.string.numeric(10)}` });
      await openRegistrationForm(page);
      await fillRegistrationForm(page, customer);

      // Act
      await page.getByTestId('register-submit').click();

      // Assert
      await expect(page).toHaveURL(/\/auth\/register/);
    });

    test('a password without an upper-case letter is rejected', async ({ page }) => {
      // Arrange: the site appears to reject a password with no upper-case letter 
      const customer = newCustomer({ password: passwordWithoutUpperCase() });
      await openRegistrationForm(page);
      await fillRegistrationForm(page, customer);

      // Act
      await page.getByTestId('register-submit').click();

      // Assert
      await expect(page).toHaveURL(/\/auth\/register/);
    });

    test('registering an email that is already in use is rejected', async ({ page }) => {
      // Arrange: register a customer, then try the same email again.
     
      const first = newCustomer();
      await registerCustomer(page, first);
      const second = newCustomer({ email: first.email });
      await openRegistrationForm(page);
      await fillRegistrationForm(page, second);

      // Act
      await page.getByTestId('register-submit').click();

      // Assert: the second registration must not succeed
      await expect(page).toHaveURL(/\/auth\/register/);
    });
  });

  // Flow 3: a registered customer logs in
  test.describe('Login', () => {
    test('a registered customer can log in and sees their name @smoke', async ({ page }) => {
      // Arrange: register through the UI.

      const customer = newCustomer();
      await registerCustomer(page, customer);

      // Act
      await logIn(page, customer.email, customer.password);

      // Assert
      await expect(page.getByTestId('nav-menu')).toContainText(
        `${customer.firstName} ${customer.lastName}`,
      );
    });

    test('login with a wrong password is rejected', async ({ page }) => {
      // Arrange
      await page.goto('/auth/login');

      // Act
      await logIn(page, `nobody@${EMAIL_DOMAIN}`, randomWrongPassword());

      // Assert: still on the login page.
      // TODO: once you have inspected the error message, assert on its text too.
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  });

  // Flow 4: a customer forgot the password
  test.describe('Forgot password', () => {
    test('the forgot password link opens its page', async ({ page }) => {
      // Arrange
      await page.goto('/auth/login');

      // Act
      await page.getByTestId('forgot-password-link').click();

      // Assert
      await expect(page.getByRole('heading', { name: 'Forgot Password' })).toBeVisible();
      await expect(page.getByTestId('forgot-password-submit')).toBeVisible();
    });

    test.fixme('requesting a reset shows a confirmation', async ({ page }) => {
      // Arrange
      await page.goto('/auth/login');
      await page.getByTestId('forgot-password-link').click();
      await page.getByTestId('email').fill(`qa.reset@${EMAIL_DOMAIN}`);

      // Act: submit ONCE (suspected defect #4: two clicks were needed in the recording)
      await page.getByTestId('forgot-password-submit').click();

      // Assert: TODO submit once by hand, note the confirmation text, assert it, remove .fixme
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
});