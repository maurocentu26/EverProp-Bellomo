<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\Conversations\Services\InboundMessageService;
use Tests\TestCase;

final class ProductionSafetyTest extends TestCase
{
    public function test_assistant_stays_off_in_production_with_a_synchronous_queue(): void
    {
        config(['conversations.ai_enabled' => true, 'queue.default' => 'sync']);
        $this->assertTrue(InboundMessageService::aiEnabled(), 'non-production keeps the flag');

        $this->app->detectEnvironment(fn () => 'production');
        $this->assertFalse(InboundMessageService::aiEnabled());

        config(['queue.default' => 'database']);
        $this->assertTrue(InboundMessageService::aiEnabled());
    }
}
