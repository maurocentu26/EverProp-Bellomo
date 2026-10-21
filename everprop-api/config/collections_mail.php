<?php

return [
    // One explicitly provisioned tenant per deployment; never infer this from a request.
    'enabled' => env('COLLECTIONS_MAIL_ENABLED', false),
    'tenant' => env('COLLECTIONS_MAIL_TENANT'),
    'mailer' => 'collections',
    'from_address' => env('COLLECTIONS_MAIL_FROM_ADDRESS'),
    'from_name' => env('COLLECTIONS_MAIL_FROM_NAME', 'Cobranzas'),
    'reply_to' => env('COLLECTIONS_MAIL_REPLY_TO'),
    // EVP-31: how to pay, approved by the client (account, alias, contact). Without it no email is sent: the text is
    // what a person will act on, so it never falls back to a guess.
    'payment_instructions' => env('COLLECTIONS_MAIL_PAYMENT_INSTRUCTIONS'),
    // Upcoming-installment notice: days before the due date, and earliest local hour it goes out.
    'upcoming_days' => (int) env('COLLECTIONS_UPCOMING_DAYS', 5),
    'upcoming_hour' => (int) env('COLLECTIONS_UPCOMING_HOUR', 9),
    // EVP-53: the unpaid notice goes out once, this many days after the due date, and only for installments that fell
    // due in the last past_due_max_days: older debt is a person's call, never a bulk email on the day this ships.
    'past_due_days' => (int) env('COLLECTIONS_PAST_DUE_DAYS', 3),
    'past_due_max_days' => (int) env('COLLECTIONS_PAST_DUE_MAX_DAYS', 10),
    // Per run, so a backlog or a mistake never floods the provider (the next run picks up the rest).
    'max_per_run' => (int) env('COLLECTIONS_MAIL_MAX_PER_RUN', 200),
];
