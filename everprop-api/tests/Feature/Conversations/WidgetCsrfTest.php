<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Identity\Enums\RoleCode;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Found in the E2E run: the widget iframe lives on the panel origin, which is a Sanctum stateful domain,
 * so its POSTs went through CSRF validation and got 419. PHPUnit normally skips CSRF (env=testing),
 * which is why the feature suite never saw it: here CSRF is forced on.
 */
final class WidgetCsrfTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    public function test_widget_from_a_stateful_origin_works_without_csrf_while_admin_writes_still_require_it(): void
    {
        Queue::fake([RunAgentJob::class]);
        config(['sanctum.stateful' => ['localhost:5173'], 'conversations.web_rate_limit_per_minute' => 10_000]);
        $this->app->detectEnvironment(fn () => 'local'); // CSRF middleware only skips itself in env=testing
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $headers = $this->tenantHeaders($tenant) + ['Referer' => 'http://localhost:5173/widget/x']; // Origin http://localhost:5173 (stateful)

        $token = $this->withHeaders($headers)->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])
            ->assertCreated()->json('data.token');
        $this->withHeaders($headers)->withToken($token)
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();

        $this->flushHeaders();
        $this->withHeaders($headers)->postJson('/api/v1/admin/conversations/'.Str::uuid().'/takeover')->assertStatus(419);
        // The exclusion is two exact routes: other public writes keep CSRF (a future wildcard breaks this).
        $this->withHeaders($headers)->postJson('/api/v1/public/leads', [])->assertStatus(419);
        // A panel session is no credential for the chat: only the opaque bearer is.
        $this->actingAs($this->user($tenant, RoleCode::SALES_MANAGER))->withHeaders($headers)
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertStatus(401);
    }
}
