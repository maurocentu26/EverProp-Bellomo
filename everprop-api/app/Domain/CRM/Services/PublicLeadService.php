<?php

namespace App\Domain\CRM\Services;

use App\Domain\CRM\Data\PublicLeadSubmission;
use App\Domain\CRM\Exceptions\IdempotencyConflict;
use App\Domain\CRM\Exceptions\PublicLeadRejected;
use App\Domain\CRM\Notifications\LeadAssignedNotification;
use App\Domain\CRM\Support\PayloadFingerprint;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use JsonException;

final readonly class PublicLeadService
{
    public function __construct(
        private ContactIdentityResolver $contacts,
        private CreateOrGetOpenLeadProcedure $leadProcedure,
    ) {}

    /**
     * The stored procedure owns its transaction and commits internally. This
     * workflow therefore uses three explicit phases: contact resolution,
     * procedure call, then an idempotent post-procedure transaction. A retry
     * completes the final phase if the process stops between phases.
     *
     * @param  array<string, mixed>  $payload
     *
     * @throws IdempotencyConflict
     * @throws JsonException
     */
    public function submit(int $tenantId, array $payload, string $idempotencyKey): PublicLeadSubmission
    {
        $fingerprint = PayloadFingerprint::make($payload);
        $dedupeKey = 'public-lead:'.hash('sha256', $tenantId."\0".$idempotencyKey);

        $existing = $this->existingSubmission($tenantId, $dedupeKey, $fingerprint);

        if ($existing !== null) {
            return $existing;
        }

        $occurredAt = isset($payload['lead']['occurred_at'])
            ? CarbonImmutable::parse((string) $payload['lead']['occurred_at'])->utc()
            : CarbonImmutable::now('UTC');

        $property = $this->resolveProperty($tenantId, $payload['property_public_id'] ?? null);
        $contact = $this->contacts->resolve(
            $tenantId,
            $payload['contact'],
            $payload['identity'],
            $occurredAt,
        );
        $leadData = $payload['lead'];
        $lead = $this->leadProcedure->execute(
            tenantId: $tenantId,
            contactId: $contact['id'],
            sourceChannel: (string) $leadData['source_channel'],
            sourceKind: (string) $leadData['source_kind'],
            title: isset($leadData['title']) ? (string) $leadData['title'] : null,
            priority: (string) ($leadData['priority'] ?? 'NORMAL'),
            occurredAt: $occurredAt,
        );

        try {
            return DB::transaction(function () use (
                $tenantId,
                $payload,
                $fingerprint,
                $dedupeKey,
                $occurredAt,
                $property,
                $contact,
                $lead,
            ): PublicLeadSubmission {
                $leadRecord = DB::table('leads')
                    ->where('tenant_id', $tenantId)
                    ->where('id', $lead['lead_id'])
                    ->whereNull('deleted_at')
                    ->lockForUpdate()
                    ->first(['id', 'public_id', 'assigned_user_id']);

                if ($leadRecord === null) {
                    throw new PublicLeadRejected('The lead is not available.');
                }

                $timestamp = $occurredAt->format('Y-m-d H:i:s.v');
                $touchpointId = (int) DB::table('lead_touchpoints')->insertGetId([
                    'tenant_id' => $tenantId,
                    'lead_id' => $leadRecord->id,
                    'contact_id' => $contact['id'],
                    'dedupe_key' => $dedupeKey,
                    'touchpoint_type' => $payload['touchpoint']['type'],
                    'direction' => 'INBOUND',
                    'summary' => $payload['touchpoint']['summary'] ?? null,
                    'metadata_json' => json_encode([
                        'idempotency_payload_sha256' => $fingerprint,
                        'lead_created' => $lead['created'],
                        'property_linked' => $property !== null,
                    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                    'occurred_at' => $timestamp,
                ]);

                if (isset($payload['consent'])) {
                    DB::table('contact_consents')->insert([
                        'tenant_id' => $tenantId,
                        'contact_id' => $contact['id'],
                        'purpose_code' => $payload['consent']['purpose_code'],
                        'status' => $payload['consent']['status'],
                        'capture_source' => 'PUBLIC_WEB_LEAD',
                        'legal_text_version' => $payload['consent']['legal_text_version'] ?? null,
                        'captured_at' => $timestamp,
                    ]);
                }

                if ($property !== null) {
                    DB::table('lead_properties')->updateOrInsert(
                        [
                            'tenant_id' => $tenantId,
                            'lead_id' => $leadRecord->id,
                            'property_id' => $property->id,
                        ],
                        [
                            'interest_level' => 'MEDIUM',
                            'status' => 'ACTIVE',
                            'last_activity_at' => $timestamp,
                        ],
                    );
                }

                DB::table('domain_outbox')->insert([
                    'tenant_id' => $tenantId,
                    'aggregate_type' => 'LEAD',
                    'aggregate_id' => $leadRecord->id,
                    'event_type' => 'PUBLIC_LEAD_RECEIVED',
                    'idempotency_key' => 'public-lead-received:'.substr($dedupeKey, strlen('public-lead:')),
                    'payload_json' => json_encode([
                        'lead_id' => (int) $leadRecord->id,
                        'contact_id' => $contact['id'],
                        'touchpoint_id' => $touchpointId,
                        'property_id' => $property?->id,
                        'source_channel' => $payload['lead']['source_channel'],
                        'source_kind' => $payload['lead']['source_kind'],
                    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                    'status' => 'PENDING',
                    'available_at' => CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v'),
                ]);

                if ($leadRecord->assigned_user_id) {
                    try {
                        $assignedUser = User::find($leadRecord->assigned_user_id);
                        if ($assignedUser) {
                            $contactName = (string) ($payload['contact']['display_name']
                                ?? $payload['identity']['display_name']
                                ?? 'Nuevo Contacto Web');
                            $assignedUser->notify(new LeadAssignedNotification(
                                leadPublicId: (string) $leadRecord->public_id,
                                leadName: $contactName,
                                eventType: 'LEAD_CREATED',
                                title: 'Nuevo lead web asignado',
                                message: "Ha ingresado un nuevo lead web: '{$contactName}'",
                                actionUrl: "/admin/leads/{$leadRecord->public_id}"
                            ));
                        }
                    } catch (\Throwable) {
                        // Keep transaction intact
                    }
                }

                return new PublicLeadSubmission(
                    leadPublicId: (string) $leadRecord->public_id,
                    leadCreated: $lead['created'],
                    assigned: $leadRecord->assigned_user_id !== null,
                    replayed: false,
                    propertyLinked: $property !== null,
                );
            }, 3);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            $existing = $this->existingSubmission($tenantId, $dedupeKey, $fingerprint);

            if ($existing === null) {
                throw $exception;
            }

            return $existing;
        }
    }

    private function existingSubmission(int $tenantId, string $dedupeKey, string $fingerprint): ?PublicLeadSubmission
    {
        $record = DB::table('lead_touchpoints as touchpoint')
            ->join('leads as lead', function ($join): void {
                $join->on('lead.tenant_id', '=', 'touchpoint.tenant_id')
                    ->on('lead.id', '=', 'touchpoint.lead_id');
            })
            ->where('touchpoint.tenant_id', $tenantId)
            ->where('touchpoint.dedupe_key', $dedupeKey)
            ->whereNull('lead.deleted_at')
            ->first([
                'touchpoint.metadata_json',
                'lead.public_id',
                'lead.assigned_user_id',
            ]);

        if ($record === null) {
            return null;
        }

        $metadata = is_string($record->metadata_json)
            ? json_decode($record->metadata_json, true, 512, JSON_THROW_ON_ERROR)
            : (array) $record->metadata_json;

        if (! hash_equals((string) ($metadata['idempotency_payload_sha256'] ?? ''), $fingerprint)) {
            throw new IdempotencyConflict;
        }

        return new PublicLeadSubmission(
            leadPublicId: (string) $record->public_id,
            leadCreated: (bool) ($metadata['lead_created'] ?? false),
            assigned: $record->assigned_user_id !== null,
            replayed: true,
            propertyLinked: (bool) ($metadata['property_linked'] ?? false),
        );
    }

    private function resolveProperty(int $tenantId, mixed $publicId): ?object
    {
        if ($publicId === null) {
            return null;
        }

        $property = DB::table('properties')
            ->where('tenant_id', $tenantId)
            ->where('public_id', (string) $publicId)
            ->where('status', 'AVAILABLE')
            ->whereNull('deleted_at')
            ->first(['id', 'public_id']);

        if ($property === null) {
            throw new PublicLeadRejected('The property is not available.');
        }

        return $property;
    }

    private function isDuplicateKey(QueryException $exception): bool
    {
        return ($exception->errorInfo[0] ?? null) === '23000'
            && (int) ($exception->errorInfo[1] ?? 0) === 1062;
    }
}
