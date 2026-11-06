# Toolshop Playwright Suite

End-to-end UI, API, hybrid, and accessibility test suite for
[practicesoftwaretesting.com](https://practicesoftwaretesting.com), built with
Playwright and TypeScript.

## Overview

A portfolio project that demonstrates production-shape QA automation against a
real third-party site. The suite covers four layers of testing in one
Playwright project, shares a single auth setup across browsers, degrades
gracefully in CI where the target site blocks shared runner IPs, and documents
every intentional trade-off.

**What's inside:**

- **UI tests** — ~40 tests across home, product, cart, categories, contact, and
  authentication flows, driven by a logged-in browser context.
- **API tests** — typed response schemas for login, authorization failure
  shapes, and token handling.
- **Hybrid test** — create an order through 4 chained API calls
  (cart → item → payment check → invoice), then open the browser and assert
  the invoice appears on `/account/invoices` with the correct total. Proves
  the API and the UI share one backend.
- **Accessibility tests** — `@axe-core/playwright` scanning four key pages
  against WCAG 2.0/2.1 A and AA, with findings captured in
  `docs/axe-findings.md`.
- **CI-aware config** — the auth setup project skips on GitHub Actions runners
  (Toolshop rejects shared CI IPs); tests that depend on it skip with a
  documented reason rather than fabricate green.

## Tech stack

- Playwright + TypeScript
- `@axe-core/playwright` for accessibility scanning
- `@faker-js/faker` for throwaway test data
- `dotenv` for local env vars (`override: true` so shell exports don't shadow)
- GitHub Actions for CI

## Prerequisites

- Node.js 20 or later
- npm

## Setup

```bash
git clone <your-repo-url>
cd toolshop-playwright
npm install
npx playwright install chromium
cp .env.example .env
# edit .env — see the Environment variables section below
```

## Environment variables

| Variable             | Required | Purpose                                                             |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `BASE_URL`           | yes      | UI origin, e.g. `https://practicesoftwaretesting.com`               |
| `API_BASE_URL`       | yes      | API origin, e.g. `https://api.practicesoftwaretesting.com`          |
| `TEST_USER_PASSWORD` | yes      | Password used for every throwaway account the setup project creates |
| `TEST_EMAIL_DOMAIN`  | no       | Email domain for throwaway accounts (default: `example.com`)        |
| `CROSS_BROWSER`      | no       | Set to `true` to enable Firefox and WebKit projects                 |

## Running tests

```bash
# Everything (chromium only by default)
npx playwright test

# One area
npx playwright test tests/ui/
npx playwright test tests/api/
npx playwright test tests/hybrid/
npx playwright test tests/a11y/

# Grep by tag
npx playwright test --grep @smoke
npx playwright test --grep @a11y
npx playwright test --grep @hybrid

# All browsers
CROSS_BROWSER=true npx playwright test

# Headed / debug / UI mode
npx playwright test --headed
npx playwright test --debug
npx playwright test --ui

# Open the HTML report from the last run
npx playwright show-report
```

## Project structure

```
toolshop-playwright/
├── tests/
│   ├── setup/
│   │   └── auth.setup.ts              # registers a user via API, saves token + session
│   ├── api/
│   │   └── auth.spec.ts               # typed-response API tests
│   ├── hybrid/
│   │   └── order.spec.ts              # API-creates-order → UI-asserts-order
│   ├── a11y/
│   │   └── toolshop.spec.ts           # axe-core scans across 4 pages
│   └── ui/
│       ├── authentication.spec.ts
│       ├── cart.spec.ts
│       ├── categories.spec.ts
│       ├── contact.spec.ts
│       ├── home.spec.ts
│       └── products.spec.ts
├── playwright/
│   └── .auth/                         # gitignored
│       ├── customer.json              # storageState for logged-in browser
│       └── credentials.json           # email/password/userId for API tests
├── docs/
│   ├── api.md                         # documented endpoint shapes
│   └── axe-findings.md                # accessibility findings with rule refs
├── .github/
│   └── workflows/
│       └── playwright.yml             # CI workflow
├── playwright.config.ts
├── .env.example
└── README.md
```

## Design decisions

### Auth via API, not UI

The setup project registers a customer with `POST /users/register` and logs in
with `POST /users/login`, then injects the bearer token directly into Angular's
`auth-token` localStorage key. The browser opens already logged in on first
navigation.

Two reasons:

- Toolshop's UI registration form is protected by Cloudflare Turnstile, which
  fails for headless browsers.
- Session restoration via storageState is faster and less flaky than driving
  a login form on every test.

### Shared storageState with per-test opt-out

The chromium project declares `dependencies: ['setup']` and
`use: { storageState: 'playwright/.auth/customer.json' }`, so every test
starts logged in by default. Tests that need a logged-out state opt out:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

Used in authentication tests and in every accessibility test.

### Conditional storageState in config

If `playwright/.auth/customer.json` doesn't exist (setup skipped in CI), the
config falls back to an empty session:

```ts
storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : { cookies: [], origins: [] };
```

This lets non-auth tests still run in CI even when setup skips.

### Setup skips in CI

Toolshop's API rejects requests from shared GitHub Actions runner IPs
(see Known limitations). Rather than hard-code a pre-registered account
(which Toolshop's reaper deletes within hours), the setup project explicitly
skips in CI with a documented reason, and tests that depend on credentials
skip themselves with `test.skip(!fs.existsSync(CREDENTIALS_FILE), ...)`.

This is the same pattern as `test.fixme` for the Cloudflare-blocked UI tests:
honest about what can't run on shared infra, no fabricated coverage.

### Reliability settings

```ts
fullyParallel: true;
retries: process.env.CI ? 2 : 0;
trace: 'on-first-retry';
screenshot: 'only-on-failure';
workers: process.env.CI ? 1 : undefined;
```

Serial workers in CI are a deliberate trade-off — Toolshop rate-limits
aggressive parallel requests from the same IP. Local runs use default
parallelism.

### Dynamic product pick

The hybrid test fetches `GET /products?in_stock=true` and uses the first
in-stock product returned. This keeps the test from breaking when Toolshop
reseeds its demo data and the previously-hardcoded product goes out of stock.

### Diagnostic error messages

API tests use `expect(...).toBe(status, 'descriptive message')` on every
response. The hybrid test's invoice step captures the server's validation
response body on failure:

```ts
if (invoiceResponse.status() !== 201) {
  const errorBody = await invoiceResponse.text();
  throw new Error(`Invoice creation failed with ${invoiceResponse.status()}. ...`);
}
```

Fast triage when an endpoint's contract changes.

### API discovery via Network tab

`docs/api.md` documents every endpoint discovered by capturing API calls in
the browser's Network tab while completing a real user flow (register, login,
browse, add to cart, checkout). No public OpenAPI spec exists for Toolshop —
this document is the artifact of a focused discovery session.

### Accessibility fixme pattern

Three real WCAG violations found on Toolshop: `label-content-name-mismatch`
on the language dropdown (site-wide, serious), `button-name` on the login
page (critical), and malformed `<ul>` structure on the home page (serious).

Toolshop is a third-party demo site we don't own, so each affected test is
marked `test.fixme` with a reference to `docs/axe-findings.md`. If any issue
is fixed upstream, removing the fixme re-enables the test.

## CI/CD

GitHub Actions runs the full chromium suite on every push and pull request
against `main`. The setup project skips in CI (see Known limitations); every
test that depends on credentials skips with it. The remaining tests run and
must pass.

Workflow: `.github/workflows/playwright.yml`

## Known limitations

### Cloudflare blocks UI registration on CI runners

Toolshop's `/auth/register` page is behind Cloudflare Turnstile. Headless
browsers on GitHub Actions runners fail the challenge. UI tests that register
a new user are marked `test.fixme` with a note pointing to this section.

### Toolshop API rejects shared CI runner IPs

`POST /users/register` returns 500 when called from shared GitHub Actions
runner IPs. This is independent of the UI Cloudflare block — the API applies
its own IP-based protection.

Consequence: the auth setup project cannot register a user in CI, so it skips.
Tests that depend on credentials (`tests/api/auth.spec.ts`, `tests/hybrid/`)
skip themselves. All other tests run.

### Add-to-cart button intermittently stays disabled in CI

Tests in `cart.spec.ts`, `home.spec.ts`, and `products.spec.ts` that add a
product to the cart pass locally but intermittently fail in CI. The product
page loads correctly, but Angular's reactive form validation keeps the Add
to Cart button disabled through 30-second retries.

Likely cause: a race between the quantity input initializing and the
stock-check API call completing on slower CI infrastructure. These tests are
skipped in CI pending investigation.

## Known defects (upstream)

Three suspected defects observed on practicesoftwaretesting.com during
testing, each tracked in the corresponding test file or doc:

1. Language-select button accessible-name mismatch (site-wide, serious) —
   see `docs/axe-findings.md`.
2. Unnamed button on the login page (critical) — see `docs/axe-findings.md`.
3. Asymmetric API error response shapes — invalid login returns one shape,
   missing token returns another. Tests document both; see
   `tests/api/auth.spec.ts`.

## npm scripts

```bash
npm run format      # prettier write
npm run lint        # eslint check
npm run typecheck   # tsc --noEmit
```

## Author

Michael Adeyeye — QA Testing Engineer, Lagos.
