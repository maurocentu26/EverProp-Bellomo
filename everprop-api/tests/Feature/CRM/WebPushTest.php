<?php
namespace Tests\Feature\CRM;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
final class WebPushTest extends TestCase {
 use DatabaseTransactions;
 public function test_subscription_ownership_encryption_and_endpoint_validation(): void {
  config(['webpush.public_key'=>'test', 'webpush.private_key'=>'test']);
  $tenant=Tenant::factory()->create();
  $user=User::factory()->for($tenant)->create(['role_code'=>RoleCode::SALES_ADVISOR->value]);
  $other=User::factory()->for($tenant)->create(['role_code'=>RoleCode::SALES_ADVISOR->value]);
  $this->actingAs($user)->withHeaders(['X-Everprop-Tenant'=>$tenant->public_id,'Origin'=>'http://localhost:5173']);
  $body=['endpoint'=>'https://fcm.googleapis.com/fcm/send/qa-only','keys'=>['p256dh'=>base64_encode(str_repeat('a',65)),'auth'=>base64_encode(str_repeat('b',16))]];
  $this->postJson('/api/v1/admin/push/subscriptions',array_merge($body,['endpoint'=>'https://127.0.0.1/private']))->assertUnprocessable();
  $this->postJson('/api/v1/admin/push/subscriptions',$body)->assertOk();
  $row=DB::table('web_push_subscriptions')->where('user_id',$user->id)->first();
  $this->assertStringNotContainsString('fcm.googleapis.com',$row->subscription);
  $this->getJson('/api/v1/admin/push/config')->assertOk()->assertJsonPath('subscriptionHashes.0',hash('sha256',$body['endpoint']));
  $this->actingAs($other)->getJson('/api/v1/admin/push/config')->assertOk()->assertJsonPath('subscriptionHashes',[]);
  $this->actingAs($other)->postJson('/api/v1/admin/push/subscriptions',$body)->assertConflict();
  $this->deleteJson('/api/v1/admin/push/subscriptions',['endpoint'=>$body['endpoint']])->assertOk();
  $this->assertDatabaseHas('web_push_subscriptions',['id'=>$row->id]);
  $this->actingAs($user)->deleteJson('/api/v1/admin/push/subscriptions',['endpoint'=>$body['endpoint']])->assertOk();
  $this->assertDatabaseMissing('web_push_subscriptions',['id'=>$row->id]);
 }
 public function test_delivery_uses_recipient_subscription_and_removes_expired_devices(): void {
  $keys=\Minishlink\WebPush\VAPID::createVapidKeys();
  config(['webpush.public_key'=>$keys['publicKey'], 'webpush.private_key'=>$keys['privateKey'], 'webpush.subject'=>'mailto:qa@example.invalid']);
  $this->assertInstanceOf(\Minishlink\WebPush\WebPush::class, app(\Minishlink\WebPush\WebPush::class));
  \Illuminate\Support\Facades\Queue::fake();
  $tenant=Tenant::factory()->create();
  $user=User::factory()->for($tenant)->create(['role_code'=>RoleCode::SALES_ADVISOR->value]);
  $other=User::factory()->for($tenant)->create(['role_code'=>RoleCode::SALES_ADVISOR->value]);
  $notification=new \App\Domain\CRM\Notifications\LeadAssignedNotification('test-id','Nombre privado','LEAD_CREATED','Nuevo lead','Contacto privado');
  $user->notify($notification);
  $notificationId = $user->notifications()->firstOrFail()->id;
  \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\SendWebPush::class);
  $endpoint='https://fcm.googleapis.com/fcm/send/test-recipient';
  foreach ([$user,$other] as $owner) DB::table('web_push_subscriptions')->insert(['tenant_id'=>$tenant->id,'user_id'=>$owner->id,'endpoint_hash'=>hash('sha256',$endpoint.$owner->id),'subscription'=>\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['endpoint'=>$endpoint,'keys'=>['p256dh'=>$keys['publicKey'],'auth'=>base64_encode(str_repeat('a',16))]])),'created_at'=>now(),'updated_at'=>now()]);
  $sender=\Mockery::mock(\Minishlink\WebPush\WebPush::class);
  $sender->shouldReceive('sendOneNotification')->once()->withArgs(function($subscription,$payload) { return !str_contains($payload,'Nombre privado') && !str_contains($payload,'Contacto privado'); })->andReturn(new \Minishlink\WebPush\MessageSentReport(new \GuzzleHttp\Psr7\Request('POST',$endpoint),new \GuzzleHttp\Psr7\Response(410),false));
  $this->app->instance(\Minishlink\WebPush\WebPush::class,$sender);
  (new \App\Jobs\SendWebPush($tenant->id,$user->id,$notificationId))->handle();
  $this->assertDatabaseMissing('web_push_subscriptions',['tenant_id'=>$tenant->id,'user_id'=>$user->id]);
  $this->assertDatabaseHas('web_push_subscriptions',['tenant_id'=>$tenant->id,'user_id'=>$other->id]);
  (new \App\Jobs\SendWebPush($tenant->id,$other->id,$notificationId))->handle();
 }

 public function test_temporary_push_failure_keeps_subscription_for_retry(): void {
  config(['webpush.private_key'=>'configured', 'webpush.subject'=>'mailto:qa@example.invalid']);
  \Illuminate\Support\Facades\Queue::fake();
  $tenant=Tenant::factory()->create();
  $user=User::factory()->for($tenant)->create(['role_code'=>RoleCode::SALES_ADVISOR->value]);
  $user->notify(new \App\Domain\CRM\Notifications\LeadAssignedNotification('qa-id','QA','LEAD_CREATED','QA','QA'));
  $notificationId=$user->notifications()->firstOrFail()->id;
  $keys=\Minishlink\WebPush\VAPID::createVapidKeys();
  $endpoint='https://fcm.googleapis.com/fcm/send/qa-temporary';
  $id=DB::table('web_push_subscriptions')->insertGetId(['tenant_id'=>$tenant->id,'user_id'=>$user->id,
   'endpoint_hash'=>hash('sha256',$endpoint),
   'subscription'=>\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['endpoint'=>$endpoint,'keys'=>['p256dh'=>$keys['publicKey'],'auth'=>base64_encode(str_repeat('b',16))]]))]);
  $sender=\Mockery::mock(\Minishlink\WebPush\WebPush::class);
  $sender->shouldReceive('sendOneNotification')->once()->andReturn(new \Minishlink\WebPush\MessageSentReport(new \GuzzleHttp\Psr7\Request('POST',$endpoint),new \GuzzleHttp\Psr7\Response(503),false));
  $this->app->instance(\Minishlink\WebPush\WebPush::class,$sender);
  try {
   (new \App\Jobs\SendWebPush($tenant->id,$user->id,$notificationId))->handle();
   $this->fail('A temporary provider failure must trigger the queue retry.');
  } catch (\RuntimeException $exception) {
   $this->assertSame('El proveedor push no confirmó la entrega.',$exception->getMessage());
  }
  $this->assertDatabaseHas('web_push_subscriptions',['id'=>$id]);
  $this->assertDatabaseHas('notifications',['id'=>$notificationId,'read_at'=>null]);
 }

 public function test_already_read_notification_is_not_delivered_again(): void {
  config(['webpush.private_key'=>'configured', 'webpush.subject'=>'mailto:qa@example.invalid']);
  \Illuminate\Support\Facades\Queue::fake();
  $tenant=Tenant::factory()->create();
  $user=User::factory()->for($tenant)->create(['role_code'=>RoleCode::SALES_ADVISOR->value]);
  $user->notify(new \App\Domain\CRM\Notifications\LeadAssignedNotification('qa-read','QA','LEAD_CREATED','QA','QA'));
  $notification=$user->notifications()->firstOrFail();
  $notification->markAsRead();
  $sender=\Mockery::mock(\Minishlink\WebPush\WebPush::class);
  $sender->shouldNotReceive('sendOneNotification');
  $this->app->instance(\Minishlink\WebPush\WebPush::class,$sender);
  (new \App\Jobs\SendWebPush($tenant->id,$user->id,$notification->id))->handle();
  $this->assertDatabaseHas('notifications',['id'=>$notification->id]);
 }
}
