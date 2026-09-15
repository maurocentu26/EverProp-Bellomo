# Release and import of the real inventory

Merging `main` triggers the connected Railway API and Vercel frontend deployments. Deployment never imports data or runs schema changes. Existing inventory remains readable before the new schema is prepared; new enum values are rejected until preparation is recorded.

## Private source and release prerequisites

The repository is public. Keep the workbook, extracted JSON, plans, cleanup lists and backups outside Git, logs and Docker build inputs. The production image includes the Artisan commands below, but excludes operator scripts and `storage/app` contents.

Validate the release with the PHP 8.4/MySQL suite, PHPStan, Pint, Composer validation, frontend lint, TypeScript and the production build. Provision the environment described in [railway-backend.md](railway-backend.md). Use the deployed release's commands through an authorized operator shell with access to the production database. Never load the baseline, demo seeders or a local cleanup payload into production.

1. Take a **full production database backup**, including routines/triggers, and verify restoration in an isolated MySQL database. Keep a durable encrypted copy outside the service filesystem. Record its SHA-256. The inventory before-image generated later is additional evidence, not a substitute for this backup.
2. Inspect the database and tenant slug. Prepare the forward schema using a maintenance connection with DDL privileges. The normal web account should retain its existing limited privileges. Commands below use placeholders that must be replaced with the actual paths, database and hashes.

```sh
php artisan everprop:inventory-source-schema prepare
php artisan everprop:inventory-source-schema prepare --apply \
  --database=ACTUAL_DATABASE --backup=/private/full-backup.sql \
  --backup-sha256=VERIFIED_FULL_BACKUP_SHA256
```

The schema phases are rerunnable; MySQL DDL can partially commit on failure. Correct the reported cause and rerun the same phase. Do not downgrade checks while imported values exist.

## Extract, inspect and rehearse

On the operator workstation with Python and `openpyxl`, extract the original workbook without changing its cells:

```sh
python scripts/extract-inventory-workbook.py /private/tablas_prop_bellomo_real.xlsx /private/source.json
```

Transfer `source.json` privately to the operator environment. This workbook has 3,577 products, 27 developments and 127 lookup rows across three catalogs. The normalizer validates exact headers, source identities and references and reports missing source values. It preserves raw values and does not invent a currency, province, construction progress or positive area for zero-area rows.

```sh
php artisan everprop:inventory-import plan \
  --source=/private/source.json --tenant=ACTUAL_TENANT_SLUG \
  --currency=preserve --plan=/private/reviewed-plan.json \
  --backup=/private/inventory-before.json
```

Review the plan's target database/server/tenant, changes, issues, removals and counts. Preserve its displayed file SHA-256 and keep the before-image off the service disk. Currency policy `preserve` retains existing prices and leaves new prices unset; `unset` clears normalized prices; `ARS` or `USD` imports raw source prices only after explicit currency confirmation. No currency is inferred from amount size.

Existing matching UUIDs and non-source operational metadata are preserved by default. `--replace-metadata` explicitly clears non-source media and commercial metadata on matching inventory. Source project unit totals count workbook units; unrelated retained properties are not part of those source totals.

Cleanup is opt-in: `--cleanup=/private/cleanup.json` accepts only individually reviewed `properties` and `projects` UUID arrays. It rejects foreign-tenant IDs. Database references block deletion; there is no cascading cleanup of CRM, accounts, agreements or payments. Audit any production mock CRM separately before deciding what can be removed. A source row's absence alone does not prove it is mock data.

```sh
php artisan everprop:inventory-import rehearse \
  --source=/private/source.json --plan=/private/reviewed-plan.json \
  --backup=/private/inventory-before.json --plan-sha256=REVIEWED_PLAN_FILE_SHA256
```

Rehearsal runs the complete import, verifies stored source values and relationships, and rolls back. Source, target, before-image and plan must all match. Concurrent database changes invalidate the plan: generate and review a new plan and backup instead of editing the saved plan.

## Apply and verify

Use a maintenance window and pause inventory writes while planning and applying. Keep the same reviewed files and run:

```sh
php artisan everprop:inventory-import apply \
  --source=/private/source.json --plan=/private/reviewed-plan.json \
  --backup=/private/inventory-before.json --plan-sha256=REVIEWED_PLAN_FILE_SHA256
php artisan everprop:inventory-source-schema relations --apply \
  --database=ACTUAL_DATABASE --backup=/private/full-backup.sql \
  --backup-sha256=VERIFIED_FULL_BACKUP_SHA256
php artisan everprop:inventory-import verify \
  --source=/private/source.json --plan=/private/reviewed-plan.json
```

Data changes are one transaction with a tenant-specific lock. Repeating an already applied plan verifies it rather than inserting duplicates. Catalog foreign keys are added only when all existing non-null references across the database resolve; otherwise the relations phase reports pending work. Resolve those references before declaring the data release complete.

Check API readiness, administrator inventory counts and filters, all source statuses, unknown prices, missing-parent display, and an account without price access. Resume writes only after verification. Keep the archived workbook/plan and backups privately. If recovery is required, pause writers and restore the verified full database backup and matching prior application release together; do not run a destructive reverse migration against live imported data.
