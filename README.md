# DEGEMS E-Commerce Application

DEGEMS is a Nigeria-focused online retailer for practical, carefully selected everyday products. Its brand promise is **Everyday Living. Made Better.**

The application follows the original project direction: a Next.js and TypeScript modular monolith, PostgreSQL via Prisma, Auth.js authentication, and a production architecture intended to add Redis, reliable background processing, Prometheus, and Grafana without introducing unnecessary microservices.

## Business model

The customer catalogue is organised around four primary departments:

- **Kitchen & Dining** — utensils, cookware, storage, food preparation, baking, and drinkware
- **Home Appliances** — cooking, food preparation, cleaning, and household comfort
- **Health & Wellness** — non-medical fitness, personal care, relaxation, and lifestyle products
- **Baby & Kids** — age-appropriate feeding, learning, school, and bedroom essentials

The initial market is Nigeria, with international expansion and multiple currencies treated as future capabilities. Products are not seeded with fabricated examples: the DEGEMS owner enters and publishes the real assortment through the administration area.

## Current implementation

- Next.js App Router, TypeScript, Tailwind CSS, and responsive DEGEMS storefront
- Four department navigation and catalogue filters
- PostgreSQL/Prisma-backed product catalogue with admin product creation, editing, audited stock adjustments, and optional Cloudinary image uploads
- Admin-managed delivery areas with editable integer-kobo rates, activation controls, and audit events
- Auth.js credentials sign-in and database-backed capability checks for admin pages and mutation APIs
- Mandatory authenticator-app MFA for administrator credentials, one-time recovery codes, and encrypted TOTP secrets
- Administrator password changes require the current password and revoke every existing session
- Predefined least-privilege catalog, inventory, fulfillment, and finance staff roles; staff require MFA, and only the owner can assign/revoke roles
- Admin dashboard entry in the storefront header for active administrator and staff sessions
- Admin customer disable controls, order cancellation/restock, refund recording, and dispatch tracking
- Transactional PostgreSQL notification outbox with authenticated webhook/SMTP dispatcher, retry handling, and an admin-only audited retry console for failed notifications
- PostgreSQL-aware health endpoint and bearer-protected Prometheus metrics endpoint
- Product drafts remain hidden until explicitly published
- Persistent guest cart backed by PostgreSQL; the browser receives only an HTTP-only, hashed-token-backed cart identity
- Health endpoint at `/api/health`

The admin can edit product details and adjust available stock with a required reason; stock changes are recorded in the audit log and cannot reduce availability below zero. Product entry supports a primary HTTPS image URL and up to eight additional HTTPS gallery URLs, which customers can switch between on the product detail page. Administrators can also upload JPEG, PNG, WebP, or AVIF images to Cloudinary; the app stores optimized HTTPS delivery URLs, not image binaries. Uploads require server-side `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` configuration. Products can have selectable variants with distinct SKUs and stock, plus optional per-variant prices. Native customer registration now verifies email before asking the customer to choose a password; password recovery uses one-time links. Guest carts migrate into persistent account carts after sign-in. The admin can also create, update, enable, and disable delivery areas and their whole-naira rates. Checkout recalculates those rates from PostgreSQL, and orders snapshot the selected area, address, and fee. Product/order/payment/delivery monetary fields are integer kobo and are formatted as NGN at display boundaries. Manual bank-transfer invoices, customer transfer-reference submission, admin payment confirmation, customer account controls, cancellation/refund actions, and dispatch tracking are implemented. Checkout remains disabled until the intended production database is migrated, real bank details are configured, and the expiry worker is scheduled and tested. The notification dispatcher and Prometheus metrics require provider/secrets configuration and an external schedule/scraper; Redis, full browser-based end-to-end testing, and the complete responsive/accessibility review are not complete. Do not treat these workflows as production-ready; continue to use database transactions, server-side authorization, and PostgreSQL as the durable source of truth.

## Local setup

Prerequisites: Node.js 20.9 or later, npm, and PostgreSQL.

1. Install packages:

   ```sh
   npm install
   ```

2. Create a local environment file and set a strong Auth.js secret and a PostgreSQL connection string:

   ```sh
   cp .env.example .env
   ```

   Update `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in `.env`. Add Google OAuth credentials only if Google sign-in is enabled. To enable admin image uploads, set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as server-only environment variables; leave them unset to use existing HTTPS image URLs instead.

3. Generate the Prisma client and apply reviewed migrations:

   ```sh
   npm run db:generate
   npx prisma migrate deploy
   ```

   `prisma migrate deploy` creates a fresh database from the migration history. For a database that was created before migrations were added, back it up and verify it matches the original schema first; then baseline it with `npx prisma migrate resolve --applied 20261112000000_initial` and apply the remaining migrations using `npx prisma migrate deploy`. Do not baseline a database whose schema has already been changed with `db:push`; compare it with the migration history and reconcile it deliberately. `db:push` is only for disposable local development databases.

4. Generate `ADMIN_MFA_ENCRYPTION_KEY` once with a cryptographically secure generator (for example, `openssl rand -base64 32`) and store it in the deployment secret manager. Keep the same key across restarts and backups. Then provision the store administrator through the secret manager or process environment; do not commit credentials or put them in the example file:

   ```sh
   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='use-a-unique-password-of-at-least-12-characters' ADMIN_MFA_ENCRYPTION_KEY='<stable-base64-32-byte-key>' npm run admin:create
   ```

   This creates or promotes that email to `ADMIN`, sets its password, and provisions mandatory authenticator-app MFA. The command prints a one-time `otpauth://` setup URI and ten recovery codes; store them securely and do not retain them in shell logs. Re-running this command changes the password and replaces the MFA secret and all recovery codes, revoking existing sessions. Keep the encryption key stable and backed up; losing it prevents MFA verification. Changing the key requires re-provisioning each administrator.

5. After signing in with the authenticator code, use **Administrator security** on `/admin` to rotate the password. Password changes require the current password, are audited, invalidate all sessions, and revoke outstanding email password-reset links. The email password-reset flow is also available when account email delivery is configured; the admin still needs the authenticator factor to sign in afterward. Store recovery codes separately from the account password.

6. As the owner, use **Staff access** on `/admin` to assign a predefined Catalog, Inventory, Fulfillment, or Finance role to an active customer account with a verified email and password. Deliver the one-time authenticator setup URI and recovery codes securely; the dashboard does not display them again. Role changes revoke existing sessions. Do not share owner credentials with staff.

7. Add the real DEGEMS bank name, account name, and 10-digit account number as `DEGEMS_BANK_NAME`, `DEGEMS_BANK_ACCOUNT_NAME`, and `DEGEMS_BANK_ACCOUNT_NUMBER` in the server's secret manager. Configure a random `ORDER_EXPIRY_SECRET` of at least 32 characters. Keep `CHECKOUT_ORDERS_ENABLED=false` until migrations are applied and the expiry endpoint is scheduled and tested. Never commit or expose these values to the browser.

8. Start the development server:

   ```sh
   npm run dev
   ```

   Open `http://localhost:3000` and sign in with the provisioned administrator account. The storefront header shows the **Admin** link for active MFA-enrolled administrators and staff; `/admin` remains available as a direct route and performs its own authorization check.

## Store owner product runbook

1. Sign in at `/account` using the provisioned administrator credentials and authenticator code.
2. Select **Admin** in the storefront header (or open `/admin`) and enter the product name, unique SKU, department, optional subcategory, NGN price (whole naira; stored as kobo), base stock, and descriptions. Upload a primary image or paste an existing HTTPS image URL. Upload controls require the three Cloudinary environment variables; supported uploads are JPEG, PNG, WebP, or AVIF up to 8 MB. The maximum supported whole-naira unit price is ₦21,474,836 because prices currently use PostgreSQL 32-bit integer kobo.
3. Keep **Publish in the customer store** unchecked while reviewing a listing. Check it only when details, pricing, stock, supplier quality, and product imagery are ready.
4. For options such as size or colour, add a variant with a unique SKU and its own stock. A blank variant price uses the product price; an entered price overrides it. Customers must choose an available variant before adding it to the cart. Adjust saved variant stock separately so the change is audited.
5. Save the product. The administrator catalogue shows drafts and published products and variants; the customer catalogue shows only published products with active variants.
6. Search and filter the customer catalogue at `/products` to verify the listing.
7. Use **Edit** to update product details and pricing. Use **Adjust stock** for products without active variants; for variant products, use **Adjust variant stock**. Enter a positive or negative whole-unit adjustment and a reason. Adjustments apply to available stock, excluding units reserved for existing orders.

Select products based on Nigerian demand, supplier reliability, useful life, quality, competitive pricing, margins, shipping cost, warranty, and return considerations. Verify appliance electrical safety and after-sales support. Record age suitability and safety details for children’s products. Do not make unverified medical claims for wellness products.

## Delivery area runbook

1. In `/admin`, use **Delivery areas and rates** to add each service area with its customer-facing name and whole-naira fee.
2. Verify each area and fee before enabling it. Active areas are offered during checkout; customers can always select free pickup.
3. Use **Save fee** to change a rate for future quotes. Existing orders retain their original fee and delivery details.
4. Disable an area to stop new quotes without deleting its history or changing existing orders.
5. Confirm local and production rates with the delivery operator; no delivery areas or rates are pre-seeded.

Yes, create product listings through the admin portal at `/admin`. Upload primary and gallery images directly from the product form or paste HTTPS URLs from another trusted host. Uploaded files are checked for supported image signatures and an 8 MB size limit, then sent to Cloudinary from the server; provider credentials are never sent to the browser. Cloudinary URLs are saved in the existing product image fields, so no database migration is needed. Removing or replacing a URL does not delete the corresponding Cloudinary asset; clean up unused assets in Cloudinary after confirming they are not shared by another listing.

## Cart runbook

- Product pages can add published products to a guest cart. Cart items persist in PostgreSQL for up to 30 days through a secure, HTTP-only cookie; the raw cookie token is not stored in the database.
- Quantity changes are validated against current published status and stock. Prices and subtotals are recalculated from product records, never accepted from the browser.
- Checkout order creation is disabled unless `CHECKOUT_ORDERS_ENABLED=true`. Keep it disabled until the migrations are applied to a backed-up database, real bank instructions are configured, and the scheduled expiry worker is tested.
- The order endpoint requires a UUID `Idempotency-Key` header and atomically snapshots current cart prices, decrements available stock, stores the order and two-hour inventory reservations, and empties the cart. The browser never supplies prices.
- Each created order has a unique DEGEMS payment reference and a secure invoice URL backed by a random token whose SHA-256 hash is stored. The invoice shows the exact order total and bank instructions from server-side environment configuration.
- Customers can submit a bank transaction reference through the secure invoice; that moves payment to `under_review`, not to paid. An admin must independently verify a cleared bank credit, then confirm it from `/admin`. Confirmation records the admin and an audit event and cannot be repeated.
- `POST /api/internal/orders/expire` releases expired reservations exactly once. Call it from a trusted scheduler with `Authorization: Bearer <ORDER_EXPIRY_SECRET>`; the endpoint returns 503 until a sufficiently strong server-only secret is configured.
- All monetary values in the database and checkout APIs are integer kobo; customer/admin forms and displays use NGN. A product price entered as ₦123 is stored as `12300`.
- The `20261113110000_prices_to_kobo` migration converts existing NGN integer values in products, variants, orders, order items, and payments. Back up first and apply it exactly once to a database that still stores those values in whole naira. It aborts if a value exceeds the supported integer range; review such rows rather than forcing the migration.

## Architecture and implementation roadmap

The implementation follows the original project specification and its DEGEMS business-model addition. The business-model section specializes the product departments and retail positioning; it does not replace the security, data-integrity, or operational requirements in the original specification.

### Architecture decisions

- Keep one Next.js modular monolith, with domain boundaries for identity, catalogue/inventory, carts, orders, payments, delivery, administration, notifications, and operations.
- PostgreSQL/Prisma is authoritative for products, prices, stock, carts, orders, reservations, and payment records. Redis may coordinate/cache ephemeral work, but must not be the only record of an order, payment, or inventory change.
- Guest and signed-in checkout use the same validated server-side order flow. The browser submits identifiers, quantities, customer details, and a delivery choice; the server reloads products, prices, stock, and delivery rates.
- Create orders, line-item price snapshots, payment records, and stock reservations in a database transaction. Use an idempotency key and inventory locking/conditional updates to prevent duplicate orders and overselling.
- Fulfillment status and payment status are separate state machines. The intended fulfillment path is `pending_payment` → `payment_under_review` → `confirmed` → `processing` → `ready_for_dispatch` → `shipped` → `delivered`, with valid cancellation, expiration, and refund paths. Payment confirmation must be idempotent and authorized.
- Manual bank transfer is the initial payment method specified by the original prompt. Store bank instructions only in server-side configuration/protected settings. Invoices use a cryptographically random access token whose hash is stored; UUIDs alone do not authorize invoice access.
- The default delivery option is free pickup. Door delivery fees come from administrator-configured zones and are calculated on the server. Unpaid inventory reservations default to a two-hour window; durable database-backed expiration processing must release them idempotently.
- DEGEMS remains the source of real product listings. No sample products, fabricated sales, stock, or payment confirmations are introduced.

### Phase-by-phase status

| Phase | Scope from the original prompt | Status in this repository |
| --- | --- | --- |
| 1. Architecture and planning | Domains, data model, authentication, order/payment state machines, technical decisions | **Documented, not signed off.** Architecture boundaries and order/payment decisions are recorded above; reconcile them against the complete original brief and owner decisions before production. |
| 2. Foundation | Next.js/TypeScript/Tailwind, PostgreSQL/Prisma, Redis, environment and modular structure | **Partial.** Next.js, TypeScript, Tailwind, Prisma, and an environment template exist. Redis and production operational setup are not integrated. |
| 3. Storefront | Design, catalogue, product pages, discovery, shopping cart | **Partial.** Storefront, department catalogue, product search/category filtering, administrator-managed HTTPS image galleries, optional Cloudinary uploads, selectable variants with independent SKU/stock and optional price overrides, and persistent guest/account carts exist. Variant migration and order-flow tests need dedicated-database validation; Cloudinary credentials and browser-based responsive/accessibility review remain. |
| 4. Authentication and checkout | Google/native authentication, guest checkout, cart migration, checkout validation | **Partial.** Credentials and optional Google sign-in exist; native customer registration, email verification, password recovery, guest-to-account cart migration, guest quote validation, and gated order placement are implemented. Administrators now require TOTP MFA with one-time recovery codes; admin credential changes revoke sessions. Verification/reset emails use the durable outbox and require configured SMTP plus the notification worker. New account/cart/MFA migrations and database-backed integration tests still need validation on a dedicated test database. |
| 5. Order and payment processing | Orders, secure invoices, manual transfer, payment reconciliation, reservations and expiration | **Partial.** Gated idempotent order creation supports both expiring guest carts and persistent account carts, and links account-cart orders to their owner; secure invoices, manual-transfer reporting and admin confirmation, transactional reservations, integer-kobo totals, and an expiry endpoint exist. Integration coverage includes concurrent retries and expiry runs plus transfer reporting and confirmation, but still needs execution on a dedicated test database; production bank configuration and expiry scheduling remain. |
| 6. Administration | Products, inventory, orders, customers, and payments | **Partial.** Predefined least-privilege Catalog, Inventory, Fulfillment, and Finance roles now use server-side capability checks; all staff require MFA, and only the owner can assign/revoke roles or reset staff MFA. Product, inventory, order, customer, payment, delivery, security, and staff operations remain role-gated and audited. Dedicated-database migration/authorization tests and production onboarding/workflow validation remain. |
| 7. Logistics and notifications | Delivery zones/pricing, asynchronous customer/admin notifications | **Partial.** Delivery zones and server-priced quotes are implemented. Order, payment, expiration, fulfillment, cancellation, and refund events are written to a PostgreSQL outbox in the same transaction. The dispatcher supports configured webhook and SMTP providers with retries and stale-lock recovery; owners can inspect up to 50 failed notifications and transactionally requeue one with an audit event. Provider setup, scheduled execution, alerting, and dedicated-database tests remain. |
| 8. Monitoring and security | Prometheus/Grafana, health, audit logging, security validation | **Partial.** `/api/health` checks PostgreSQL, and bearer-protected `/api/metrics` exposes HTTP, business, and database-backed gauges. Admin workflows have audit records and account disabling is checked on existing sessions. Focused integration coverage exists but requires execution on a dedicated test database; independent security review, Grafana dashboards, and production alerting remain. |
| 9. Containerization and deployment | Docker, Compose, Nginx, backups, deployment and recovery | **Not implemented.** |
| 10. Final validation | Automated business-flow, security, responsive, and performance tests | **Not complete.** Lint, type-check, and unit tests can be run locally; DB-backed role/notification/order tests require the dedicated test database. Full checkout/order/payment browser flows, responsive/accessibility checks, performance testing, and independent security testing remain. |

### Milestone log

| Date | Milestone | Result |
| --- | --- | --- |
| 2026-11-13 | Phase 1 roadmap and architecture decisions | Documented the original prompt's modular-monolith boundaries, PostgreSQL/Redis responsibilities, order/payment state separation, manual bank transfer, two-hour reservation window, and delivery defaults. |
| 2026-11-13 | Phase 4 checkout review entry | Checkout now reads and displays the server-side cart, distinguishes an empty cart from a missing database, and explicitly states that no order or payment is created. Removed the unused form that simulated a successful order. |
| 2026-11-13 | Phase 4 guest checkout validation | Added server-side validation for a guest's full name, email, Nigerian mobile number, pickup method, and current cart availability. The quote is recalculated from PostgreSQL; personal details are not persisted, and no order or inventory reservation is created. Lint, TypeScript, and focused input-validation checks passed. |
| 2026-11-13 | Phase 5 order foundation | Added a database migration for idempotent orders and durable inventory reservations; added gated order creation with server-side cart repricing and transactional stock updates, plus a secret-protected expiry endpoint. Prisma validation/generation, lint, type-check, and production build passed. No database URL is configured here, so migration application and transaction behavior still need integration testing. Payment and expiry operations are not configured, so order creation remains disabled by default. |
| 2026-11-13 | Phase 5 integer-kobo pricing | Product entry converts whole-naira input to integer kobo; catalog/cart/order/payment amounts now share kobo units and customer displays format back to NGN. Added a guarded data migration for existing monetary records. |
| 2026-11-13 | Phase 5 manual-transfer workflow | Added hashed-token invoice access, server-configured bank instructions, transfer-reference reporting, admin verification, idempotent payment confirmation, and audit records. Lint, TypeScript, Prisma validation, production build, and focused pricing/bank-configuration checks pass. Checkout remains gated pending database migration, real bank configuration, a tested expiry schedule, and database-backed end-to-end checks. |
| 2026-11-13 | Phase 6 fulfillment transitions | Added an admin-only API and UI for sequential `confirmed` → `processing` → `ready_for_dispatch` → `shipped` → `delivered` updates. The server requires confirmed payment, rejects invalid or stale transitions, and records each change with the admin actor in the audit log. |
| 2026-11-13 | Phase 6 product editing and stock management | Added admin product-detail editing and reason-required stock adjustments with transactional concurrency checks and audit events. Corrected the form/API money boundary so entered whole-naira amounts are not multiplied into kobo twice. Authenticated API checks verified kobo storage, edits, stock audit logging, and rejection of unauthenticated or underflowing adjustments; temporary test products were removed. |
| 2026-11-13 | Local database workflow validation | Applied all four migrations to a fresh loopback-only PostgreSQL test database. Temporary test records exercised idempotent order creation, invoice retry access, transfer reporting, admin payment confirmation, fulfillment ordering/audit records, expiry, and stock release; the fixtures were removed afterward. |
| 2026-11-13 | Local demo setup | Provisioned an ignored, permission-restricted `.env.local`, a loopback-only PostgreSQL database, and a temporary administrator account. Verified credentials login, the ADMIN session role, and authenticated `/admin` response. Checkout remains disabled and no real bank details or product fixtures were added. |
| 2026-11-13 | Local runtime smoke validation | Re-applied the migration history to the local database and verified admin provisioning, credentials login, the admin dashboard, rejection of unauthenticated admin mutations, product-input validation, disabled checkout, and expiry-endpoint authorization. No product or order data was created. |
| 2026-11-13 | Phase 7 delivery zones and pricing | Added admin-managed delivery areas with audited create, rate update, and activation changes. Checkout validates the selected active area and address, recalculates the fee from PostgreSQL, and displays the quoted total; order creation records the fee and delivery details in its transaction. The new migration, build, lint, and live quote/admin flows passed using temporary fixtures, which were removed. |
| 2026-11-13 | Phases 6–8 implementation | Added customer account disabling, transactional cancellation/restock and refund recording, carrier/tracking requirements, and transactional PostgreSQL notification jobs for order/payment/fulfillment events. Added a protected dispatcher with webhook/email delivery, retry/backoff, and stale-lock recovery; database health checks and protected Prometheus metrics are also implemented. The additive migration and all historical migrations passed on a new isolated PostgreSQL database; seven Phase 6–8 integration tests, lint, type-check, and production build pass. There are no production advisories or high/critical findings; seven moderate findings remain in development dependencies. Provider setup and full browser-based workflow tests remain. |
| 2026-11-13 | Phase 4 native customer account lifecycle | Added pending registration records without storing a password before email ownership is proven; after verification the customer chooses a password. Added one-use hashed verification/reset tokens, generic recovery responses, an active-token cooldown, encrypted email-outbox links, and auth-version checks that revoke existing sessions after password recovery. The new migration and integration cases are added; this environment has no `TEST_DATABASE_URL`, so database-backed account tests and migration application remain pending. |
| 2026-11-13 | Phase 4 signed-in cart migration | Added persistent account carts and transactionally attaches a guest cart or merges its items into the existing account cart after credential or Google sign-in. Database-backed migration and merge tests still require a configured dedicated test database. |
| 2026-11-13 | Administrator security baseline | Added mandatory TOTP for admin credential sign-in, encrypted authenticator secrets, single-use recovery codes, per-admin login throttling, audited current-password changes, and session invalidation on password or MFA reprovisioning. MFA encryption key configuration and the additive migrations must be completed before production; database integration tests and deployment-level IP rate limiting still remain. |
| 2026-11-13 | Phase 5 account-cart checkout | Fixed order creation to accept persistent account carts, whose expiry is null, link orders to their account owner, and preserve guest-cart expiration rules. Same-key concurrent requests now recover the winning order if the cart is already consumed or a serializable transaction conflicts; concurrent expiry runs do not release inventory twice. Added integration coverage for account-cart ownership, concurrent and sequential idempotent retries, manual-transfer reporting and confirmation, and exactly-once expiry; the new tests await a dedicated test database. |
| 2026-11-13 | Phase 3 selectable product variants | Connected product variants to admin creation/editing, customer selection, distinct cart lines, variant-specific price/stock, order snapshots, reservation/release, and audited stock adjustments. Added an additive migration and focused unit/integration coverage. Product image fields remain HTTPS URLs; test-database migration/integration and browser-based responsive/accessibility review are pending. |
| 2026-11-13 | Phase 3 Cloudinary product image uploads | Added an admin-only upload endpoint with image signature/type and size validation, server-side Cloudinary credentials, optimized HTTPS delivery URLs, and primary/gallery file pickers. Existing external HTTPS URLs remain supported, and no database migration is needed. Cloudinary credentials and browser-based review are still required before production use. |
| 2026-11-13 | Phase 6 least-privilege staff access | Added predefined Catalog, Inventory, Fulfillment, and Finance roles with server-side capability checks, staff MFA enforcement, owner-only role assignment/revocation, session invalidation, and audited MFA reset/onboarding. The additive role migration and DB-backed authorization tests still require a dedicated test database; secure staff credential delivery and onboarding remain operational responsibilities. |
| 2026-11-13 | Phase 7 failed-notification operations | Added an owner-only dashboard and API to inspect failed outbox jobs and requeue a still-failed notification transactionally with an audit event. The normal worker performs delivery; provider configuration, worker scheduling, production alerting, and DB-backed tests remain. |

**Current stop point:** Phases 1–8 have substantial implementation but are not all production-signed-off. Phase 6 now has predefined least-privilege staff roles with MFA and owner-managed onboarding; Phase 7 has an admin-only failed-notification requeue console with transactional audit. `TEST_DATABASE_URL` is unset here, so migration application and database-backed authorization, notification, and order tests remain pending. Checkout remains disabled. Before launch, validate the full migration history on a dedicated `degems_test_*` database, configure stable MFA and provider secrets, securely onboard staff, schedule and monitor expiry/notification workers, and complete responsive/accessibility and browser end-to-end testing. Phase 9 deployment/containerization and Phase 10 full production validation remain outstanding.

## Operations and release runbook

### Before a deployment

- Run `npm run lint`, `npm run build`, and `npm run db:generate`.
- Run all database integration tests against a dedicated PostgreSQL database named `degems_test_<suffix>` by setting `TEST_DATABASE_URL` and running `npm run test:integration`. The command applies migrations and refuses database names outside that test prefix.
- Review `npm audit` findings and resolve or formally accept them before release; do not apply automatic dependency fixes without checking compatibility.
- Review schema changes and author/apply migrations; do not use `db:push` against production.
- Set production secrets through the deployment platform’s secret manager.
- Configure and back up the stable `ADMIN_MFA_ENCRYPTION_KEY`; require administrator MFA and enforce IP-based login rate limits at the trusted edge/WAF before exposing sign-in publicly. The application also throttles administrator accounts after five failed credential/MFA attempts in a 15-minute window.
- The application sets `nosniff`, frame denial, a strict cross-origin referrer policy, and a restrictive permissions policy on responses. Admin and invoice pages are explicitly non-cacheable. Configure HSTS at the HTTPS-terminating edge after confirming HTTPS coverage for every affected hostname; a nonce-based Content Security Policy and independent security review remain release work.
- Configure `NOTIFICATION_WORKER_SECRET` and schedule authenticated `POST /api/internal/notifications/dispatch` calls. Configure either the admin webhook provider or SMTP (and both if both delivery channels are needed); queued messages are durable if providers are temporarily absent.
- Review **Failed notifications** in `/admin` during operations incidents. Requeue only after investigating the provider/configuration failure; retries are audited and returned to the normal dispatcher. Alert on queue age, repeated failures, and stale worker execution rather than relying solely on manual review.
- Configure SMTP and the notification worker before enabling customer registration or password recovery; account verification and reset links expire after 30 minutes.
- Configure a random `METRICS_BEARER_TOKEN` of at least 32 characters and scrape `GET /api/metrics` with `Authorization: Bearer <token>`. Do not expose the metrics endpoint publicly without that token.
- Drain queued notifications before rotating `NEXTAUTH_SECRET`, because queued invoice links are encrypted with a key derived from it.
- Ensure PostgreSQL is private, TLS-protected, backed up, and configured with connection pooling.
- Keep owner access limited to named operators; assign staff only the least-privilege role required, deliver MFA enrollment materials through a secure channel, and revoke access promptly when duties change.
- Confirm product prices, stock, supplier checks, and publication status with the store owner.

### Health and incidents

- Check `GET /api/health` for application and PostgreSQL readiness; scrape `GET /api/metrics` for HTTP, business, and current database metrics.
- For database failures, stop catalogue changes, check database connectivity and capacity, and restore only from a verified backup after assessing the recovery point.
- Keep PostgreSQL as the source of truth for products, stock, orders, and payments. Redis must only be used for shared ephemeral state once integrated; never rely on cache expiry alone to recover inventory.
- Record operational changes and investigate errors rather than suppressing them. Configure Grafana dashboards and alerts, monitor notification jobs in `queued`/`failed` states, and verify scheduled worker execution before production launch.

### PostgreSQL backup and recovery

Take automated, encrypted backups using the hosting provider or a controlled backup job. A manual custom-format backup can be made with:

```sh
pg_dump "$DATABASE_URL" --format=custom --file="degems-$(date +%F).dump"
```

Store backups outside the application host with access controls and retention. Periodically restore a backup into a non-production database and verify the data before relying on the procedure. Never restore over production without an approved incident plan.

The manual `pg_dump` output is not encrypted. Keep it in a secured environment and encrypt it before transfer or long-term storage.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local application |
| `npm run lint` | Run ESLint |
| `npm run build` | Create and type-check the production build |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Sync schema to a local development database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run admin:create` | Provision or re-provision administrator credentials, MFA, and recovery codes |

## Architecture guardrails

- Keep business domains modular within the monolith.
- Authorize every administrative operation on the server and validate all input.
- Derive prices and stock from PostgreSQL, never from browser-submitted totals.
- Use explicit database transactions and idempotency for order/payment flows.
- Add Redis, queues, payment reconciliation, shipping zones, audit logging, monitoring, and deployment infrastructure as distinct, tested capabilities rather than placeholders.
