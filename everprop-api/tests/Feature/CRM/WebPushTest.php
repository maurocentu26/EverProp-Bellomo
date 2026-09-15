<?php

namespace Tests\Feature\CRM;

use App\Domain\CRM\Notifications\LeadAssignedNotification;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Jobs\SendWebPush;
use App\Models\User;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Minishlink\WebPush\MessageSentReport;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;
use Mockery\Expectation;
use Tests\TestCase;

final class WebPushTest extends TestCase
{
    use DatabaseTransactions;

    public function test_subscription_ownership_encryption_and_endpoint_validation(): void
    {
        config(['webpush.public_key' => 'test', 'webpush.private_key' => 'test']);
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $other = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $body = ['endpoint' => 'https://fcm.googleapis.com/fcm/send/qa-only', 'keys' => ['p256dh' => base64_encode(str_repeat('a', 65)), 'auth' => base64_encode(str_repeat('b', 16))]];
        $this->postJson('/api/v1/admin/push/subscriptions', array_merge($body, ['endpoint' => 'https://127.0.0.1/private']))->assertUnprocessable();
        $this->postJson('/api/v1/admin/push/subscriptions', $body)->assertOk();
        $row = DB::table('web_push_subscriptions')->where('user_id', $user->id)->first();
        $this->assertStringNotContainsString('fcm.googleapis.com', $row->subscription);
        $this->getJson('/api/v1/admin/push/config')->assertOk()->assertJsonPath('subscriptionHashes.0', hash('sha256', $body['endpoint']));
        $this->actingAs($other)->getJson('/api/v1/admin/push/config')->assertOk()->assertJsonPath('subscriptionHashes', []);
        $this->actingAs($other)->postJson('/api/v1/admin/push/subscriptions', $body)->assertConflict();
        $this->deleteJson('/api/v1/admin/push/subscriptions', ['endpoint' => $body['endpoint']])->assertOk();
        $this->assertDatabaseHas('web_push_subscriptions', ['id' => $row->id]);
        $this->actingAs($user)->deleteJson('/api/v1/admin/push/subscriptions', ['endpoint' => $body['endpoint']])->assertOk();
        $this->assertDatabaseMissing('web_push_subscriptions', ['id' => $row->id]);
    }

    public function test_delivery_uses_recipient_subscription_and_removes_expired_devices(): void
    {
        $keys = VAPID::createVapidKeys();
        config(['webpush.public_key' => $keys['publicKey'], 'webpush.private_key' => $keys['privateKey'], 'webpush.subject' => 'mailto:qa@example.invalid']);
        $this->assertInstanceOf(WebPush::class, app(WebPush::class));
        Queue::fake();
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $other = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $notification = new LeadAssignedNotification('test-id', 'Nombre privado', 'LEAD_CREATED', 'Nuevo lead', 'Contacto privado');
        $user->notify($notification);
        $notificationId = $user->notifications()->firstOrFail()->id;
        Queue::assertPushed(SendWebPush::class);
        $endpoint = 'https://fcm.googleapis.com/fcm/send/test-recipient';
        foreach ([$user, $other] as $owner) {
            DB::table('web_push_subscriptions')->insert(['tenant_id' => $tenant->id, 'user_id' => $owner->id, 'endpoint_hash' => hash('sha256', $endpoint.$owner->id), 'subscription' => Crypt::encryptString(json_encode(['endpoint' => $endpoint, 'keys' => ['p256dh' => $keys['publicKey'], 'auth' => base64_encode(str_repeat('a', 16))]])), 'created_at' => now(), 'updated_at' => now()]);
        }
        $sender = \Mockery::mock(WebPush::class);
        /** @var Expectation $expectation */
        $expectation = $sender->shouldReceive('sendOneNotification');
        $expectation->once()->withArgs(function ($subscription, $payload) {
            return ! str_contains($payload, 'Nombre privado') && ! str_contains($payload, 'Contacto privado');
        })->andReturn(new MessageSentReport(new Request('POST', $endpoint), new Response(410), false));
        $this->app->instance(WebPush::class, $sender);
        (new SendWebPush($tenant->id, $user->id, $notificationId))->handle();
        $this->assertDatabaseMissing('web_push_subscriptions', ['tenant_id' => $tenant->id, 'user_id' => $user->id]);
        $this->assertDatabaseHas('web_push_subscriptions', ['tenant_id' => $tenant->id, 'user_id' => $other->id]);
        (new SendWebPush($tenant->id, $other->id, $notificationId))->handle();
    }

    public function test_temporary_push_failure_keeps_subscription_for_retry(): void
    {
        config(['webpush.private_key' => 'configured', 'webpush.subject' => 'mailto:qa@example.invalid']);
        Queue::fake();
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $user->notify(new LeadAssignedNotification('qa-id', 'QA', 'LEAD_CREATED', 'QA', 'QA'));
        $notificationId = $user->notifications()->firstOrFail()->id;
        $keys = VAPID::createVapidKeys();
        $endpoint = 'https://fcm.googleapis.com/fcm/send/qa-temporary';
        $id = DB::table('web_push_subscriptions')->insertGetId(['tenant_id' => $tenant->id, 'user_id' => $user->id,
            'endpoint_hash' => hash('sha256', $endpoint),
            'subscription' => Crypt::encryptString(json_encode(['endpoint' => $endpoint, 'keys' => ['p256dh' => $keys['publicKey'], 'auth' => base64_encode(str_repeat('b', 16))]]))]);
        $sender = \Mockery::mock(WebPush::class);
        /** @var Expectation $expectation */
        $expectation = $sender->shouldReceive('sendOneNotification');
        $expectation->once()->andReturn(new MessageSentReport(new Request('POST', $endpoint), new Response(503), false));
        $this->app->instance(WebPush::class, $sender);
        try {
            (new SendWebPush($tenant->id, $user->id, $notificationId))->handle();
            $this->fail('A temporary provider failure must trigger the queue retry.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('El proveedor push no confirmó la entrega.', $exception->getMessage());
        }
        $this->assertDatabaseHas('web_push_subscriptions', ['id' => $id]);
        $this->assertDatabaseHas('notifications', ['id' => $notificationId, 'read_at' => null]);
    }

    public function test_already_read_notification_is_not_delivered_again(): void
    {
        config(['webpush.private_key' => 'configured', 'webpush.subject' => 'mailto:qa@example.invalid']);
        Queue::fake();
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $user->notify(new LeadAssignedNotification('qa-read', 'QA', 'LEAD_CREATED', 'QA', 'QA'));
        $notification = $user->notifications()->firstOrFail();
        $notification->markAsRead();
        $sender = \Mockery::mock(WebPush::class);
        $sender->shouldNotReceive('sendOneNotification');
        $this->app->instance(WebPush::class, $sender);
        (new SendWebPush($tenant->id,$user->id,$notification->id))->handle();
        $this->assertDatabaseHas('notifications',['id' => $notification->id]);
    }
}
