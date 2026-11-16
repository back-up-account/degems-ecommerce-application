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

- Three independently buildable Next.js workspaces under `apps/`: `storefront`, `admin`, and `api`
- Each workspace owns its routes, components, TypeScript configuration, and app-specific code; the UIs communicate with the API over HTTP
- `apps/api` owns API route handlers, authentication, and business logic; the shared Prisma schema and migrations remain at the repository root
- Four department navigation and catalogue filters
- Public catalogue API at `GET /api/catalog/products` and `GET /api/catalog/products/[slug]` for the independently deployed storefront
- Public delivery-area API at `GET /api/delivery-zones`
- Permission-filtered administration dashboard API at `GET /api/admin/dashboard`
- PostgreSQL/Prisma-backed product catalogue with admin product creation, editing, audited stock adjustments, and optional S3 image storage delivered through ImageKit
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

The admin can edit product details and adjust available stock with a required reason; stock changes are recorded in the audit log and cannot reduce availability below zero. Product entry supports a primary HTTPS image URL and up to eight additional HTTPS gallery URLs, which customers can switch between on the product detail page. Administrators can upload JPEG, PNG, WebP, or AVIF images to a private S3 bucket; ImageKit delivers the stored images through optimized HTTPS URLs, which are saved in the existing product image fields. Uploads require the server-side S3 and ImageKit URL endpoint settings documented below. Products can have selectable variants with distinct SKUs and stock, plus optional per-variant prices. Native customer registration now verifies email before asking the customer to choose a password; password recovery uses one-time links. Guest carts migrate into persistent account carts after sign-in. The admin can also create, update, enable, and disable delivery areas and their whole-naira rates. Checkout recalculates those rates from PostgreSQL, and orders snapshot the selected area, address, and fee. Product/order/payment/delivery monetary fields are integer kobo and are formatted as NGN at display boundaries. Manual bank-transfer invoices, customer transfer-reference submission, admin payment confirmation, customer account controls, cancellation/refund actions, and dispatch tracking are implemented. Checkout remains disabled until the intended production database is migrated, real bank details are configured, and the expiry worker is scheduled and tested. The notification dispatcher and Prometheus metrics require provider/secrets configuration and an external schedule/scraper; Redis, full browser-based end-to-end testing, and the complete responsive/accessibility review are not complete. Do not treat these workflows as production-ready; continue to use database transactions, server-side authorization, and PostgreSQL as the durable source of truth.

### Product image storage

Set `PRODUCT_IMAGE_S3_BUCKET`, `PRODUCT_IMAGE_S3_REGION`, and `IMAGEKIT_URL_ENDPOINT` to enable uploads. For S3-compatible storage, optionally set `PRODUCT_IMAGE_S3_ENDPOINT`; set `PRODUCT_IMAGE_S3_FORCE_PATH_STYLE=true` only when the provider requires path-style addressing. The API uses the AWS default credential provider chain (recommended in production, such as an IAM role) unless both `PRODUCT_IMAGE_S3_ACCESS_KEY_ID` and `PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY` are provided. Do not expose these server-side credentials to either UI.

Keep the S3 bucket private and public-access blocking enabled. Give the API identity only the required `s3:PutObject` permission for the product-image prefix. Configure ImageKit with the bucket as a private S3 origin and grant ImageKit read access; set `IMAGEKIT_URL_ENDPOINT` to the corresponding ImageKit URL endpoint. New uploads use immutable object keys and ImageKit delivery URLs. Existing HTTPS image URLs, including Cloudinary URLs, continue to be accepted, but their objects are not copied automatically. Keep the old Cloudinary account/assets available until every existing Cloudinary URL has been migrated or replaced and verified.

## Local setup

Prerequisites: Node.js 20.9 or later, npm, and PostgreSQL.

On a production server, build the workspaces with `npm run build`, then start the required service with `npm run start:api`, `npm run start:admin`, or `npm run start:storefront`. The root `npm run start` is a convenience alias for the storefront. The API validates critical server configuration before accepting requests and fails with the names of missing or invalid settings (never their values) if the PostgreSQL URL, HTTPS `NEXTAUTH_URL`, 32-character `NEXTAUTH_SECRET`, 32-byte base64 `ADMIN_MFA_ENCRYPTION_KEY`, metrics token, order-expiry and notification-worker secrets, or SMTP settings are missing or invalid. Configure each secret through the deployment secret manager. `CHECKOUT_ORDERS_ENABLED` may remain `false`; setting it to `true` also requires the real bank name, account name, and 10-digit account number. Optional S3/ImageKit settings must either be omitted together or include all required bucket, region, and ImageKit endpoint values; explicit S3 credentials must be supplied as a pair. Optional Google credentials must also be supplied as a complete set or omitted. `.env.example` lists the supported settings with local-only placeholders; do not copy those example values into production.

1. Install packages:

   ```sh
   npm install
   ```

2. Create a local environment file and set a strong Auth.js secret and a PostgreSQL connection string:

   ```sh
   cp .env.example .env
   ```

   Update `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in `.env`. Add Google OAuth credentials only if Google sign-in is enabled. To enable admin image uploads, configure the S3 and ImageKit settings described in **Product image storage** as server-only environment variables; leave them unset to use existing HTTPS image URLs instead. Set `BACKEND_API_URL` to the API origin when running or building either UI independently.

3. Generate the Prisma client and apply reviewed migrations:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

   `npm run db:migrate` creates a fresh database from the committed migration history or applies pending migrations. Check applied/pending migrations with `npm run db:migrate:status`. For a database that was created before migrations were added, back it up and verify it matches the original schema first; then baseline it with `npx prisma migrate resolve --applied 20261112000000_initial` and apply the remaining migrations with `npm run db:migrate`. Do not baseline a database whose schema has already been changed with `db:push`; compare it with the migration history and reconcile it deliberately. `db:push` is only for disposable local development databases. Apply migrations once as a deployment step before releasing the application, not independently from multiple app instances.

4. Generate `ADMIN_MFA_ENCRYPTION_KEY` once with a cryptographically secure generator (for example, `openssl rand -base64 32`) and store it in the deployment secret manager. Keep the same key across restarts and backups. Then provision the store administrator through the secret manager or process environment; do not commit credentials or put them in the example file:

   ```sh
   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='use-a-unique-password-of-at-least-12-characters' ADMIN_MFA_ENCRYPTION_KEY='<stable-base64-32-byte-key>' npm run admin:create
   ```

   This creates or promotes that email to `ADMIN`, sets its password, and provisions mandatory authenticator-app MFA. The command prints a one-time `otpauth://` setup URI and ten recovery codes; store them securely and do not retain them in shell logs. Re-running this command changes the password and replaces the MFA secret and all recovery codes, revoking existing sessions. Keep the encryption key stable and backed up; losing it prevents MFA verification. Changing the key requires re-provisioning each administrator.

5. After signing in with the authenticator code, use **Administrator security** on `/admin` to rotate the password. Password changes require the current password, are audited, invalidate all sessions, and revoke outstanding email password-reset links. The email password-reset flow is also available when account email delivery is configured; the admin still needs the authenticator factor to sign in afterward. Store recovery codes separately from the account password.

6. As the owner, use **Staff access** on `/admin` to assign a predefined Catalog, Inventory, Fulfillment, or Finance role to an active customer account with a verified email and password. Deliver the one-time authenticator setup URI and recovery codes securely; the dashboard does not display them again. Role changes revoke existing sessions. Do not share owner credentials with staff.

7. Add the real DEGEMS bank name, account name, and 10-digit account number as `DEGEMS_BANK_NAME`, `DEGEMS_BANK_ACCOUNT_NAME`, and `DEGEMS_BANK_ACCOUNT_NUMBER` in the server's secret manager. Configure a random `ORDER_EXPIRY_SECRET` of at least 32 characters. Keep `CHECKOUT_ORDERS_ENABLED=false` until migrations are applied and the expiry endpoint is scheduled and tested. Never commit or expose these values to the browser.

8. Start the API and the UI you want to use in separate terminals:

   ```sh
   npm run dev:api
   npm run dev:storefront
   npm run dev:admin
   ```

   The storefront is at `http://localhost:3001`; the admin portal is at `http://localhost:3002/admin`; and the API is at `http://localhost:3003`. Set `BACKEND_API_URL` for the UIs to reach the API. Each workspace has its own source tree and TypeScript configuration under `apps/`; the UIs use the API over HTTP and do not import root application source. The root Prisma schema and migrations remain shared infrastructure.

   Build or run the API with `npm run build:api` / `npm run start:api`; build or run each UI with its corresponding `build:*` / `start:*` script. Configure the API service's `NEXTAUTH_URL` to its public API origin. Browser-based sign-in, redirects, and cookie behavior across the UI proxies still needs verification before production cutover.

## Store owner product runbook

1. Sign in at `/account` using the provisioned administrator credentials and authenticator code.
2. Select **Admin** in the storefront header (or open `/admin`) and enter the product name, unique SKU, department, optional subcategory, NGN price (whole naira; stored as kobo), base stock, and descriptions. Upload a primary image or paste an existing HTTPS image URL. Upload controls require the S3 bucket, region, and ImageKit URL endpoint; supported uploads are JPEG, PNG, WebP, or AVIF up to 8 MB. The maximum supported whole-naira unit price is ₦21,474,836 because prices currently use PostgreSQL 32-bit integer kobo.
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

Yes, create product listings through the admin portal at `/admin`. Upload primary and gallery images directly from the product form or paste HTTPS URLs from another trusted host. Uploaded files are checked for supported image signatures and an 8 MB size limit, then sent to S3 from the server; storage credentials are never sent to the browser. ImageKit URLs are saved in the existing product image fields, so no database migration is needed. Replacing a URL does not delete the corresponding S3 object; clean up unused objects only after confirming they are not referenced by another listing. Existing Cloudinary URLs are not migrated automatically.

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
- Keep the admin and storefront as separate route areas in that application, using the same server-side domain logic and Prisma schema; do not create separately deployed APIs that independently own or mutate the shared database.
- Review and commit Prisma migrations as the sole schema-change path. Apply them once through the deployment process with `npm run db:migrate`; use `npm run db:push` only with disposable local databases.
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
| 3. Storefront | Design, catalogue, product pages, discovery, shopping cart | **Partial.** Storefront, department catalogue, product search/category filtering, administrator-managed HTTPS image galleries, optional S3 uploads with ImageKit delivery, selectable variants with independent SKU/stock and optional price overrides, and persistent guest/account carts exist. Variant migration and order-flow tests need dedicated-database validation; S3/ImageKit production configuration and browser-based responsive/accessibility review remain. |
| 4. Authentication and checkout | Google/native authentication, guest checkout, cart migration, checkout validation | **Partial.** Credentials and optional Google sign-in exist; native customer registration, email verification, password recovery, guest-to-account cart migration, guest quote validation, and gated order placement are implemented. Administrators now require TOTP MFA with one-time recovery codes; admin credential changes revoke sessions. The full migration history and account/cart/MFA integration tests passed against a disposable dedicated PostgreSQL database; production SMTP/provider setup and operational sign-off remain. |
| 5. Order and payment processing | Orders, secure invoices, manual transfer, payment reconciliation, reservations and expiration | **Partial.** Gated idempotent order creation supports both expiring guest carts and persistent account carts; secure invoices, manual-transfer reporting and admin confirmation, transactional reservations, integer-kobo totals, and expiry are implemented. Concurrent retry, transfer, confirmation, and expiry integration tests passed locally. Real bank configuration, production reconciliation procedures, and expiry scheduling remain. |
| 6. Administration | Products, inventory, orders, customers, and payments | **Partial.** Predefined least-privilege Catalog, Inventory, Fulfillment, and Finance roles use server-side capability checks; all staff require MFA, and only ADMIN accounts can assign/revoke roles, reset staff MFA, or require a staff password reset. A forced reset sends a one-time email link, revokes existing sessions, and blocks staff sign-in until the password is changed. Role/authorization migrations and integration tests passed on the disposable test database. Secure staff onboarding and production workflow approval remain. |
| 7. Logistics and notifications | Delivery zones/pricing, asynchronous customer/admin notifications | **Partial.** Delivery zones and server-priced quotes are implemented. The PostgreSQL outbox supports webhook/SMTP retries, stale-lock recovery, and audited requeue. DB-backed workflow tests passed locally; production provider setup, external worker schedules, and alert routing remain. |
| 8. Monitoring and security | Prometheus/Grafana, health, audit logging, security validation | **Partial.** `/api/health` checks PostgreSQL, and bearer-protected `/api/metrics` exposes HTTP, business, and database-backed gauges. The admin-only **Activity & audit** pane displays the latest 100 recorded changes; it is not a page-view or read-access log. Prometheus scraping, operational alert rules, and a provisioned Grafana dashboard now use those metrics. Alert delivery/incident ownership and an independent security review still require operator setup and sign-off. |
| 9. Containerization and deployment | Docker, Compose, Nginx, backups, deployment and recovery | **Partial.** A non-root standalone Docker image, Compose stack, TLS-terminating Nginx configuration, and age-encrypted backup/isolated restore scripts are included. Production database hosting, TLS certificates, secret files, backup storage/retention, worker schedules, and a tested recovery exercise remain environment-specific. |
| 10. Final validation | Automated business-flow, security, responsive, and performance tests | **Partial.** GitHub Actions now runs production dependency audit, lint, type-check, unit tests, dedicated-PostgreSQL integration tests/migrations, production build, and Docker image build. Full browser checkout/payment flows, responsive/accessibility review, performance/load testing, independent security testing, and a successful production CI run remain outstanding. |

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
| 2026-11-16 | Phase 3 S3 and ImageKit product image uploads | Added an admin-only upload endpoint with image signature/type and size validation, server-side S3 uploads, ImageKit HTTPS delivery URLs, and primary/gallery file pickers. Existing external HTTPS URLs remain supported, and no database migration is needed. Existing Cloudinary assets are not migrated automatically; S3/ImageKit configuration and browser-based review are still required before production use. |
| 2026-11-13 | Phase 6 least-privilege staff access | Added predefined Catalog, Inventory, Fulfillment, and Finance roles with server-side capability checks, staff MFA enforcement, ADMIN-only role assignment/revocation, session invalidation, and audited MFA reset/onboarding. The additive role migration and DB-backed authorization tests still require a dedicated test database; secure staff credential delivery and onboarding remain operational responsibilities. |
| 2026-11-14 | Staff password reset and activity audit | Added an owner-only forced staff password reset using a one-time email link, session revocation, and sign-in blocking until the password changes. Added the admin-only **Activity & audit** pane, plus audit events for product creation and updates. The pane lists the latest 100 recorded changes, not page views; focused integration tests cover reset expiry/completion, session invalidation, and product-update auditing. |
| 2026-11-13 | Phase 7 failed-notification operations | Added an owner-only dashboard and API to inspect failed outbox jobs and requeue a still-failed notification transactionally with an audit event. The normal worker performs delivery; provider configuration, worker scheduling, production alerting, and DB-backed tests remain. |
| 2026-11-14 | Phases 8–10 operational baseline | Added production config validation, Prometheus/Grafana provisioning and alert rules, standalone Docker/Compose/Nginx deployment files, encrypted backup/isolated restore tools, and CI for unit, database integration, type, build, and container checks. External alert delivery, credentials/hosting, scheduled workers, browser/accessibility/performance checks, independent security review, and production sign-off remain. |

**Current stop point:** Phases 8–10 now have deployable configurations and automated release gates, but they are not production-signed-off. All 12 migrations and 22 DB-backed integration tests passed against a disposable local `degems_test_local` database; GitHub-hosted CI still needs its first successful run. Before launch, configure the production database, secrets, TLS and backup storage; set alert routing and worker schedules; securely onboard staff; and complete browser, responsive/accessibility, load, recovery, and independent security reviews. Checkout remains disabled until its bank configuration and expiry operations are ready.

## Operations and release runbook

### Before a deployment

- Run `npm run lint`, `npm run build`, and `npm run db:generate`.
- Run all database integration tests against a dedicated PostgreSQL database named `degems_test_<suffix>` by setting `TEST_DATABASE_URL` and running `npm run test:integration`. The command applies migrations and refuses database names outside that test prefix.
- Review `npm audit` findings and resolve or formally accept them before release; do not apply automatic dependency fixes without checking compatibility.
- Review schema changes and author/commit migrations. Apply them once before releasing the application with `npm run db:migrate`; do not use `db:push` against production.
- Set production secrets through the deployment platform’s secret manager.
- Configure and back up the stable `ADMIN_MFA_ENCRYPTION_KEY`; require administrator MFA and enforce IP-based login rate limits at the trusted edge/WAF before exposing sign-in publicly. The application also throttles administrator accounts after five failed credential/MFA attempts in a 15-minute window.
- The application sets `nosniff`, frame denial, a strict cross-origin referrer policy, and a restrictive permissions policy on responses. Admin and invoice pages are explicitly non-cacheable. The included Nginx TLS configuration emits HSTS; confirm HTTPS coverage for the canonical hostname before enabling it in production. A nonce-based Content Security Policy and independent security review remain release work.
- Configure `NOTIFICATION_WORKER_SECRET` and schedule authenticated `POST /api/internal/notifications/dispatch` calls. Configure either the admin webhook provider or SMTP (and both if both delivery channels are needed); queued messages are durable if providers are temporarily absent.
- Review **Failed notifications** in `/admin` during operations incidents. Requeue only after investigating the provider/configuration failure; retries are audited and returned to the normal dispatcher. Alert on queue age, repeated failures, and stale worker execution rather than relying solely on manual review.
- Review the admin-only **Activity & audit** pane for recorded changes and staff password-reset events. It is not a page-view or read-access log.
- Configure SMTP and the notification worker before enabling customer registration or password recovery; account verification and reset links expire after 30 minutes.
- Configure a random `METRICS_BEARER_TOKEN` of at least 32 characters and scrape `GET /api/metrics` with `Authorization: Bearer <token>`. Do not expose the metrics endpoint publicly without that token.
- The Compose stack scrapes the authenticated metrics endpoint and provisions Grafana dashboards and Prometheus alert rules. Prometheus evaluates alerts but does not deliver them; configure an alert receiver and assign an on-call owner before relying on alerts.
- Schedule authenticated `POST /api/internal/orders/expire` and `POST /api/internal/notifications/dispatch` requests through the hosting platform's scheduler. Compose intentionally does not create an unmonitored in-container scheduler.
- Drain queued notifications before rotating `NEXTAUTH_SECRET`, because queued invoice links are encrypted with a key derived from it.
- Ensure PostgreSQL is private, TLS-protected, backed up, and configured with connection pooling.
- Keep owner access limited to named operators; assign staff only the least-privilege role required, deliver MFA enrollment materials through a secure channel, and revoke access promptly when duties change.
- Confirm product prices, stock, supplier checks, and publication status with the store owner.

### Health and incidents

- Check `GET /api/health` for application and PostgreSQL readiness; scrape `GET /api/metrics` for HTTP, business, and current database metrics.
- For database failures, stop catalogue changes, check database connectivity and capacity, and restore only from a verified backup after assessing the recovery point.
- Keep PostgreSQL as the source of truth for products, stock, orders, and payments. Redis must only be used for shared ephemeral state once integrated; never rely on cache expiry alone to recover inventory.
- Record operational changes and investigate errors rather than suppressing them. Configure Grafana dashboards and alerts, monitor notification jobs in `queued`/`failed` states, and verify scheduled worker execution before production launch.

### Container deployment

The Compose stack builds and runs the API, storefront, and admin workspaces as separate services; there is no legacy root app. The public and storefront hostnames route to `storefront`, the admin hostname routes to `admin`, and the API hostname routes `/api/*` to `api` while compatibility account, invoice, and static-asset paths route to `storefront`. The single Prisma schema and migrations remain in the root `prisma` directory, owned operationally by the API service; UI images do not run migrations. The stack expects a production `.env`, a PostgreSQL database managed outside Compose, and host-managed secret/certificate files. Set `PUBLIC_DOMAIN` and `STOREFRONT_DOMAIN` to the desired storefront hostnames, and set `API_DOMAIN` and `ADMIN_DOMAIN` to the API and admin hostnames. Compose builds and configures the UIs to use `https://${API_DOMAIN}`. Set `NEXTAUTH_URL` to the public API origin. If Google sign-in is enabled, register `https://${API_DOMAIN}/api/auth/callback/google` as an OAuth redirect URI. The TLS certificate must cover all configured hostnames. Put the metrics token in a protected file and set `METRICS_BEARER_TOKEN_SOURCE` to its host path; do the same for the Grafana admin password with `GRAFANA_ADMIN_PASSWORD_SOURCE`. Provision the TLS chain and key as `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`. These files are excluded from Git and the Docker build context. Sign-in, redirects, Google callbacks, and session-cookie behavior across the proxies have not yet been browser-tested. Apply reviewed migrations once before deploying the API service:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Ports 80/443 are served by Nginx and route to the three app workspaces. Rebuild and deploy each service independently with `docker compose build api` / `docker compose up -d api`, `docker compose build storefront` / `docker compose up -d storefront`, or the equivalent `admin` commands. A backend change requires deploying `api`; UI-only changes can be deployed separately. Prometheus scrapes the API service; Grafana is bound to loopback port 3001 for a local tunnel, and Prometheus is not published to the host. Configure DNS/firewall rules and renew certificates outside the stack. Do not treat `.env.example` values as production secrets.

### PostgreSQL backup and recovery

Install PostgreSQL client tools and `age` on the controlled backup host. Keep the age private identity outside the application host and store its public recipient in `BACKUP_AGE_RECIPIENT`. Set `DATABASE_URL` and a restricted `BACKUP_DIR`, then run:

```sh
npm run backup:db
```

The script streams a custom-format `pg_dump` through age encryption and writes a SHA-256 checksum. Copy the encrypted backup and checksum to separate, access-controlled storage with retention and monitoring. Periodically create an isolated PostgreSQL database named `degems_restore_<suffix>`, set `BACKUP_FILE`, `BACKUP_AGE_IDENTITY_FILE`, and `RESTORE_DATABASE_URL`, then run `npm run restore:db-check`. The restore script refuses any target database not using that prefix and checks the backup checksum before restoring. Verify application-level data and record the recovery exercise; never restore over production with this script.

The backup scripts are operator-run building blocks, not an installed schedule or off-site retention service. Configure those with the chosen hosting/backup platform.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the storefront development server |
| `npm run dev:api` | Start the API development server |
| `npm run dev:admin` | Start the admin development server |
| `npm run dev:storefront` | Start the storefront development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate route types and type-check all workspaces |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Apply migrations and run integration tests against `TEST_DATABASE_URL` |
| `npm run build` | Build all three workspaces |
| `npm run start` | Start the storefront production server |
| `npm run backup:db` | Create an age-encrypted PostgreSQL backup |
| `npm run restore:db-check` | Restore a backup only into a `degems_restore_*` database |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Sync schema to a local development database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run admin:create` | Provision or re-provision administrator credentials, MFA, and recovery codes |

## Architecture guardrails

- Keep business domains modular within the monolith.
- Authorize every administrative operation on the server and validate all input.
- Derive prices and stock from PostgreSQL, never from browser-submitted totals.
- Use explicit database transactions and idempotency for order/payment flows.
- Keep Redis and provider-specific alert delivery as separately configured capabilities; do not treat their presence in infrastructure files as proof they are operational.
