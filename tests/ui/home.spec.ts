import { test, expect } from '@playwright/test';

const PRODUCT = 'Combination Pliers';

test.describe('Home', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange (shared): every test starts on the home page with the list rendered
    await page.goto('/');
    await expect(page.getByTestId('product-name').first()).toBeVisible();
  });

  // Flow 1: a visitor arrives and sees the shop
  test.describe('Layout and product list', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('shows the main navigation, language and banner @smoke', async ({ page }) => {
      // Assert (the page was opened in beforeEach)
      await expect(page.getByTestId('nav-home')).toContainText('Home');
      await expect(page.getByTestId('nav-categories')).toContainText('Categories');
      await expect(page.getByTestId('nav-contact')).toBeVisible();
      await expect(page.getByTestId('nav-sign-in')).toContainText('Sign in');
      await expect(page.getByTestId('language-select')).toContainText('EN');
      await expect(page.getByRole('img', { name: 'Banner' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Practice Software Testing -' })).toBeVisible();
      await expect(page.getByTestId('search-query')).toBeEmpty();
    });

    test('the cart link appears once a product is added', async ({ page }) => {
      // Arrange: a new visitor has an empty cart, and the header shows no cart link
      await expect(page.getByTestId('nav-cart')).toHaveCount(0);

      // Act
      await page.getByTestId('product-name').filter({ hasText: PRODUCT }).click();
      await page.getByTestId('add-to-cart').click();
      await expect(page.getByRole('alert', { name: 'Product added to shopping' })).toBeVisible();

      // Assert
      await expect(page.getByTestId('nav-cart')).toBeVisible();
    });

    test('shows the course promotion with a link', async ({ page }) => {
      // Promotions come and go, so this is kept apart from the smoke layout test.
      // If the promotion is removed from the site, delete this test.
      await expect(page.getByTestId('course-promo')).toBeVisible();
      await expect(page.getByTestId('course-promo-link')).toHaveAttribute('href', /.+/);
    });

    test('shows the footer and the demo notice', async ({ page }) => {
      // Assert: footer explore link is visible
      await expect(page.getByTestId('footer-explore')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Documentation' })).toBeVisible();
    });

    test('lists products @smoke', async ({ page }) => {
      // Assert
      await expect(page.getByTestId('product-name')).not.toHaveCount(0);
    });

    test('moves to the next page of products', async ({ page }) => {
      // Arrange: remember the first product on page 1
      const firstProduct = page.getByTestId('product-name').first();
      const firstOnPageOne = (await firstProduct.textContent())?.trim();

      // Act: VERIFY the pagination button name ("Page-2") in the browser
      await page.getByRole('button', { name: 'Page-2' }).click();

      // Assert: a different product now leads the list
      await expect
        .poll(async () => (await firstProduct.textContent())?.trim())
        .not.toBe(firstOnPageOne);
    });
  });

  // Flow 2: the visitor looks for a specific product
  test.describe('Search', () => {
    test('search for "plier" returns matching products @smoke', async ({ page }) => {
      // Arrange
      const products = page.getByTestId('product-name');

      // Act
      await page.getByTestId('search-query').fill('plier');
      await page.getByTestId('search-submit').click();

      // Assert: results exist and every name matches the search term
      await expect(async () => {
        const names = await products.allTextContents();
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
          expect(name).toMatch(/plier/i);
        }
      }).toPass();
    });

    test('search can be submitted with the Enter key', async ({ page }) => {
      // Act
      await page.getByTestId('search-query').fill('plier');
      await page.getByTestId('search-query').press('Enter');

      // Assert: the search was applied (a page that ignored Enter would show no heading)
      await expect(page.getByText('Searched for: plier')).toBeVisible();
    });

    test('search with no matches shows no products', async ({ page }) => {
      // Act
      await page.getByTestId('search-query').fill('zzzznotaproduct');
      await page.getByTestId('search-submit').click();

      // Assert: TODO also assert the empty-state message once you have inspected it
      await expect(page.getByTestId('product-name')).toHaveCount(0);
    });

    test('resetting the search clears the box and restores the list', async ({ page }) => {
      // Arrange: search so that the list shrinks
      const products = page.getByTestId('product-name');
      const fullCount = await products.count();
      await page.getByTestId('search-query').fill('chisel');
      await page.getByTestId('search-submit').click();
      await expect.poll(() => products.count()).toBeLessThan(fullCount);

      // Act
      await page.getByTestId('search-reset').click();

      // Assert
      await expect(page.getByTestId('search-query')).toBeEmpty();
      await expect.poll(() => products.count()).toBe(fullCount);
    });
  });

  // Flow 3: the visitor changes the order of the list
  test.describe('Sort', () => {
    test('sorting by name Z-A orders the list descending', async ({ page }) => {
      // Arrange
      const products = page.getByTestId('product-name');

      // Act
      await page.getByTestId('sort').selectOption('name,desc');

      // Assert: retry until the list has refreshed after sorting
      await expect(async () => {
        const names = (await products.allTextContents()).map((n) => n.trim().toLowerCase());
        expect(names.length).toBeGreaterThan(1);
        expect(names).toEqual([...names].sort().reverse());
      }).toPass();
    });

    test('sorting by price low to high orders the list ascending', async ({ page }) => {
      // Arrange: VERIFY "product-price" also exists on the list cards (it is confirmed on the cart)
      const prices = page.getByTestId('product-price');

      // Act
      await page.getByTestId('sort').selectOption('price,asc');

      // Assert
      await expect(async () => {
        const values = (await prices.allTextContents()).map((p) =>
          Number(p.replace(/[^0-9.]/g, '')),
        );
        expect(values.length).toBeGreaterThan(1);
        expect(values).toEqual([...values].sort((a, b) => a - b));
      }).toPass();
    });
  });

  // Flow 4: the visitor opens a product to decide whether to buy
  test.describe('Open a product', () => {
    test('opens a product and shows its key information @smoke', async ({ page }) => {
      // Act
      await page.getByTestId('product-name').filter({ hasText: PRODUCT }).click();

      // Assert
      await expect(page).toHaveURL(/\/product\//);
      await expect(page.getByTestId('product-name')).toContainText(PRODUCT);
      await expect(page.getByTestId('product-description')).not.toBeEmpty();
      await expect(page.getByTestId('add-to-cart')).toBeVisible();
    });
  });

  // Flow 5: the visitor chooses how many to buy
  test.describe('Quantity on the product page', () => {
    test.beforeEach(async ({ page }) => {
      // Arrange (shared): open a product, which should start at quantity 1
      await page.getByTestId('product-name').filter({ hasText: PRODUCT }).click();
      await expect(page.getByTestId('quantity')).toHaveValue('1');
    });

    test('the increase button raises the quantity', async ({ page }) => {
      // Act: three clicks (1 -> 4)
      await page.getByTestId('increase-quantity').click({ clickCount: 3 });

      // Assert
      await expect(page.getByTestId('quantity')).toHaveValue('4');
    });

    test('the decrease button never goes below 1', async ({ page }) => {
      // Act
      await page.getByTestId('decrease-quantity').click();

      // Assert: if this fails, check by hand: a quantity of 0 or less is a defect to report
      await expect(page.getByTestId('quantity')).toHaveValue('1');
    });
  });
});
