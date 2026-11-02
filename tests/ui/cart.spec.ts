import { test, expect, type Page } from '@playwright/test';

interface ProductRef {
  searchTerm: string;
  productName: string;
}

// On the product list the name is "Leather toolbelt" and ECO is a separate badge
const ECO_PRODUCT: ProductRef = { searchTerm: 'tool', productName: 'Leather toolbelt' };
const STANDARD_PRODUCT: ProductRef = { searchTerm: 'plier', productName: 'Combination Pliers' };
const BOLT_CUTTERS: ProductRef = { searchTerm: 'bolt', productName: 'Bolt Cutters' };
const MINI_SCREWDRIVER: ProductRef = {
  searchTerm: 'screwdriver',
  productName: 'Mini Screwdriver',
};

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

function parseMoney(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9.]/g, ''));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function expectMoneyClose(actual: number, expected: number): void {
  expect(
    Math.abs(actual - expected),
    `expected ${actual} to be within 1 cent of ${expected}`,
  ).toBeLessThanOrEqual(0.011);
}

test.describe('Cart', () => {
  // Flow 1: the visitor puts a product in the cart
  test.describe('Adding items', () => {
    test('adds a product with quantity 3 and shows it in the cart @smoke', async ({ page }) => {
      // Arrange + Act: add the product, increasing the quantity twice (1 -> 3)
      await addProductToCart(page, STANDARD_PRODUCT, 2);
      await openCart(page);

      // Assert
      await expect(page.getByTestId('product-quantity')).toHaveValue('3');
    });
  });

  // Flow 2: the visitor changes what is in the cart
  test.describe('Changing items', () => {
    test('updates the quantity and the line price', async ({ page }) => {
      // Arrange: product in the cart, quantity 3
      await addProductToCart(page, STANDARD_PRODUCT, 2);
      await openCart(page);
      const quantity = page.getByTestId('product-quantity');
      await expect(quantity).toHaveValue('3');
      const unitPrice = parseMoney(await page.getByTestId('product-price').textContent());

      // Act: change the quantity to 6
      await quantity.fill('6');
      await quantity.press('Tab');

      // Assert: the quantity is kept and the line price follows it
      await expect(quantity).toHaveValue('6');
      await expect(async () => {
        const linePrice = parseMoney(await page.getByTestId('line-price').textContent());
        expectMoneyClose(linePrice, unitPrice * 6);
      }).toPass();
    });

    test('clearing the quantity resets it to 1', async ({ page }) => {
      // Arrange
      await addProductToCart(page, MINI_SCREWDRIVER, 2);
      await openCart(page);
      const quantity = page.getByTestId('product-quantity');
      await expect(quantity).toHaveValue('3');

      // Act
      await quantity.fill('');
      await quantity.press('Tab');

      // Assert
      await expect(quantity).toHaveValue('1');
      await expect(page.getByText('Product quantity updated.')).toBeVisible();
    });

    test('removes one product and keeps the other', async ({ page }) => {
      // Arrange: two products in the cart
      await addProductToCart(page, BOLT_CUTTERS);
      await addProductToCart(page, MINI_SCREWDRIVER);
      await openCart(page);
      const screwdriverRow = page.getByRole('row').filter({ hasText: 'Mini Screwdriver' });
      const boltRow = page.getByRole('row').filter({ hasText: 'Bolt Cutters' });
      await expect(screwdriverRow).toHaveCount(1);

      // Act: the remove control has no accessible name, so use its "btn" class.
      // VERIFY there is only one .btn in the row.
      await screwdriverRow.locator('.btn').click();

      // Assert
      await expect(screwdriverRow).toHaveCount(0);
      await expect(boltRow).toHaveCount(1);
    });

    test('continue shopping returns to the product list', async ({ page }) => {
      // Arrange
      await addProductToCart(page, STANDARD_PRODUCT);
      await openCart(page);

      // Act
      await page.getByTestId('continue-shopping').click();

      // Assert
      await expect(page.getByTestId('product-name').first()).toBeVisible();
    });
  });

  // Flow 3: the cart shows how the price is built
  test.describe('Prices', () => {
    test('the line price equals unit price times quantity', async ({ page }) => {
      // Arrange
      await addProductToCart(page, BOLT_CUTTERS, 2);
      await openCart(page);
      await expect(page.getByTestId('product-quantity')).toHaveValue('3');

      // Act: read the prices the page shows
      const unitPrice = parseMoney(await page.getByTestId('product-price').textContent());

      // Assert: expected value is calculated, never hard-coded
      await expect(async () => {
        const linePrice = parseMoney(await page.getByTestId('line-price').textContent());
        expectMoneyClose(linePrice, unitPrice * 3);
      }).toPass();
    });

    test('the cart total equals the sum of the line prices', async ({ page }) => {
      // Arrange: two non-ECO products (the recording showed no discount for these)
      await addProductToCart(page, BOLT_CUTTERS, 1);
      await addProductToCart(page, MINI_SCREWDRIVER);
      await openCart(page);
      await expect(page.getByTestId('line-price')).toHaveCount(2);

      // Assert
      await expect(async () => {
        const lines = (await page.getByTestId('line-price').allTextContents()).map(parseMoney);
        const total = parseMoney(await page.getByTestId('cart-total').textContent());
        expectMoneyClose(total, sum(lines));
      }).toPass();
    });

    test('shows the subtotal and the eco-friendly discount for an ECO product', async ({
      page,
    }) => {
      // Arrange
      await addProductToCart(page, ECO_PRODUCT, 2);

      // Act
      await openCart(page);

      // Assert
      await expect(page.getByText('Eco-Friendly Discount (5%)')).toBeVisible();
      await expect(page.getByTestId('cart-subtotal')).toBeVisible();
      await expect(page.getByTestId('cart-eco-discount')).toBeVisible();
      await expect(page.getByTestId('cart-total')).toBeVisible();
    });

    test('the eco discount is 5% of the subtotal and the total follows', async ({ page }) => {
      // Arrange
      await addProductToCart(page, ECO_PRODUCT, 2);
      await openCart(page);

      // Assert. This is a HYPOTHESIS: if it fails, check by hand whether the discount
      // applies to the whole cart or only to ECO lines BEFORE reporting a bug.
      await expect(async () => {
        const subtotal = parseMoney(await page.getByTestId('cart-subtotal').textContent());
        const discount = parseMoney(await page.getByTestId('cart-eco-discount').textContent());
        const total = parseMoney(await page.getByTestId('cart-total').textContent());
        expectMoneyClose(discount, subtotal * 0.05);
        expectMoneyClose(total, subtotal - discount);
      }).toPass();
    });
  });
});