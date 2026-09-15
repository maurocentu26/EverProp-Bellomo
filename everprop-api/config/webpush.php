<?php
return [
    'connection' => env('WEBPUSH_QUEUE_CONNECTION', 'database'),
    'public_key' => env('WEBPUSH_PUBLIC_KEY'),
    'private_key' => env('WEBPUSH_PRIVATE_KEY'),
    'subject' => env('WEBPUSH_SUBJECT'),
];
