# Toolshop Playwright Suite

[![Playwright Tests](https://github.com/mikekoe/toolshop-playwright/actions/workflows/playwright.yml/badge.svg?branch=main)](https://github.com/mikekoe/toolshop-playwright/actions/workflows/playwright.yml)

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
- `@faker-js/faker` for test data
- `dotenv` for local env vars (`override: true` so shell exports don't shadow)
- GitHub Actions for CI, with Docker as an alternative runtime

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

## Test tagging conventions

Tests are tagged by role so CI can run the right subset at the right time.

| Tag         | Purpose                                                                                                                           | Where it runs                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@smoke`    | Fast happy-path checks — one representative test per feature area (login, home, cart, products, categories, contact, API, hybrid) | Every PR and every push to main        |
| `@hybrid`   | Tests that combine API and UI                                                                                                     | PRs, pushes, and the nightly full run  |
| `@a11y`     | Accessibility checks with `@axe-core/playwright`                                                                                  | Nightly full run                       |
| `@external` | Tests that depend on third-party services (e.g. Google sign-in)                                                                   | Nightly full run — kept out of PR runs |

Run a subset locally:

```bash
npx playwright test --grep @smoke          # ~16 tests, ~90s
npx playwright test --grep @a11y           # 4 accessibility scans
npx playwright test --grep @hybrid         # 1 hybrid order test
npx playwright test --grep-invert @external  # exclude third-party deps
```

## Docker

The project includes a `Dockerfile` based on Microsoft's official Playwright
image, so the suite can run on any machine with Docker — no Node or browser
install required.

```bash
# Build once (pins Playwright to the version in package.json)
docker build -t toolshop-playwright .

# Run the full suite
docker run --rm \
  -e TEST_USER_PASSWORD=your-password \
  -v "$(pwd)/playwright-report:/app/playwright-report" \
  toolshop-playwright

# Run only smoke tests
docker run --rm \
  -e TEST_USER_PASSWORD=your-password \
  -v "$(pwd)/playwright-report:/app/playwright-report" \
  toolshop-playwright \
  npx playwright test --grep @smoke
```

The volume mount pulls the HTML report out of the container into the local
`playwright-report/` folder. Bump the `FROM` line in the Dockerfile when
upgrading `@playwright/test`.

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
├── Dockerfile
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
parallelism. CI gets parallelism back via sharding across jobs (below).

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

Three jobs run from `.github/workflows/playwright.yml`:

| Job      | Trigger                                            | What it does                                                                                          |
| -------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `static` | Every run                                          | Lint, format check, TypeScript check. Blocks the other jobs — tests don't run if static fails.        |
| `smoke`  | PR, push to main, manual dispatch (scope=smoke)    | Runs `--grep @smoke` across 2 parallel shards. Typical runtime: ~3–4 min warm cache, ~10–12 min cold. |
| `full`   | Nightly at 02:00 UTC, manual dispatch (scope=full) | Runs every test across 3 parallel shards. Typical runtime: ~10–15 min warm.                           |

The nightly run catches regressions from upstream Toolshop changes between PR
runs. Shard counts are tuned for the suite size — 2 shards keep each smoke
run under 90 seconds; 3 shards keep full-suite wall time under 15 minutes.

### Manual dispatch

From the Actions tab, select the Playwright Tests workflow, click "Run
workflow", and pick `smoke` or `full`.

### Browser caching

Playwright browsers are cached at `~/.cache/ms-playwright`, keyed on
`package-lock.json`. Cold cache runs take ~12 min for the install step;
warm cache runs take ~30 seconds. The cache invalidates automatically on
`npm install` of a new Playwright version.

### Concurrency

The workflow uses a concurrency group per ref. When a new commit is pushed
to a branch with an in-flight run, the in-flight run cancels. This saves CI
minutes without losing meaningful signal — only the latest commit's result
matters.

### Downloading reports

Every CI run uploads its HTML report as an artifact. On any completed run,
scroll to the "Artifacts" section at the bottom. Artifact names follow this
pattern:

- `playwright-report-smoke-shard-{1,2}` — smoke shard HTML reports
- `playwright-report-full-shard-{1,2,3}` — full suite shard HTML reports
- `playwright-traces-{job}-shard-{n}` — only present on failure; contains
  traces to open with `npx playwright show-trace`

Download the zip, extract, and open `index.html` in a browser. Reports are
retained for 14 days.

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
npm run format        # prettier write
npm run format:check  # prettier check (no writes)
npm run lint          # eslint check
npm run typecheck     # tsc --noEmit
```

## Author

Michael Adeyeye — QA Testing Engineer
