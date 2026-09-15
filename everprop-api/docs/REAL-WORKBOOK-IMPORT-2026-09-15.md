# Bellomo real inventory import — 15 September 2026

## Result

Imported the complete `tablas_prop_bellomo_real.xlsx` into the **local** Docker MySQL database `bellomo_crm`, tenant `bellomo` (ID 1).

Source SHA-256: `84962453d91165495bd5c3f2c8fc067d4650abae4dc4199446b05b7dcd4bddf4`.

| Workbook sheet | Source rows | Database representation |
| --- | ---: | --- |
| Productos | 3,577 | `properties`, original columns in `legacy_data_json` |
| Edificio | 27 | `projects`, original columns in `legacy_data_json` |
| ProdT01 | 17 | `legacy_property_types` |
| Estado | 8 | `legacy_property_statuses` |
| Localidades | 102 | `legacy_localities` |

All **3,731 source rows and 86,588 data cells** were reconciled against the stored source values. The full extracted workbook, including headers, source row numbers, nulls and dates, is retained in `inventory_source_imports.workbook_json`. The XLSX itself was not modified. Dates are represented as ISO strings in JSON; source strings, including padding, remain intact in source JSON. Normalized display fields trim padding.

## Replacement and cleanup

- Updated 59 existing properties with matching source codes and inserted 3,518 additional properties.
- Removed 14 previously seeded properties from development 77, which is absent from this workbook, and one explicitly named QA property.
- Updated the two matching developments, inserted 25, and removed the previously seeded development 77.
- Removed 10 original demo leads and five explicitly named QA leads, their 15 contacts, 10 visits, seven follow-ups, 10 touchpoints, one property link and eight notifications.
- Preserved all four login accounts, tenant configuration, permissions and system configuration. No agreements or payments existed in the target database.
- Removed invented prices, areas, services, financing terms, descriptions, photos and project progress from the prior seed. Source descriptions and positive source areas replace them.

## Structure and mapping

- A product's identity is `(tenant_id, EdId, trimmed ProPis, trimmed ProDep)`, now protected by a unique key. The display code is `EdId-ProPis-ProDep`.
- Existing public IDs are preserved for matched properties and developments.
- `Edificio.EdId` maps to `projects.legacy_id`. Products link to their matching project using a tenant-scoped foreign key. The one missing source parent is represented by a null `project_id`, with its original `EdId` retained.
- `ProTId` and `ProEId` link to tenant-scoped catalog keys through foreign keys. Missing source values remain null; normalized categories/statuses use `UNKNOWN` where necessary.
- `Edificio.LocCod` is resolved through `Localidades` for the display city. The original locality code remains in project source JSON. The source does not contain province names, so none were invented.
- Normalized property categories follow the workbook type labels. Project type is derived from its units (apartments → building, lots → land development, otherwise commercial; the empty development named as a loteo remains land development).
- Project `EN OBRA` maps to `UNDER_CONSTRUCTION`, `DISPONIBLE` to `AVAILABLE`; blank/unspecified project statuses map to `UNKNOWN`. Progress is null because the workbook does not supply construction percentages. Unit totals are calculated from the actual product rows.
- Operation is derived only when the source status identifies sale/rent. Reserved, non-sellable, non-marketed or missing statuses do not imply a sale operation.

| Source state | Stored status | Rows |
| --- | --- | ---: |
| EN ALQUILER / EN VENTA | AVAILABLE | 255 |
| ALQUILADO | RENTED | 161 |
| VENDIDO | SOLD | 2,314 |
| RESERVADO | RESERVED | 9 |
| NO VENDIBLE | NOT_SELLABLE | 749 |
| NO COMERCIALIZADO | NOT_MARKETED | 88 |
| Missing | UNKNOWN | 1 |

The panel and legacy export now distinguish unavailable states instead of treating them as available or reserved. Export also preserves original prices when an app price is unset.

## Source issues still requiring source correction

These are workbook gaps, not dangling database foreign keys. All affected rows were retained.

| Sheet and row | Source key | Issue |
| --- | --- | --- |
| Edificio, row 13 | EdId 57 | Missing LocCod; city remains unknown for its 254 units |
| Productos, row 1604 | 59-- | Both unit key components and ProTId are blank |
| Productos, row 1637 | 59-AP11-2 | ProM2 is 0; normalized area is null, original zero retained |
| Productos, row 2855 | 83-AP37-1 | ProM2 is 0; normalized area is null, original zero retained |
| Productos, row 3151 | 109-F-1 | EdId 109 has no Edificio row; property remains unassigned |
| Productos, row 3155 | 110-1P-G | Missing ProTId |
| Productos, row 3180 | 130-AP3-3 | Missing ProTId and ProEId |

The workbook has **no currency column**. All original `ProPre` amounts are preserved in each property's source JSON and the complete source archive. App `price` and `currency_code` remain null pending currency confirmation; amount size is never used to guess ARS versus USD. Province and construction progress are also absent from the source.

## Verification

- Full data import and cleanup rehearsed inside a transaction and rolled back successfully before committing.
- Independent source-to-database comparison passed for every product, project and all five archived sheets.
- Exactly 3,576 product rows link to the 27 source developments; one retains its unresolved source parent.
- All **114 database foreign-key checks passed**, with zero dangling relationships.
- Authenticated API filters return the exact source counts for all seven stored property states. Project API totals match all 27 developments and 3,576 linked units.
- All four accounts passed login and nine module endpoint checks each.
- Frontend TypeScript check passed after source status support was added.
- Existing inventory contract tests passed: five tests, 12 assertions, including tenant-input rejection and publication/filter rules.

## Backup and local verification

Pre-import backup (schema and rows): workspace `.tmp/bellomo-before-workbook-20260915.json`, also saved in the PHP container at `storage/app/private/bellomo-before-workbook-20260915.json`.

Backup SHA-256: `3ea8022bdd2d162ebaf0fd04e71a57452afbb867dd964bc71ee0987ceda2b029`.

The reviewed import payload is stored in workspace `.tmp/bellomo-import.json` and container `storage/app/private/bellomo-import.json`. These data/backup files are ignored by Git. Schema extensions are in the forward migrations dated `2026-09-15`; the baseline is unchanged.

For future imports use the reviewed, tenant-specific [production import workflow](inventory-production-import.md). The local payload and its cleanup IDs are not portable to another database. Do not run the older `import_bellomo_data.py` for a real refresh: it supplies synthetic fallback values.
