<?php

namespace Tests\Feature\Integrations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Notifications\IntegrationRevoked;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** Tech Provider W6a: Meta's account_update webhook revokes access when the business removes it. */
final class WhatsAppAccountUpdateTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.app_id' => '869361281603019']);
        Notification::fake();
    }

    /** @return array{tenant: Tenant, integration: int} */
    private function connected(string $wabaId): array
    {
        $fixture = $this->tenantWithIntegration();
        DB::table('integration_connections')->where('id', $fixture['integration'])->update(['settings_json' => json_encode(['waba_id' => $wabaId])]);
        app(IntegrationTokens::class)->store($fixture['tenant']->id, $fixture['integration'], 'token-'.$wabaId);

        return $fixture;
    }

    /** @param array<string, mixed> $value */
    private function accountUpdate(string $wabaId, array $value): string
    {
        return json_encode(['object' => 'whatsapp_business_account', 'entry' => [['id' => $wabaId, 'time' => 1748477359,
            'changes' => [['field' => 'account_update', 'value' => $value]]]]], JSON_THROW_ON_ERROR);
    }

    public function test_uninstalling_our_app_revokes_that_waba_only_and_tells_its_admins(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->connected('184943124712545');
        ['tenant' => $other, 'integration' => $otherIntegration] = $this->connected('999000111');
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $otherAdmin = $this->user($other, RoleCode::TENANT_ADMIN);

        $this->postWebhook($this->accountUpdate('184943124712545', ['event' => 'PARTNER_APP_UNINSTALLED',
            'waba_info' => ['waba_id' => '184943124712545', 'partner_app_id' => '869361281603019']]))->assertOk();

        $this->assertDatabaseHas('integration_connections', ['id' => $integration, 'status' => 'REVOKED']);
        $this->assertDatabaseHas('integration_connections', ['id' => $otherIntegration, 'status' => 'ACTIVE']);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action_code' => 'INTEGRATION_REVOKED', 'entity_id' => $integration]);
        $this->assertNull(app(IntegrationTokens::class)->forSending($tenant->id, $integration));
        Notification::assertSentToTimes($admin, IntegrationRevoked::class, 1);
        Notification::assertNotSentTo($otherAdmin, IntegrationRevoked::class);
    }

    public function test_deleted_or_offboarded_accounts_are_revoked_even_when_registration_was_pending(): void
    {
        ['integration' => $deleted] = $this->connected('2001');
        ['integration' => $offboarded] = $this->connected('2002');
        DB::table('integration_connections')->where('id', $offboarded)->update(['status' => 'DEGRADED']);

        $this->postWebhook($this->accountUpdate('2001', ['event' => 'ACCOUNT_DELETED']))->assertOk();
        $this->postWebhook($this->accountUpdate('2002', ['event' => 'ACCOUNT_OFFBOARDED']))->assertOk();

        $this->assertDatabaseHas('integration_connections', ['id' => $deleted, 'status' => 'REVOKED']);
        $this->assertDatabaseHas('integration_connections', ['id' => $offboarded, 'status' => 'REVOKED']);
    }

    public function test_another_partners_uninstall_informational_events_and_reconnection_change_nothing(): void
    {
        ['integration' => $integration] = $this->connected('3001');

        foreach ([
            ['event' => 'PARTNER_APP_UNINSTALLED', 'waba_info' => ['waba_id' => '3001', 'partner_app_id' => '111222333']],
            ['event' => 'ACCOUNT_RECONNECTED'],
            ['event' => 'VOLUME_BASED_PRICING_TIER_UPDATE'],
        ] as $value) {
            $this->postWebhook($this->accountUpdate('3001', $value))->assertOk();
        }
        $this->assertDatabaseHas('integration_connections', ['id' => $integration, 'status' => 'ACTIVE']);

        DB::table('integration_connections')->where('id', $integration)->update(['status' => 'REVOKED']);
        $this->postWebhook($this->accountUpdate('3001', ['event' => 'ACCOUNT_RECONNECTED']))->assertOk();
        $this->assertDatabaseHas('integration_connections', ['id' => $integration, 'status' => 'REVOKED']);
        Notification::assertNothingSent();
    }

    public function test_every_tenant_holding_the_waba_loses_access_and_a_change_without_entry_id_is_ignored(): void
    {
        ['integration' => $first] = $this->connected('5001');
        ['integration' => $second] = $this->connected('5001');

        $this->postWebhook(json_encode(['object' => 'whatsapp_business_account', 'entry' => [['changes' => [['field' => 'account_update', 'value' => ['event' => 'ACCOUNT_DELETED']]]]]], JSON_THROW_ON_ERROR))->assertOk();
        $this->assertDatabaseHas('integration_connections', ['id' => $first, 'status' => 'ACTIVE']);

        $this->postWebhook($this->accountUpdate('5001', ['event' => 'ACCOUNT_DELETED']))->assertOk();
        $this->assertDatabaseHas('integration_connections', ['id' => $first, 'status' => 'REVOKED']);
        $this->assertDatabaseHas('integration_connections', ['id' => $second, 'status' => 'REVOKED']);
    }

    public function test_an_unsigned_account_update_is_rejected_before_anything_changes(): void
    {
        ['integration' => $integration] = $this->connected('4001');

        $this->postWebhook($this->accountUpdate('4001', ['event' => 'ACCOUNT_DELETED']), 'wrong-secret')->assertUnauthorized();

        $this->assertDatabaseHas('integration_connections', ['id' => $integration, 'status' => 'ACTIVE']);
    }
}
