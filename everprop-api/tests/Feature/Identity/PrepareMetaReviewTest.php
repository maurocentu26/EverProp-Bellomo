<?php

namespace Tests\Feature\Identity;

use App\Console\Commands\PrepareMetaReview;
use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\OutputStyle;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Mockery;
use Mockery\Expectation;
use Mockery\MockInterface;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Question\Question;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

final class PrepareMetaReviewTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const PASSWORD = 'SyntheticReviewPassword123';

    private const SLUG = 'meta-review-staging';

    private const EMAIL = 'meta-review@example.invalid';

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array']);
        Http::preventStrayRequests();
    }

    public function test_preview_does_not_create_an_account_or_contact_a_provider(): void
    {
        $before = Tenant::count();
        $this->artisan('everprop:reviewer:prepare')->assertSuccessful();
        self::assertSame($before, Tenant::count());
        $this->assertDatabaseMissing('tenants', ['slug' => self::SLUG]);
        Http::assertNothingSent();
    }

    public function test_apply_creates_only_an_isolated_admin_with_ai_off_and_never_prints_the_password(): void
    {
        $internal = Tenant::factory()->create();
        $owner = User::factory()->for($internal)->create();
        $oldHash = $owner->password_hash;
        $this->prepare();
        $tenant = Tenant::where('slug', self::SLUG)->sole();
        $reviewer = User::where('tenant_id', $tenant->id)->sole();
        self::assertTrue($tenant->isActive());
        $settings = $tenant->getAttribute('settings_json');
        self::assertIsArray($settings);
        self::assertTrue($settings['meta_review']);
        self::assertFalse($settings['conversations']['ai_enabled']);
        self::assertFalse($settings['conversations']['copilot_enabled']);
        self::assertSame(self::EMAIL, $reviewer->email);
        self::assertSame(RoleCode::TENANT_ADMIN, $reviewer->role());
        self::assertTrue($reviewer->isActive());
        self::assertNull($reviewer->phone_e164);
        self::assertTrue(Hash::check(self::PASSWORD, $reviewer->password_hash));
        self::assertSame($oldHash, $owner->fresh()->password_hash);
        $this->assertDatabaseHas('user_inventory_settings', ['tenant_id' => $tenant->id, 'user_id' => $reviewer->id, 'can_manage_inventory' => true]);
        $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $tenant->id]);
        Http::assertNothingSent();
    }

    public function test_repeating_apply_keeps_the_existing_password_account_and_history(): void
    {
        $this->prepare();
        $tenant = Tenant::where('slug', self::SLUG)->sole();
        $reviewer = User::where('tenant_id', $tenant->id)->sole();
        $hash = $reviewer->password_hash;
        $this->artisan('everprop:reviewer:prepare', ['--apply' => true])->assertSuccessful();
        self::assertSame(1, Tenant::where('slug', self::SLUG)->count());
        self::assertSame(1, User::where('tenant_id', $tenant->id)->count());
        self::assertSame($hash, $reviewer->fresh()->password_hash);
    }

    public function test_an_existing_unmarked_tenant_is_never_repurposed(): void
    {
        $tenant = Tenant::factory()->create(['slug' => self::SLUG]);
        $before = $tenant->fresh()->toArray();
        $this->artisan('everprop:reviewer:prepare', ['--apply' => true])->assertFailed();
        self::assertSame($before, $tenant->fresh()->toArray());
        self::assertSame(0, User::where('tenant_id', $tenant->id)->count());
    }

    public function test_invalid_password_creates_nothing(): void
    {
        $this->artisan('everprop:reviewer:prepare', ['--apply' => true])
            ->expectsQuestion('Contraseña nueva del revisor', 'short')
            ->doesntExpectOutputToContain('short')->assertFailed();
        $this->assertDatabaseMissing('tenants', ['slug' => self::SLUG]);
    }

    public function test_the_password_question_refuses_visible_input_fallback(): void
    {
        $command = app(PrepareMetaReview::class);
        $input = new ArrayInput(['--apply' => true], $command->getDefinition());
        /** @var OutputStyle&MockInterface $output */
        $output = Mockery::mock(OutputStyle::class)->makePartial();
        /** @var Expectation $expectation */
        $expectation = $output->shouldReceive('askQuestion');
        $expectation->once()->with(Mockery::on(function (Question $question): bool {
            self::assertTrue($question->isHidden());
            self::assertFalse($question->isHiddenFallback());

            return true;
        }))->andReturn(self::PASSWORD);
        $output->shouldReceive('writeln');
        $command->setLaravel($this->app);
        $command->setInput($input);
        $command->setOutput($output);
        self::assertSame(0, $command->handle());
    }

    public function test_a_modified_reviewer_is_not_reactivated_or_promoted(): void
    {
        $this->prepare();
        $tenant = Tenant::where('slug', self::SLUG)->sole();
        $reviewer = User::where('tenant_id', $tenant->id)->sole();
        $reviewer->update(['role_code' => RoleCode::READ_ONLY, 'status' => 'DISABLED']);
        $this->artisan('everprop:reviewer:prepare', ['--apply' => true])->assertFailed();
        self::assertSame(RoleCode::READ_ONLY, $reviewer->fresh()->role());
        self::assertFalse($reviewer->fresh()->isActive());
    }

    public function test_testing_environment_requires_a_test_database_name(): void
    {
        $connection = DB::connection();
        $before = $connection->getDatabaseName();
        $connection->setDatabaseName('client_database');
        try {
            $this->artisan('everprop:reviewer:prepare', ['--apply' => true])->assertFailed();
        } finally {
            $connection->setDatabaseName($before);
        }
        $this->assertDatabaseMissing('tenants', ['slug' => self::SLUG]);
    }

    public function test_production_and_unidentified_environments_are_rejected(): void
    {
        $previous = getenv('RAILWAY_ENVIRONMENT_NAME');
        $this->app['env'] = 'production';
        putenv('RAILWAY_ENVIRONMENT_NAME=production');
        try {
            $this->artisan('everprop:reviewer:prepare', ['--apply' => true])->assertFailed();
            putenv('RAILWAY_ENVIRONMENT_NAME');
            $this->artisan('everprop:reviewer:prepare', ['--apply' => true])->assertFailed();
            $this->assertDatabaseMissing('tenants', ['slug' => self::SLUG]);
        } finally {
            $this->app['env'] = 'testing';
            putenv($previous === false ? 'RAILWAY_ENVIRONMENT_NAME' : 'RAILWAY_ENVIRONMENT_NAME='.$previous);
        }
    }

    public function test_review_admin_cannot_read_the_internal_users_or_use_the_internal_signed_host(): void
    {
        ['tenant' => $internal, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->whatsappChannel($internal->id, $integration, 'INTERNAL-REVIEW-GUARD');
        DB::table('channel_accounts')->insert(['tenant_id' => $internal->id, 'integration_id' => $integration,
            'public_id' => (string) Str::uuid(), 'channel_type' => 'INSTAGRAM_DM', 'provider_account_id' => 'INTERNAL-IG-REVIEW-GUARD',
            'display_name' => 'Internal test Instagram', 'status' => 'ACTIVE', 'metadata_json' => json_encode(['username' => 'internal_test_account'])]);
        Queue::fake();
        $inbound = app(InboundMessageService::class)->accept(new InboundMessage(
            tenantId: $internal->id, channelAccountId: $channel, identityChannelType: 'WHATSAPP',
            senderProviderId: '5493881111111', threadId: 'wa:5493881111111', providerMessageId: 'internal-review-guard-message',
            type: 'TEXT', text: 'Internal synthetic message hidden from reviewer', occurredAt: CarbonImmutable::now('UTC'),
        ));
        $internalConversation = $inbound['conversation_public_id'];
        $owner = User::factory()->for($internal)->create(['phone_e164' => '+5493881111111']);
        $this->prepare();
        $tenant = Tenant::where('slug', self::SLUG)->sole();
        $reviewer = User::where('tenant_id', $tenant->id)->sole();
        config(['tenancy.panel_signing_key' => 'synthetic-review-key', 'tenancy.hosts' => ['internal.test' => $internal->slug, 'review.test' => $tenant->slug]]);
        $signed = static function (string $host): array {
            $at = (string) time();

            return ['X-Eversys-Panel-Host' => $host, 'X-Eversys-Panel-Timestamp' => $at,
                'X-Eversys-Panel-Signature' => hash_hmac('sha256', "eversys-panel-host-v1\n".$host."\n".$at, 'synthetic-review-key')];
        };
        $this->actingAs($reviewer)->withHeaders($signed('review.test'));
        $this->getJson('/api/v1/admin/users')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonMissing(['public_id' => $owner->public_id])->assertJsonMissing(['phone_e164' => $owner->phone_e164]);
        $this->getJson('/api/v1/admin/integrations/instagram/config')->assertOk()->assertJsonCount(0, 'data.connections');
        $this->getJson('/api/v1/admin/integrations/whatsapp/config')->assertOk()->assertJsonCount(0, 'data.connections');
        $this->getJson('/api/v1/admin/conversations')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/conversations/'.$internalConversation.'/messages')->assertNotFound();
        $this->withHeaders($signed('internal.test'))->getJson('/api/v1/admin/users')->assertNotFound();
        $this->getJson('/api/v1/admin/integrations/instagram/config')->assertNotFound();
        $this->getJson('/api/v1/admin/conversations')->assertNotFound();
        $this->actingAs($owner)->withHeaders($signed('internal.test'))
            ->getJson('/api/v1/admin/conversations/'.$internalConversation.'/messages')->assertOk();
        self::assertSame($internal->id, $owner->fresh()->tenant_id);
    }

    private function prepare(): void
    {
        $this->artisan('everprop:reviewer:prepare', ['--apply' => true])
            ->expectsQuestion('Contraseña nueva del revisor', self::PASSWORD)
            ->doesntExpectOutputToContain(self::PASSWORD)->assertSuccessful();
    }
}
