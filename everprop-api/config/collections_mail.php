<?php

return [
    // One explicitly provisioned tenant per deployment; never infer this from a request.
    'enabled' => env('COLLECTIONS_MAIL_ENABLED', false),
    'tenant' => env('COLLECTIONS_MAIL_TENANT'),
    'mailer' => 'collections',
    'from_address' => env('COLLECTIONS_MAIL_FROM_ADDRESS'),
    'from_name' => env('COLLECTIONS_MAIL_FROM_NAME', 'Cobranzas'),
    'reply_to' => env('COLLECTIONS_MAIL_REPLY_TO'),
];
