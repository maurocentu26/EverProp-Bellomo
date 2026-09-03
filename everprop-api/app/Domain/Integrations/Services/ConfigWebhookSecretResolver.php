<?php

namespace App\Domain\Integrations\Services;

final class ConfigWebhookSecretResolver
{
    public function resolve(string $reference): ?string
    {
        $secrets = config('services.webhooks.secrets', []);

        if (! is_array($secrets)) {
            return null;
        }

        $secret = $secrets[$reference] ?? null;

        return is_string($secret) && $secret !== '' ? $secret : null;
    }
}
