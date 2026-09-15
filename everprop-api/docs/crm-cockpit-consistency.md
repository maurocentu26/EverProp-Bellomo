# Cockpit and agenda consistency

The cockpit cards and queue filters use one classification snapshot. Closed leads are excluded; overdue takes precedence over contact due today. The New filter requires the NEW stage and no recorded commercial contact. All includes current leads, so the three urgency counts need not add up to All. Appointments count scheduled visits, not distinct clients.

Commercial contact history is authoritative. Creation timestamps and internal notes do not prove contact. The latest contact (occurred time, then persisted sequence) replaces its prior commitment. A contact more than ten days old remains overdue even if the next action is scheduled for today. Dates use Argentina time.

Agenda reads, creates and cancels persisted visits in API mode. Cancellation keeps history. New commercial followups supersede only generated appointments; manual appointments remain separate. Tenant and advisor scopes are enforced by the API.

## Local/schema preparation

Before running the changed API against another database, apply the additive extension from the PHP 8.4 runtime:

    php scripts/apply-visit-extension.php

For the dedicated test database use the same command with APP_ENV=testing. The original SQL baseline is unchanged. The extension adds appointment origin and unlinked guest fields; it does not delete existing visits.

## Validation

    php artisan test --filter=TodayVisitsTest

Frontend: `node --test tests/commercial-queue.test.mjs` and `npx tsc --noEmit`.
