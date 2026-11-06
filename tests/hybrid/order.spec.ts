/**
 * Hybrid order test: create an order via the API, then assert it in the UI.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/* --------------------------------------------------- base URL & paths */

const API_BASE = 'https://api.practicesoftwaretesting.com';

const CREDENTIALS_FILE = path.resolve('playwright/.auth/credentials.json');

/* -------------------------------------------------------------- types */

type Credentials = { email: string; password: string; userId: string };

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  in_stock: boolean;
};

type ProductsPage = {
  data: Product[];
  current_page: number;
  last_page: number;
  total: number;
};

type CartCreatedResponse = { id: string };

type AddItemResponse = { result: string };

type PaymentCheckResponse = { message: string };

type InvoiceResponse = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  user_id: string;
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_postal_code: string;
  subtotal: number;
  total: number;
  created_at: string;
};

/* -------------------------------------------------------------- helpers */

function readCredentials(): Credentials {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    throw new Error(
      `Credentials file not found at ${CREDENTIALS_FILE}. Setup project did not run (skipped in CI by design). ` +
        `This test is guarded by test.skip and should not be reached without credentials.`,
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
}

async function login(request: APIRequestContext, creds: Credentials): Promise<string> {
  const response = await request.post(`${API_BASE}/users/login`, {
    data: { email: creds.email, password: creds.password },
  });
  expect(response.status(), 'login must succeed').toBe(200);
  const body = (await response.json()) as LoginResponse;
  return body.access_token;
}

/**
 * Picks an in-stock product to use in the test. Fetching from /products
 * keeps the test independent of specific product IDs, which can change
 * when Toolshop reseeds its demo data.
 */
async function pickInStockProduct(request: APIRequestContext): Promise<Product> {
  const response = await request.get(`${API_BASE}/products?in_stock=true&page=1`);
  expect(response.status(), 'products list must return 200').toBe(200);
  const body = (await response.json()) as ProductsPage;
  const product = body.data.find((p) => p.in_stock);
  if (!product) {
    throw new Error('No in-stock products returned by /products?in_stock=true');
  }
  return product;
}

/**
 * Builds a faker-generated Nigerian billing address. We use NG as the country
 * because the Toolshop setup project registers Lagos-based customers.
 */
function generateBillingAddress() {
  // These exact values were empirically discovered to pass Toolshop's
  // undocumented /invoices address validation. The server appears to check
  // against a whitelist of seed addresses rather than doing real geocoding,
  return {
    billing_street: 'Paucek Mills',
    billing_city: 'Mattburgh',
    billing_state: 'California',
    billing_country: 'NG',
    billing_postal_code: '100242',
  };
}

/* --------------------------------------------------------------- test  */

test.describe('Hybrid: create order via API, assert in UI', () => {
  // The setup project is skipped in CI (shared-runner IPs blocked by Toolshop's
  // API). When setup doesn't run we have no credentials file and no auth token,
  // so the whole flow is impossible. Skip rather than fabricate coverage.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(
    !fs.existsSync(CREDENTIALS_FILE),
    'Requires credentials from the setup project; setup skipped in CI. See README > Known limitations.',
  );

  test('order placed via API appears on /account/invoices with the correct total @hybrid @smoke', async ({
    request,
    page,
  }) => {
    /* -------------------- 1. API: authenticate -------------------- */

    const creds = readCredentials();
    const token = await login(request, creds);
    const auth = { Authorization: `Bearer ${token}` };

    /* -------------------- 2. API: pick a product ------------------ */

    const product = await pickInStockProduct(request);
    const quantity = 2;
    const expectedSubtotal = Number((product.price * quantity).toFixed(2));

    /* -------------------- 3. API: create cart --------------------- */

    const cartResponse = await request.post(`${API_BASE}/carts`, {
      headers: auth,
      data: {},
    });
    expect(cartResponse.status(), 'cart creation must return 201').toBe(201);
    const cart = (await cartResponse.json()) as CartCreatedResponse;
    expect(cart.id, 'cart id must be a non-empty string').toMatch(/\S/);

    /* -------------------- 4. API: add item ------------------------ */

    const addItemResponse = await request.post(`${API_BASE}/carts/${cart.id}`, {
      headers: auth,
      data: { product_id: product.id, quantity },
    });
    expect(addItemResponse.status(), 'add-item must return 200').toBe(200);
    const addItemBody = (await addItemResponse.json()) as AddItemResponse;
    expect(addItemBody.result).toMatch(/added|updated/i);

    /* -------------------- 5. API: payment check ------------------- */

    const paymentCheckResponse = await request.post(`${API_BASE}/payment/check`, {
      headers: auth,
      data: { payment_method: 'cash-on-delivery', payment_details: {} },
    });
    expect(paymentCheckResponse.status(), 'payment check must return 200').toBe(200);
    const paymentCheckBody = (await paymentCheckResponse.json()) as PaymentCheckResponse;
    expect(paymentCheckBody.message).toMatch(/successful/i);

    /* -------------------- 6. API: create invoice ------------------ */

    const billing = generateBillingAddress();
    const invoicePayload = {
      ...billing,
      cart_id: cart.id,
      payment_method: 'cash-on-delivery',
      payment_details: {},
    };

    const invoiceResponse = await request.post(`${API_BASE}/invoices`, {
      headers: auth,
      data: invoicePayload,
    });

    // On non-201 the API tells us which fields failed validation.
    // Capture that in the error so the failure explains itself instead
    // of just saying "got 422".

    // eslint-disable-next-line playwright/no-conditional-in-test
    if (invoiceResponse.status() !== 201) {
      const errorBody = await invoiceResponse.text();
      throw new Error(
        `Invoice creation failed with ${invoiceResponse.status()}.\n` +
          `Request payload:\n${JSON.stringify(invoicePayload, null, 2)}\n\n` +
          `Response body:\n${errorBody}`,
      );
    }

    const invoice = (await invoiceResponse.json()) as InvoiceResponse;

    expect(invoice.invoice_number, 'invoice_number must look like INV-YYYYNNNNNN').toMatch(
      /^INV-\d{4}\d+$/,
    );
    expect(invoice.total, 'invoice total must match product price * quantity').toBeCloseTo(
      expectedSubtotal,
      2,
    );
    expect(invoice.user_id, 'invoice must belong to the test user').toBe(creds.userId);

    /* -------------------- 7. UI: navigate to invoices ------------- */

    await page.goto('/account/invoices');
    await expect(page.getByTestId('page-title')).toHaveText('Invoices');

    /* -------------------- 8. UI: assert the invoice row ----------- */

    // The invoice number is unique per order, so matching it is enough
    // to prove this is the row we just created via the API.
    const invoiceRow = page.getByRole('row', { name: new RegExp(invoice.invoice_number) });
    await expect(invoiceRow, 'the invoice we created via API should be listed').toBeVisible();

    // Belt-and-braces: assert the total in the same row matches.
    // Toolshop renders totals as "$107.28" with two decimals.
    const expectedTotalText = `$${invoice.total.toFixed(2)}`;
    await expect(invoiceRow).toContainText(expectedTotalText);
  });
});
