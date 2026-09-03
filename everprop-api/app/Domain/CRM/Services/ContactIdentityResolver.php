<?php

namespace App\Domain\CRM\Services;

use App\Domain\CRM\Exceptions\PublicLeadRejected;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ContactIdentityResolver
{
    /**
     * @param  array<string, mixed>  $contactData
     * @param  array<string, mixed>  $identityData
     * @return array{id: int, public_id: string, created: bool}
     */
    public function resolve(int $tenantId, array $contactData, array $identityData, CarbonImmutable $occurredAt): array
    {
        $channel = (string) $identityData['channel_type'];
        $providerId = $this->canonicalProviderId($channel, (string) $identityData['provider_user_id']);

        try {
            return DB::transaction(fn (): array => $this->resolveInTransaction(
                $tenantId,
                $contactData,
                $identityData,
                $channel,
                $providerId,
                $occurredAt,
            ), 3);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            // A concurrent request may have won the identity unique key. The
            // losing transaction is rolled back, so it is safe to read winner.
            return DB::transaction(function () use ($tenantId, $channel, $providerId): array {
                $identity = DB::table('contact_identities')
                    ->where('tenant_id', $tenantId)
                    ->where('channel_type', $channel)
                    ->where('provider_scope_id', '')
                    ->where('provider_user_id', $providerId)
                    ->lockForUpdate()
                    ->first(['contact_id']);

                if ($identity === null) {
                    throw new PublicLeadRejected('The contact identity could not be resolved.');
                }

                $contact = $this->activeContact($tenantId, (int) $identity->contact_id, true);

                return ['id' => (int) $contact->id, 'public_id' => (string) $contact->public_id, 'created' => false];
            }, 3);
        }
    }

    /**
     * @param  array<string, mixed>  $contactData
     * @param  array<string, mixed>  $identityData
     * @return array{id: int, public_id: string, created: bool}
     */
    private function resolveInTransaction(
        int $tenantId,
        array $contactData,
        array $identityData,
        string $channel,
        string $providerId,
        CarbonImmutable $occurredAt,
    ): array {
        $identity = DB::table('contact_identities')
            ->where('tenant_id', $tenantId)
            ->where('channel_type', $channel)
            ->where('provider_scope_id', '')
            ->where('provider_user_id', $providerId)
            ->lockForUpdate()
            ->first(['id', 'contact_id', 'last_seen_at']);

        if ($identity !== null) {
            $contact = $this->activeContact($tenantId, (int) $identity->contact_id, true);
            $timestamp = $this->databaseTimestamp($occurredAt);

            if (CarbonImmutable::parse((string) $identity->last_seen_at)->lessThan($occurredAt)) {
                DB::table('contact_identities')
                    ->where('tenant_id', $tenantId)
                    ->where('id', $identity->id)
                    ->update(['last_seen_at' => $timestamp]);
            }

            $updates = [];

            if (CarbonImmutable::parse((string) $contact->last_seen_at)->lessThan($occurredAt)) {
                $updates['last_seen_at'] = $timestamp;
            }

            foreach (['display_name', 'first_name', 'last_name', 'email', 'phone_e164', 'locale'] as $field) {
                if ($contact->{$field} === null && isset($contactData[$field]) && $contactData[$field] !== '') {
                    $updates[$field] = $contactData[$field];
                }
            }

            if ($updates !== []) {
                DB::table('contacts')
                    ->where('tenant_id', $tenantId)
                    ->where('id', $contact->id)
                    ->update($updates);
            }

            return ['id' => (int) $contact->id, 'public_id' => (string) $contact->public_id, 'created' => false];
        }

        $timestamp = $this->databaseTimestamp($occurredAt);
        $publicId = (string) Str::uuid();
        $contactId = (int) DB::table('contacts')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => $publicId,
            'display_name' => $contactData['display_name'] ?? null,
            'first_name' => $contactData['first_name'] ?? null,
            'last_name' => $contactData['last_name'] ?? null,
            'email' => $contactData['email'] ?? ($channel === 'EMAIL' ? $providerId : null),
            'phone_e164' => $contactData['phone_e164'] ?? ($channel === 'PHONE' ? $providerId : null),
            'locale' => $contactData['locale'] ?? null,
            'lifecycle_status' => 'ACTIVE',
            'first_seen_at' => $timestamp,
            'last_seen_at' => $timestamp,
        ]);

        DB::table('contact_identities')->insert([
            'tenant_id' => $tenantId,
            'contact_id' => $contactId,
            'channel_type' => $channel,
            'provider_scope_id' => '',
            'provider_user_id' => $providerId,
            'username' => $identityData['username'] ?? null,
            'display_name' => $identityData['display_name'] ?? null,
            'identity_hash' => hash('sha256', $channel."\0".$providerId, true),
            'is_primary' => 1,
            'is_verified' => 0,
            'first_seen_at' => $timestamp,
            'last_seen_at' => $timestamp,
        ]);

        return ['id' => $contactId, 'public_id' => $publicId, 'created' => true];
    }

    private function activeContact(int $tenantId, int $contactId, bool $lock): object
    {
        $query = DB::table('contacts')
            ->where('tenant_id', $tenantId)
            ->where('id', $contactId)
            ->where('lifecycle_status', 'ACTIVE')
            ->whereNull('deleted_at');

        if ($lock) {
            $query->lockForUpdate();
        }

        $contact = $query->first([
            'id',
            'public_id',
            'display_name',
            'first_name',
            'last_name',
            'email',
            'phone_e164',
            'locale',
            'last_seen_at',
        ]);

        if ($contact === null) {
            throw new PublicLeadRejected('The contact is not available.');
        }

        return $contact;
    }

    private function canonicalProviderId(string $channel, string $providerId): string
    {
        $providerId = trim($providerId);

        return $channel === 'EMAIL' ? mb_strtolower($providerId) : $providerId;
    }

    private function databaseTimestamp(CarbonImmutable $date): string
    {
        return $date->utc()->format('Y-m-d H:i:s.v');
    }

    private function isDuplicateKey(QueryException $exception): bool
    {
        return ($exception->errorInfo[0] ?? null) === '23000'
            && (int) ($exception->errorInfo[1] ?? 0) === 1062;
    }
}
