<?php

namespace App\Domain\Integrations\Security;

use App\Domain\Integrations\Exceptions\WebhookRejected;
use Carbon\CarbonImmutable;

final class WebhookSignatureVerifier
{
    public function verify(
        string $rawPayload,
        string $timestamp,
        string $idempotencyKey,
        string $providedSignature,
        string $secret,
        int $toleranceSeconds,
        ?CarbonImmutable $now = null,
    ): void {
        if ($secret === '' || preg_match('/\A[0-9]{10}\z/', $timestamp) !== 1) {
            throw $this->invalidSignature();
        }

        $now ??= CarbonImmutable::now('UTC');
        $age = abs($now->getTimestamp() - (int) $timestamp);

        if ($toleranceSeconds < 1 || $age > $toleranceSeconds) {
            throw $this->invalidSignature();
        }

        if (preg_match('/\Asha256=([a-fA-F0-9]{64})\z/', $providedSignature, $matches) !== 1) {
            throw $this->invalidSignature();
        }

        // Binding the delivery key prevents replay under a fresh key while the
        // signed timestamp remains within tolerance.
        $message = $timestamp.'.'.$idempotencyKey.'.'.$rawPayload;
        $expected = hash_hmac('sha256', $message, $secret);

        if (! hash_equals($expected, strtolower($matches[1]))) {
            throw $this->invalidSignature();
        }
    }

    private function invalidSignature(): WebhookRejected
    {
        return new WebhookRejected(
            publicCode: 'INVALID_WEBHOOK_SIGNATURE',
            httpStatus: 401,
            safeMessage: 'The webhook signature is invalid or expired.',
        );
    }
}
