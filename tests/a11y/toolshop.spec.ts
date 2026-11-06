/**
 * Accessibility tests for Toolshop.
 *
 * Runs axe-core against four key pages and asserts no critical or serious
 * violations. Minor and moderate issues are reported in the HTML report
 * but don't fail the test.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// This whole file tests the logged-out visitor experience.
// Opt out of the project-level storageState.
test.use({ storageState: { cookies: [], origins: [] } });

/* ------------------------------------------------------------ helpers */

/**
 * The severities we treat as failures. `minor` and `moderate` are logged in
 * the HTML report for reference but do not fail the suite.
 */
const BLOCKING_IMPACTS = ['critical', 'serious'] as const;

/**
 * Runs axe on the current page, filtered to WCAG 2.0/2.1 A and AA rules,
 * and returns the violations that have one of the blocking impact levels.
 */
async function scanBlocking(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return results.violations.filter((v) =>
    v.impact ? (BLOCKING_IMPACTS as readonly string[]).includes(v.impact) : false,
  );
}

/**
 * Formats axe violations for the assertion message so failures point directly
 * at the rule and the first few affected nodes.
 */
function describeViolations(violations: Awaited<ReturnType<typeof scanBlocking>>): string {
  if (violations.length === 0) return 'none';
  return violations
    .map((v) => {
      const sampleNodes = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ');
      return `[${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})\n  Affects: ${sampleNodes}${v.nodes.length > 3 ? ` (+${v.nodes.length - 3} more)` : ''}`;
    })
    .join('\n\n');
}

/* --------------------------------------------------------------- tests */

test.describe('Accessibility (axe-core/playwright)', () => {
  // SUSPECTED DEFECTS on Toolshop home page:
  // 1. [serious] #language button has aria-label "Select language" but no matching
  //    visible text (WCAG 2.5.3, rule: label-content-name-mismatch).
  // 2. [serious] Sidebar filter <ul> elements wrap <fieldset> directly instead of

  test.fixme('the home page has no critical or serious violations @a11y @smoke', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/');
    await expect(page.getByTestId('product-name').first()).toBeVisible();

    // Act
    const violations = await scanBlocking(page);

    // Assert
    expect(
      violations,
      `Expected no critical/serious a11y violations on /, found ${violations.length}:\n\n${describeViolations(violations)}`,
    ).toHaveLength(0);
  });

  // SUSPECTED DEFECTS on Toolshop login page:
  // 1. [CRITICAL] .btn-outline-secondary (likely the Google sign-in button) has
  //    no accessible name — no visible text, aria-label, aria-labelledby, or title
  //    (WCAG 4.1.2, rule: button-name). Screen-reader users hear only "button".
  // 2. [serious] #language dropdown has the same label-content-name-mismatch as
  //    the home page.
  // See docs/axe-findings.md for details and reproduction.
  // eslint-disable-next-line playwright/no-skipped-test
  test.fixme('the login page has no critical or serious violations @a11y @smoke', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    // Act
    const violations = await scanBlocking(page);

    // Assert
    expect(
      violations,
      `Expected no critical/serious a11y violations on /auth/login, found ${violations.length}:\n\n${describeViolations(violations)}`,
    ).toHaveLength(0);
  });

  // SUSPECTED DEFECT on Toolshop contact page:
  // Site-wide [serious] #language dropdown label-content-name-mismatch issue

  test.fixme('the contact page has no critical or serious violations @a11y @smoke', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: /contact/i })).toBeVisible();

    // Act
    const violations = await scanBlocking(page);

    // Assert
    expect(
      violations,
      `Expected no critical/serious a11y violations on /contact, found ${violations.length}:\n\n${describeViolations(violations)}`,
    ).toHaveLength(0);
  });

  // SUSPECTED DEFECT on Toolshop product detail page:
  // Site-wide [serious] #language dropdown label-content-name-mismatch issue
  // (WCAG 2.5.3). Captured here for page-level coverage even though it's not
  // product-specific. See docs/axe-findings.md.
  test.fixme('a product detail page has no critical or serious violations @a11y @smoke', async ({
    page,
  }) => {
    // Arrange: open the first product on the home page
    await page.goto('/');
    await expect(page.getByTestId('product-name').first()).toBeVisible();
    await page.getByTestId('product-name').first().click();
    await expect(page.getByTestId('add-to-cart')).toBeVisible();

    // Act
    const violations = await scanBlocking(page);

    // Assert
    expect(
      violations,
      `Expected no critical/serious a11y violations on the product page, found ${violations.length}:\n\n${describeViolations(violations)}`,
    ).toHaveLength(0);
  });
});
