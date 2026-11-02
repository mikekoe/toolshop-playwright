import { test, expect } from '@playwright/test';

const MENU_ITEMS = [
  { label: 'Hand Tools', testId: 'nav-hand-tools' },
  { label: 'Special Tools', testId: 'nav-special-tools' },
  { label: 'Other', testId: 'nav-other' },
];

const HAND_TOOL_SUBCATEGORIES = ['Hammer', 'Hand Saw', 'Wrench', 'Screwdriver', 'Pliers'];

test.describe('Categories', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange (shared): start on the home page with the list rendered
    await page.goto('/');
    await expect(page.getByTestId('product-name').first()).toBeVisible();
  });

  // Flow 1: the visitor browses through the Categories menu in the header
  test.describe('Categories menu', () => {
    for (const { label, testId } of MENU_ITEMS) {
      test(`choosing ${label} from the menu opens that category`, async ({ page }) => {
        // Act
        await page.getByTestId('nav-categories').click();
        await page.getByTestId(testId).click();

        // Assert: VERIFY the URL pattern in the browser first
        await expect(page).toHaveURL(/\/category\//);
        await expect(page.getByTestId('page-title')).toBeVisible();
      });
    }
  });

  // Flow 2: the visitor narrows the list with the category filter in the sidebar
  test.describe('Category filter', () => {
    test('the sidebar lists the Hand Tools sub-categories', async ({ page }) => {
      // Assert: VERIFY that these labels are real checkbox names
      for (const name of HAND_TOOL_SUBCATEGORIES) {
        await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible();
      }
    });

    test('filtering by the Pliers category narrows the list', async ({ page }) => {
      // Arrange
      const products = page.getByTestId('product-name');
      const unfilteredCount = await products.count();

      // Act
      await page.getByRole('checkbox', { name: 'Pliers', exact: true }).check();

      // Assert: a known pliers product is shown and the list got smaller.
      // Adjust the count check if the Pliers category fills a whole page.
      await expect(products.filter({ hasText: 'Combination Pliers' })).toHaveCount(1);
      await expect.poll(() => products.count()).toBeLessThan(unfilteredCount);
    });

    test('clearing the filter brings the full list back', async ({ page }) => {
      // Arrange: clearthe filter and wait for it to take effect
      const products = page.getByTestId('product-name');
      const unfilteredCount = await products.count();
      const pliers = page.getByRole('checkbox', { name: 'Pliers', exact: true });
      await pliers.check();
      await expect.poll(() => products.count()).toBeLessThan(unfilteredCount);

      // Act
      await pliers.uncheck();

      // Assert
      await expect.poll(() => products.count()).toBe(unfilteredCount);
    });
  });
});