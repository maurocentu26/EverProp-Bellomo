# Release: collections and team provisioning

## Deployment order

1. Back up the production MySQL database. Inspect existing `schema_versions` and constraints. Apply pending forward changes only, never the baseline or demo seeders.
2. Apply `database/schema/forward/2026-09-08.001_create_collections.sql` if not already applied, followed by `2026-09-08.002_inventory_manager_role.sql`. The latter replaces `ck_users_role` and preserves all current users. Do not roll back its allowlist while inventory managers exist.
3. Deploy the API with `APP_ENV=production`, `APP_DEBUG=false`, HTTPS session cookies, the real frontend in Sanctum/CORS configuration, and persistent shared Redis for sessions, queue, activation tokens and locks. Keep the hourly collections scheduler running. Do not point production at local Docker URLs.
4. Build/deploy the frontend with `NEXT_PUBLIC_DATA_MODE=api`, the production API URL and tenant slug. Local `.env.local` is ignored and must not be copied to the build environment. Quick demo login buttons are hidden in production builds. Remove or disable any historical demo accounts in the production environment before granting real access; this release does not modify production accounts.
5. Sign in as the existing tenant administrator. Verify inventory, collections and **Alta de Asesor**. Create an authorized advisor or inventory manager, share the activation link privately, activate with a new password and verify the intended access. Creation does not send email automatically.

## Accounts and permissions

`GET /api/v1/admin/users` and `POST /api/v1/admin/users` require user-management policy authorization. POST accepts `firstName`, `lastName`, `email`, E.164 `phone` and `role` (`SALES_ADVISOR` or `INVENTORY_MANAGER`). It rejects client tenant IDs and administrative roles. Accounts start paused without a password. The response contains a 24-hour activation token; it is never returned by the list endpoint.

The frontend uses `/activar#TOKEN` so the token is not sent in the URL to access logs. `POST /api/v1/auth/activate` accepts `token`, `password` and `password_confirmation`, enforces tenant matching and a 12-character password with letters and numbers, and enables the account once. Redis locks serialize activation for the same account. `POST /api/v1/admin/users/{public_id}/activation` supplies a new link for pending accounts when one is lost or expired. Earlier unexpired links also cease working once the account activates.

Advisors can consult the tenant inventory but cannot edit it. Inventory managers can create/update inventory and prices using the existing inventory settings table. They cannot access CRM, collections or user administration. Tenant scope is always enforced server-side. No parallel RBAC tables are introduced.

The old unauthenticated `/setup-simulation-database` HTTP route has been removed. Demo provisioning is an explicitly local console operation and loads only the 73 real-data properties.

## Validation

MySQL/PHP Docker suite covers tenant isolation, role restrictions, activation replay, provisioning validation and collection payments/reversals. Frontend TypeScript, lint and production build are required. Browser checks cover initial loading, opening/submitting a fixed payment plan and notification layout. Local browser test plans are removed after verification.

Pushing a release branch does not apply the SQL or deploy production. Deployment and migrations must be completed in this order before enabling the new UI.
