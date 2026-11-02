import { faker } from '@faker-js/faker';
import { test, expect, type Page } from '@playwright/test';

interface Address {
  country: string;
  postalCode: string;
  houseNumber: string;
  street: string;
  city: string;
  state: string;
}

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

interface ProductRef {
  searchTerm: string;
  productName: string;
}

const STANDARD_PRODUCT: ProductRef = { searchTerm: 'plier', productName: 'Combination Pliers' };

/** Reads a required setting from the environment (see .env.example). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? 'example.com';

function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** Keeps letters only, so punctuation in a generated name can never trip form validation. */
function lettersOnly(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z]/g, '') || fallback;
}

/**
 * Country profiles the test generator picks from. Each profile keeps country, postal codes,
 * cities and states consistent with each other, so a generated customer or address looks real.
 * Only Nigeria is confirmed to pass validation today; add more profiles here once you
 * verify them by hand.
 */
interface CountryProfile {
  code: string;
  /** Returns a different postal code on every call, in a format the form accepts. */
  generatePostalCode: () => string;
  cities: string[];
  states: string[];
}

const COUNTRY_PROFILES: CountryProfile[] = [
  {
    code: 'NG',
    // Nigerian postal codes are 6 digits; the first digit is the region, and '1' is Lagos.
    // Generated inside the Lagos range so the city and state stay consistent.
    generatePostalCode: () => `1${faker.string.numeric(5)}`,
    cities: ['Lagos', 'Ipaja', 'Ikeja', 'Ikorodu', 'Surulere', 'Yaba', 'Lekki', 'Victoria Island'],
    states: ['Lagos'],
  },
];

/** Picks one random profile, so every generated customer or address gets a different mix. */
function pickProfile(): CountryProfile {
  return faker.helpers.arrayElement(COUNTRY_PROFILES);
}

/**
 * A different, realistic-looking customer on every call. Nothing here is a real person.
 * Country, postal code, city and state come from the same country profile.
 */
function newCustomer(): Customer {
  const firstName = lettersOnly(faker.person.firstName(), 'Test');
  const lastName = lettersOnly(faker.person.lastName(), 'Customer');
  const profile = pickProfile();
  return {
    firstName,
    lastName,
    // 21 or older, which stays safely above any age limit whatever the time zone
    dob: faker.date.birthdate({ min: 21, max: 65, mode: 'age' }).toISOString().slice(0, 10),
    country: profile.code,
    postalCode: profile.generatePostalCode(),
    houseNumber: faker.string.numeric({ length: { min: 1, max: 3 }, allowLeadingZeros: false }),
    street: `${faker.string.numeric({ length: { min: 1, max: 3 }, allowLeadingZeros: false })} Test Street`,
    city: faker.helpers.arrayElement(profile.cities),
    state: faker.helpers.arrayElement(profile.states),
    phone: `0${faker.string.numeric(10)}`, // digits only
    email: `${firstName}.${lastName}.${uniqueId()}@${EMAIL_DOMAIN}`.toLowerCase(),
    password: requireEnv('TEST_USER_PASSWORD'),
  };
}

function newAddress(): Address {
  const profile = pickProfile();
  return {
    country: profile.code,
    postalCode: profile.generatePostalCode(),
    houseNumber: faker.string.numeric({ length: { min: 1, max: 3 }, allowLeadingZeros: false }),
    street: `${faker.string.numeric({ length: { min: 1, max: 3 }, allowLeadingZeros: false })} Test Street`,
    city: faker.helpers.arrayElement(profile.cities),
    state: faker.helpers.arrayElement(profile.states),
  };
}

/** Arrange helper: finds a product through search and adds it, waiting for the toast. */
async function addProductToCart(page: Page, product: ProductRef, extraUnits = 0): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('product-name').first()).toBeVisible();
  await page.getByTestId('search-query').fill(product.searchTerm);
  await page.getByTestId('search-submit').click();
  await expect(page.getByText(`Searched for: ${product.searchTerm}`)).toBeVisible();
  await page.getByTestId('product-name').filter({ hasText: product.productName }).click();
  await expect(page).toHaveURL(/\/product\//);
  await expect(page.getByTestId('product-name')).toContainText(product.productName);
  for (let i = 0; i < extraUnits; i++) {
    await page.getByTestId('increase-quantity').click();
  }
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByRole('alert', { name: 'Product added to shopping' })).toBeVisible();
}

async function openCart(page: Page): Promise<void> {
  await page.getByTestId('nav-cart').click();
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

/** Registers a brand-new, randomly generated customer through the UI and logs in. */
async function registerAndLogIn(page: Page): Promise<void> {
  const customer = newCustomer();
  await page.goto('/');
  await page.getByTestId('nav-sign-in').click();
  await page.getByTestId('register-link').click();
  await expect(page.getByRole('heading', { name: 'Customer registration' })).toBeVisible();
  await page.getByTestId('first-name').fill(customer.firstName);
  await page.getByTestId('last-name').fill(customer.lastName);
  await page.getByTestId('dob').fill(customer.dob);
  await page.getByTestId('country').selectOption(customer.country);
  await page.getByTestId('postal_code').fill(customer.postalCode);
  await page.getByTestId('house_number').fill(customer.houseNumber);
  await page.getByTestId('street').fill(customer.street);
  await page.getByTestId('city').fill(customer.city);
  await page.getByTestId('state').fill(customer.state);
  await page.getByTestId('phone').fill(customer.phone);
  await page.getByTestId('email').fill(customer.email);
  await page.getByTestId('password').fill(customer.password);
  await submitRegistration(page, customer);
  // Wait for the Login page to actually finish rendering before touching its form.
  // In CI's slower runner the URL changes before the inputs are mounted, which caused a
  // 30s timeout on `getByTestId('email').fill(...)` below.
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.getByTestId('email')).toBeVisible();
  await page.getByTestId('email').fill(customer.email);
  await page.getByTestId('password').fill(customer.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('nav-menu')).toContainText(
    `${customer.firstName} ${customer.lastName}`,
  );
}

async function fillAddress(page: Page, a: Address): Promise<void> {
  await page.getByTestId('country').selectOption(a.country);
  await page.getByTestId('postal_code').fill(a.postalCode);
  await page.getByTestId('house_number').fill(a.houseNumber);
  await page.getByTestId('street').fill(a.street);
  await page.getByTestId('city').fill(a.city);
  await page.getByTestId('state').fill(a.state);
}

/** From the cart page, checks out as a logged-in customer and stops on the payment step. */
async function checkoutAsCustomerToPayment(page: Page, address: Address): Promise<void> {
  await page.getByTestId('proceed-1').click();
  await page.getByTestId('proceed-2').click();
  await expect(page.getByRole('heading', { name: 'Billing Address' })).toBeVisible();
  await fillAddress(page, address);
  await page.getByTestId('proceed-3').click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
}

test.describe('Checkout', () => {
  // Flow 1: entering checkout
  test.describe('Entering checkout', () => {
    test('opening /checkout directly with an empty cart does not break the page', async ({
      page,
    }) => {
      // Act
      await page.goto('/checkout');

      // Assert: the shop still renders. TODO: once you know what a visitor SHOULD see
      // (an empty-cart message or a redirect), assert that too.
      await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible();
    });
  });

  // Flow 2: a registered customer buys
  test.describe('Customer checkout', () => {
    test('a logged-in customer can move through the steps to payment @smoke', async ({ page }) => {
      // Arrange: a new customer with a product in the cart
      await registerAndLogIn(page);
      await addProductToCart(page, STANDARD_PRODUCT, 2);
      await openCart(page);

      // Act
      await checkoutAsCustomerToPayment(page, newAddress());

      // Assert
      await expect(page.getByTestId('payment-method')).toBeVisible();
      await expect(page.getByTestId('finish')).toBeVisible();
    });

    test.fixme('a logged-in customer can pay cash on delivery and gets an order confirmation', async ({
      page,
    }) => {
      // Arrange: a new customer at the payment step
      await registerAndLogIn(page);
      await addProductToCart(page, STANDARD_PRODUCT, 2);
      await openCart(page);
      await checkoutAsCustomerToPayment(page, newAddress());

      // Act
      await page.getByTestId('payment-method').selectOption('cash-on-delivery');
      await page.getByTestId('finish').click();

      // Assert: TODO place one order by hand as a customer and note what appears.
      // Then assert the real confirmation, check that the cart is empty, and check that
      // the order shows under the user menu > My account > Invoices. Remove .fixme.
      await expect(page.getByTestId('finish')).toBeHidden();
    });
  });

  // Flow 3: the payment step
  test.describe('Payment methods', () => {
    test('a logged-in customer choosing credit card sees the card fields', async ({ page }) => {
      // Arrange: a new customer at the payment step
      await registerAndLogIn(page);
      await addProductToCart(page, STANDARD_PRODUCT);
      await openCart(page);
      await checkoutAsCustomerToPayment(page, newAddress());

      // Act
      await page.getByTestId('payment-method').selectOption('credit-card');

      // Assert
      await expect(page.getByTestId('credit_card_number')).toBeVisible();
      await expect(page.getByTestId('expiration_date')).toBeVisible();
    });
  });
});