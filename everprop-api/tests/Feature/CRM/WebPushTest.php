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

}
