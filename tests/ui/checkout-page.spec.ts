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
  phone: string;
  email: string;
  password: string;
}

interface ProductRef {
  searchTerm: string;
  productName: string;
}

const ECO_PRODUCT: ProductRef = { searchTerm: 'tool', productName: 'Leather toolbelt ECO' };

/** Reads a required setting from the environment  */
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

/** Country codes confirmed to work in the forms during testing. */
const COUNTRY_CODES = ['NG', 'AS', 'AD'];

/** Keeps letters only, so punctuation in a generated name can never trip form validation. */
function lettersOnly(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z]/g, '') || fallback;
}

/** Keeps letters only for place names, but spaces are allowed ("New Haven"). */
function lettersAndSpaces(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z ]/g, '').trim() || fallback;
}

/**
 * A different, realistic-looking customer on every call. Nothing here is a real person.
 * The password comes from TEST_USER_PASSWORD.
 */
function newCustomer(): Customer {
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
    phone: `0${faker.string.numeric(10)}`, // digits only
    email: `${firstName}.${lastName}.${uniqueId()}@${EMAIL_DOMAIN}`.toLowerCase(),
    password: requireEnv('TEST_USER_PASSWORD'),
  };
}

function newAddress(): Address {
  return {
    country: faker.helpers.arrayElement(COUNTRY_CODES),
    postalCode: faker.string.numeric(6),
    houseNumber: faker.string.numeric({ length: { min: 1, max: 3 }, allowLeadingZeros: false }),
    street: lettersAndSpaces(faker.location.street(), 'Test Street'),
    city: lettersAndSpaces(faker.location.city(), 'Lagos'),
    state: lettersAndSpaces(faker.location.state(), 'Lagos'),
  };
}



/** Arrange helper: finds a product through search and adds it */
async function addProductToCart(page: Page, product: ProductRef, extraUnits = 0): Promise<void> {
  await page.goto('/');
  await page.getByTestId('search-query').fill(product.searchTerm);
  await page.getByTestId('search-query').press('Enter');
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

/** Registers a brand-new, randomly generated customer and logs in. */
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
  await page.getByTestId('phone').fill(customer.phone);
  await page.getByTestId('email').fill(customer.email);
  await page.getByTestId('password').fill(customer.password);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/auth\/login/);
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
  // Flow 1: a visitor starts to check out and chooses how
  test.describe('Choosing how to check out', () => {
    test('a visitor can sign in or continue as a guest @smoke', async ({ page }) => {
      // Arrange
      await addProductToCart(page, ECO_PRODUCT, 2);
      await openCart(page);
      await expect(page.getByTestId('product-quantity')).toHaveValue('3');

      // Act
      await page.getByTestId('proceed-1').click();

      // Assert
      await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Continue as Guest' })).toBeVisible();
    });

    test('opening /checkout directly with an empty cart does not break the page', async ({
      page,
    }) => {
      // Act
      await page.goto('/checkout');

      // Assert: the shop still renders. If the site shows an empty cart message or redirects, assert that too.
      await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible();
    });
  });

  // Flow 2: a registered customer buys
  test.describe('Customer checkout', () => {
    test('a logged-in customer can move through the steps to payment @smoke', async ({ page }) => {
      // Arrange: a new customer with a product in the cart
      await registerAndLogIn(page);
      await addProductToCart(page, ECO_PRODUCT, 2);
      await openCart(page);

      // Act
      await checkoutAsCustomerToPayment(page, newAddress());

      // Assert
      await expect(page.getByTestId('payment-method')).toBeVisible();
      await expect(page.getByTestId('finish')).toBeVisible();
    });
  });

  //flow 3: the payment step
  test.describe('Payment methods', () => {
    
   // a logged-in customer choosing credit card sees the card fields
    test('a logged-in customer choosing credit card sees the card fields', async ({ page }) => {
      // Arrange: a new customer at the payment step
      await registerAndLogIn(page);
      await addProductToCart(page, ECO_PRODUCT);
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