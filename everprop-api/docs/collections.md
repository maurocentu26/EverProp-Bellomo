# Online collections

## Implemented scope

Fixed payment agreements, monthly installment schedules, partial payments, immutable payment history with administrative reversals, tenant/advisor authorization, server-side balances and daily deduplicated notifications. All four consumers (collections page, lead financing section, calculator and advisor cockpit) use `/api/v1/admin` in API mode. Mock mode remains explicitly separate. Successful changes refresh other tabs immediately; other devices refresh every 30 seconds or on window focus.

Tables: `payment_agreements`, `installments`, `installment_payments`. Composite tenant foreign keys prevent cross-tenant relationships. Money is stored as `DECIMAL(18,2)` and schedule/payment arithmetic uses integer cents. UI display numbers are never authoritative for writes. Tenant, current advisor and principal balance are derived on the server. Assignment follows the lead's current assigned user. The live schema contract includes the baseline and all current forward changes: 45 tables, 42 tenant tables and 105 foreign keys; the baseline file/hash is unchanged.

Tenant admins and sales managers can view, create, collect and reverse. Advisors can view/create/collect only their assigned leads and cannot reverse. Read-only users can view but cannot write. BOT_OPERATOR and SUPER_ADMIN have no implicit collections bypass. Financial rows have no delete endpoint.

## Schedule rules

- First installment is in the month following `startDate`.
- Due days 29–31 clamp to the month's last valid day.
- Fixed monthly interest is based on initial financed principal, matching `bellomo-financing.ts`.
- Principal cents are distributed across installments; monthly interest is rounded half-up to cents. The schedule totals principal plus the agreed monthly interest charges.
- Manual creation exposes the monthly rate, defaulting to zero; calculator creation sends its selected rate.
- The down payment is an agreed financing term, not a booked collection. Only installment payment ledger entries contribute to collected totals.
- Partial amounts leave a balance. Future partially paid installments expose PARTIALLY_PAID; due/overdue takes precedence once applicable. PAID requires zero remaining balance. Overpayments are rejected.
- Payment reversals retain the original row, actor, time and reason, and reopen completed agreements when necessary.
- CAC and stepped plans remain simulations. Their creation is rejected until index source/period, adjustment history and annual step terms have an approved implementation. No penalty interest is invented or automatically applied.

## Local validation (Docker PHP 8.4 + MySQL only)

For a new database, follow README bootstrap/build/import steps. For an existing local database, apply only the new forward file:

```powershell
./scripts/apply-collections-schema.ps1 -Database bellomo_crm_test
./scripts/apply-collections-schema.ps1 -Database bellomo_crm
docker compose exec everprop-api-php php artisan test --filter=Collections
docker compose exec everprop-api-php vendor/bin/pint --test
docker compose exec everprop-api-php vendor/bin/phpstan analyse
docker compose exec everprop-api-php php artisan test
```

From `everprop-public`, run `npm run test:collections`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

Verify in staging: two browsers with different users; create an agreement from calculator; verify interest/date/rounding; register partial and final payments; retry identical submissions; reverse as manager; confirm advisor/viewer restrictions and cross-tenant 404 responses. Exercise concurrent requests with the same idempotency key and distinct payments racing against the final balance. Confirm only one reminder per recipient/installment/business day and none for fully paid installments.

## Existing browser records

Use **Exportar datos locales** on each browser that holds actual records. Exports do not upload or erase local data and never select records automatically. The browser's original single payment snapshot cannot reconstruct earlier payment history.

Place the JSON inside the repository in an ignored local directory. Review every record, remove sample records, fill `approvedAgreementIds`, and map every selected legacy lead ID to a real lead UUID in `leadMap`. Map non-empty property IDs in `propertyMap`. An example of mapping fields is:

```json
{"approvedAgreementIds":["legacy-agreement-id"],"leadMap":{"legacy-lead-id":"real-lead-uuid"},"propertyMap":{}}
```

Keep the exported `agreements` and `installments` arrays alongside those fields. The importer requires a complete schedule and compares every due date/amount with server generation. Rounding or interest discrepancies block the entire import for review. Incomplete sample schedules, missing mappings, unsupported plans and payments without actual amounts/dates/receipts also block it.

Run through the PHP Docker service (file must be available in its mounted repository):

```text
php artisan everprop:collections:import bellomo /var/www/html/storage/app/private/reviewed.json ADMIN_PUBLIC_UUID
php artisan everprop:collections:import bellomo /var/www/html/storage/app/private/reviewed.json ADMIN_PUBLIC_UUID --apply
```

Use the actual container mount path. Default execution previews inside a transaction and rolls it back. `--apply` commits the reviewed set atomically. Deterministic request keys prevent duplicate imports, and imported notes identify the legacy agreement/payment. Keep exports private and untracked.

## Production rollout

1. Complete Docker/MySQL tests and staging checks before release; back up the production database.
2. Apply only `database/schema/forward/2026-09-08.001_create_collections.sql` with the authorized migration connection. The local PowerShell helper targets local Compose, not Railway. Do not run the baseline importer against production. MySQL DDL is not transactional: inspect any partial failure before retrying.
3. Deploy API code. Existing DML runtime permissions are sufficient after schema provisioning. Test authenticated collections endpoints and denied cross-tenant requests.
4. Run Laravel's scheduler alongside the API (`php artisan schedule:work` as a separate persistent service, or `schedule:run` every minute). Local Compose includes `everprop-api-scheduler`. The hourly task targets trusted slug `bellomo`; add explicit scheduled entries for other tenants. Business dates use the tenant's timezone. It inserts internal notifications only; WhatsApp remains a user-triggered link.
5. Deploy the frontend with `NEXT_PUBLIC_DATA_MODE=api` and the existing backend URL/tenant environment configuration. Empty databases display empty collections, never sample balances. Errors display retry states.
6. Import reviewed legacy records once. Verify the same balances on two devices, correct permissions, receipts and scheduler notifications.
7. If rollback is needed, preserve the new tables and ledger. Disable collection mutations or roll back the frontend/API release together; do not let users resume collecting into the former offline page after online payments have been recorded.

No production changes are performed by development tests or frontend builds.

## Verification performed for this implementation

- Full PHP 8.4/MySQL 8.4 suite: 57 tests, 225 assertions passed, including import preview/replay and schedule mismatch rejection.
- Frontend adapter tests: 4 passed (pagination/no fallback, interest forwarding, ambiguous payment retry and failed post-save refresh).
- TypeScript and production Next.js build passed. Frontend lint has no errors; existing warnings remain.
- Pint passed for the changed backend files. PHPStan passed for collections code and tests; the full repository analysis still reports pre-existing CRM/inventory/notification issues.
- Live MySQL schema verification passed, including the unchanged baseline SHA-256.
- Local validation used a separate `everprop-collections` Compose project with fresh credentials, networks and data volumes. Its local-only override is `.docker/collections-compose.yaml`; use `docker compose -f compose.yaml -f .docker/collections-compose.yaml -p everprop-collections` to manage it in this workspace. The existing `everprop-api` MySQL/Redis containers were not repaired or replaced.
- Production migration, deployment and two-device staging acceptance remain release steps.
