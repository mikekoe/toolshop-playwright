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
  street: string;
  city: string;
  state: string;
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

/** Keeps letters only, so punctuation in a generated name can never trip form validation. */
function lettersOnly(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z]/g, '') || fallback;
}

/**
 * Country profiles the test generator picks from. Each profile keeps country, postal codes,
 * cities and states consistent with each other, so a generated customer looks real.
 * Only Nigeria is confirmed to pass registration validation today; add more profiles here
 * once you verify them by hand.
 */
interface CountryProfile {
  code: string;
  postalCodes: string[];
  cities: string[];
  states: string[];
}

const COUNTRY_PROFILES: CountryProfile[] = [
  {
    code: 'NG',
    postalCodes: ['100001', '101001', '102001', '830303'],
    cities: ['Lagos', 'Ipaja', 'Ikeja', 'Ikorodu', 'Surulere', 'Yaba', 'Lekki', 'Victoria Island'],
    states: ['Lagos'],
  },
];

/** Picks one random profile, so every generated customer gets a different country mix. */
function pickProfile(): CountryProfile {
  return COUNTRY_PROFILES[randomInt(0, COUNTRY_PROFILES.length - 1)];
}

/** One random item from a list, typed to match the list's own type. */
function pickFrom<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/** A whole number from min to max, both included. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A string of random digits, for example randomDigits(6) gives "480213". */
function randomDigits(length: number): string {
  let digits = '';
  for (let i = 0; i < length; i++) {
    digits += randomInt(0, 9);
  }
  return digits;
}

/** A date of birth that makes the customer between 22 and 65 years old, as YYYY-MM-DD. */
function randomDateOfBirth(): string {
  const year = new Date().getFullYear() - randomInt(22, 65);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0'); // 28 is valid in every month
  return `${year}-${month}-${day}`;
}

/**
 * A different, realistic-looking customer on every call. Nothing here is a real person.
 * The password comes from TEST_USER_PASSWORD.
 */
function newCustomer(overrides: Partial<Customer> = {}): Customer {
  const firstName = lettersOnly(faker.person.firstName(), 'Test');
  const lastName = lettersOnly(faker.person.lastName(), 'Customer');
  const profile = pickProfile();
  return {
    firstName,
    lastName,
    dob: randomDateOfBirth(),
    country: profile.code,
    postalCode: pickFrom(profile.postalCodes),
    houseNumber: String(randomInt(1, 999)),
    street: `${randomInt(1, 999)} Test Street`,
    city: pickFrom(profile.cities),
    state: pickFrom(profile.states),
    phone: `0${randomDigits(10)}`, // digits only: a leading "+" appears to be rejected
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
  await page.getByTestId('street').fill(c.street);
  await page.getByTestId('city').fill(c.city);
  await page.getByTestId('state').fill(c.state);
  await page.getByTestId('phone').fill(c.phone);
  await page.getByTestId('email').fill(c.email);
  await page.getByTestId('password').fill(c.password);
}

/**
 * Explains why a form is refusing to submit: the messages it shows, which fields are invalid,
 * and its visible text (without the long dropdown lists, which hide everything else).
 */
async function describeFormProblems(page: Page): Promise<string> {
  const messages = (
    await page
      .locator('[data-test$="-error"], .alert, .invalid-feedback, .text-danger, [role="alert"]')
      .allInnerTexts()
  )
    .map((message) => message.trim())
    .filter(Boolean);

  const form = page.locator('form').first();
  const invalidFields = await form
    .evaluate((el) =>
      Array.from(el.querySelectorAll('.ng-invalid[data-test], :invalid'))
        .map((node) => node.getAttribute('data-test') ?? node.tagName.toLowerCase())
        .filter((name, index, all) => all.indexOf(name) === index),
    )
    .catch(() => [] as string[]);
  const visibleText = await form
    .evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('select').forEach((node) => node.remove());
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    })
    .catch(() => '');
  const submitDisabled = await page
    .getByTestId('register-submit')
    .isDisabled()
    .catch(() => 'unknown');

  return [
    `Messages shown: ${messages.join(' | ') || 'none'}`,
    `Invalid fields: ${invalidFields.join(', ') || 'none found'}`,
    `Submit button disabled: ${submitDisabled}`,
    `Form text without dropdowns: ${visibleText.slice(0, 500)}`,
  ].join('\n');
}

/**
 * Waits for the login page after the registration form is submitted. If the form refuses the
 * data, the failure reports which requests were sent, what the form showed and the data used.
 */
async function expectRegistrationAccepted(
  page: Page,
  c: Customer,
  requests: string[],
): Promise<void> {
  try {
    await expect(page).toHaveURL(/\/auth\/login/);
  } catch (error) {
    throw new Error(
      `Registration was not accepted.\n` +
        `Requests sent: ${requests.join(' || ') || 'none (the form sent nothing)'}\n` +
        `${await describeFormProblems(page)}\n` +
        `Data used: ${JSON.stringify({ ...c, password: '<hidden>' })}`,
      { cause: error },
    );
  }
}

/** Submits the registration form and waits for the login page. */
async function submitRegistration(page: Page, c: Customer): Promise<void> {
  const requests: string[] = [];
  page.on('response', async (response) => {
    // Ignore the site's own analytics beacons (/cdn-cgi/), which are not the registration
    if (response.request().method() === 'POST' && !response.url().includes('/cdn-cgi/')) {
      const body = await response.text().catch(() => '');
      requests.push(`${response.status()} ${response.url()} ${body.slice(0, 300)}`);
    }
  });
  // Leave the last field first. The form validates on blur, which can move the button and
  // swallow the click (your recordings needed a second click for this reason).
  await page.getByTestId('password').blur();
  await page.getByTestId('register-submit').click();
  await expectRegistrationAccepted(page, c, requests);
}

/** Registers through the UI and waits for the redirect to the login page. */
async function registerCustomer(page: Page, c: Customer): Promise<void> {
  await openRegistrationForm(page);
  await fillRegistrationForm(page, c);
  await submitRegistration(page, c);
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
      // Arrange: depends on Google being reachable, so tag @external and keep out of smoke runs
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
      const customer = newCustomer({ phone: `+${randomDigits(10)}` });
      await openRegistrationForm(page);
      await fillRegistrationForm(page, customer);

      // Act
      await page.getByTestId('register-submit').click();

      // Assert
      await expect(page).toHaveURL(/\/auth\/register/);
    });

    test('a password without an upper-case letter is rejected', async ({ page }) => {
      // Arrange: inferred from your recording, where adding capitals fixed the password
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
      // SUSPECTED DEFECT #1: if this fails, repeat it by hand before reporting a bug.
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
      // Week 3 idea: create the customer through the API instead, which is faster.
      const customer = newCustomer();
      await registerCustomer(page, customer);
      // Wait for the Login page itself before filling it (CI timing).
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
      await expect(page.getByTestId('email')).toBeVisible();

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
