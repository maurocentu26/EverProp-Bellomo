<?php

namespace App\Console\Commands;

use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Ramsey\Uuid\Uuid;
use RuntimeException;

final class SeedStatisticsDemo extends Command
{
    protected $signature = 'everprop:statistics-demo {--tenant= : Existing local tenant slug}';

    protected $description = 'Add 1500 labeled synthetic leads/conversations using existing local inventory; never deletes data';

    public function handle(): int
    {
        if (! app()->environment('local') || DB::connection()->getDriverName() !== 'mysql'
            || DB::connection()->getConfig('host') !== 'everprop-api-mysql'
            || ! in_array(DB::connection()->getDatabaseName(), ['bellomo_crm', 'bellomo_crm_test'], true)) {
            $this->error('Requires local Docker MySQL and the local/demo database.');

            return self::FAILURE;
        }
        try {
            $created = DB::transaction(function (): bool {
                $tenant = DB::table('tenants')->where('slug', (string) $this->option('tenant'))->lockForUpdate()->first();
                if (! $tenant) {
                    throw new RuntimeException('Choose an existing local tenant with --tenant.');
                }
                $tenantId = (int) $tenant->id;
                $count = DB::table('leads')->where('tenant_id', $tenantId)->where('source_kind', 'EVP52_SIMULATION_V1')->count();
                if ($count === 1500) {
                    return false;
                }
                if ($count !== 0) {
                    throw new RuntimeException('Partial simulation found; refusing to modify it.');
                }
                $advisors = DB::table('users')->where('tenant_id', $tenantId)->where('role_code', 'SALES_ADVISOR')->where('status', 'ACTIVE')->whereNull('deleted_at')->orderBy('id')->pluck('id')->all();
                $properties = DB::table('properties')->where('tenant_id', $tenantId)->whereNull('deleted_at')->orderBy('id')->pluck('id')->all();
                if ($advisors === [] || $properties === []) {
                    throw new RuntimeException('Existing advisors and inventory are required; nothing was changed.');
                }
                $stages = DB::table('pipeline_stages')->where('tenant_id', $tenantId)->pluck('id', 'code')->all();
                $position = (int) DB::table('pipeline_stages')->where('tenant_id', $tenantId)->max('position');
                foreach (['NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'NEGOTIATION', 'WON', 'LOST'] as $code) {
                    if (! isset($stages[$code])) {
                        $stages[$code] = DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenantId, 'code' => $code, 'name' => $code, 'category' => in_array($code, ['WON', 'LOST'], true) ? $code : 'OPEN', 'position' => ++$position]);
                    }
                }
                $uuid = fn (string $key): string => Uuid::uuid5($tenant->public_id, 'EVP52_SIMULATION_V1:'.$key)->toString();
                $integration = DB::table('integration_connections')->insertGetId(['tenant_id' => $tenantId, 'public_id' => $uuid('integration'), 'provider' => 'WEB', 'name' => 'SIMULACIÓN LOCAL EVP-52', 'status' => 'DISABLED']);
                $channel = DB::table('channel_accounts')->insertGetId(['tenant_id' => $tenantId, 'public_id' => $uuid('channel'), 'integration_id' => $integration, 'channel_type' => 'WEB_CHAT', 'provider_account_id' => 'evp52-simulation', 'display_name' => 'Simulación estadística local', 'status' => 'DISCONNECTED']);
                $anchor = CarbonImmutable::now('UTC')->startOfDay()->subDay()->addHours(9);
                for ($i = 0; $i < 1500; $i++) {
                    $created = $anchor->subDays(($i * 17) % 90)->addMinutes($i % 120);
                    $bucket = $i % 20;
                    $code = match (true) {
                        $bucket < 6 => 'NEW', $bucket < 9 => 'CONTACTED', $bucket < 11 => 'VISIT_SCHEDULED', $bucket < 14 => 'NEGOTIATION', $bucket < 18 => 'WON', default => 'LOST'
                    };
                    $closed = in_array($code, ['WON', 'LOST'], true);
                    $advisor = $advisors[(intdiv($i, 7) + $i) % count($advisors)];
                    $responseAt = $created->addMinutes(5 + (($i * 13) % 180));
                    $closedAt = $created->addHours(4 + $i % 8);
                    $contact = DB::table('contacts')->insertGetId(['tenant_id' => $tenantId, 'public_id' => $uuid('contact:'.$i), 'display_name' => 'SIMULADO EVP-52 '.sprintf('%04d', $i + 1), 'email' => 'lead-'.($i + 1).'@statistics.example.invalid', 'first_seen_at' => $created, 'last_seen_at' => $closed ? $closedAt : $created]);
                    $lead = DB::table('leads')->insertGetId(['tenant_id' => $tenantId, 'public_id' => $uuid('lead:'.$i), 'contact_id' => $contact, 'stage_id' => $stages[$code], 'assigned_user_id' => $advisor, 'assignment_method' => 'MANUAL', 'source_channel' => ['WEB_FORM', 'WHATSAPP', 'PORTAL', 'REFERRAL', 'INSTAGRAM'][$i % 5], 'source_kind' => 'EVP52_SIMULATION_V1', 'title' => 'SIMULADO · Consulta '.($i + 1), 'is_open' => ! $closed, 'first_touch_at' => $created, 'last_touch_at' => $code === 'NEW' ? $created : $responseAt, 'won_at' => $code === 'WON' ? $closedAt : null, 'lost_at' => $code === 'LOST' ? $closedAt : null, 'lost_reason' => $code === 'LOST' ? 'Simulación: no continúa' : null, 'created_at' => $created, 'updated_at' => $closed ? $closedAt : $created]);
                    DB::table('lead_properties')->insert(['tenant_id' => $tenantId, 'lead_id' => $lead, 'property_id' => $properties[$i % count($properties)], 'linked_by_user_id' => $advisor, 'linked_at' => $created, 'last_activity_at' => $created, 'notes' => 'Vínculo de prueba; no cambia disponibilidad ni precio.']);
                    if ($code !== 'NEW') {
                        DB::table('lead_follow_ups')->insert(['tenant_id' => $tenantId, 'public_id' => $uuid('followup:'.$i), 'lead_id' => $lead, 'user_id' => $advisor, 'type' => 'call', 'occurred_at' => $responseAt, 'summary' => 'Contacto comercial simulado', 'result' => 'Consulta de prueba', 'created_at' => $responseAt, 'updated_at' => $responseAt]);
                    }
                    $answered = $i % 5 !== 0;
                    $conversation = DB::table('conversations')->insertGetId(['tenant_id' => $tenantId, 'public_id' => $uuid('conversation:'.$i), 'contact_id' => $contact, 'channel_account_id' => $channel, 'assigned_user_id' => $advisor, 'status' => $closed ? 'RESOLVED' : 'OPEN', 'control_state' => $closed ? 'CLOSED' : 'HUMAN_ACTIVE', 'controlled_by_user_id' => $advisor, 'first_inbound_at' => $created, 'last_inbound_at' => $created, 'last_activity_at' => $closed ? $closedAt : ($answered ? $responseAt : $created), 'closed_at' => $closed ? $closedAt : null, 'next_sequence' => 4, 'created_at' => $created, 'updated_at' => $closed ? $closedAt : $created]);
                    $common = ['tenant_id' => $tenantId, 'conversation_id' => $conversation, 'channel_account_id' => $channel, 'message_type' => 'TEXT'];
                    DB::table('messages')->insert([
                        $common + ['sequence' => 1, 'direction' => 'INBOUND', 'sender_type' => 'CONTACT', 'delivery_status' => 'RECEIVED', 'text_body' => 'Consulta simulada sobre la propiedad vinculada.', 'occurred_at' => $created, 'sent_at' => null],
                        $common + ['sequence' => 2, 'direction' => 'OUTBOUND', 'sender_type' => 'BOT', 'delivery_status' => 'SENT', 'text_body' => 'Acuse automático simulado.', 'occurred_at' => $created->addSeconds(15), 'sent_at' => $created->addSeconds(15)],
                        $common + ['sequence' => 3, 'direction' => 'OUTBOUND', 'sender_type' => 'USER', 'delivery_status' => $answered ? 'DELIVERED' : 'FAILED', 'text_body' => 'Respuesta humana simulada.', 'occurred_at' => $responseAt->subMinute(), 'sent_at' => $answered ? $responseAt : null],
                    ]);
                }

                return true;
            });
            $this->info($created ? 'Added 1500 synthetic leads and conversations. Existing inventory/accounts preserved; no messages dispatched.' : '1500-row simulation already present; nothing changed.');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            report($e);
            $this->error('Simulation rolled back. Check local prerequisites and application log.');

            return self::FAILURE;
        }
    }
}
