<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\AgentRuntime\Llm\AnthropicMessagesClient;
use App\Domain\AgentRuntime\Llm\DisabledLlmClient;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use App\Domain\AgentRuntime\Llm\OpenAiChatClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class OpenAiChatClientTest extends TestCase
{
    public function test_translates_tool_roundtrip_and_usage_without_storing_responses(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        Http::preventStrayRequests();
        Http::fake(['api.openai.com/*' => Http::sequence()->push([
            'choices' => [['finish_reason' => 'tool_calls', 'message' => ['content' => null, 'tool_calls' => [
                ['id' => 'call_1', 'type' => 'function', 'function' => ['name' => 'consultar_propiedad', 'arguments' => '{"id":"abc"}']],
            ]]]], 'usage' => ['prompt_tokens' => 40, 'completion_tokens' => 12],
        ])->push(['choices' => [['finish_reason' => 'stop', 'message' => ['content' => 'Dato vigente']]], 'usage' => ['prompt_tokens' => 60, 'completion_tokens' => 9]])]);
        $client = new OpenAiChatClient('fake-local-key', 'explicit-model', 20);
        $first = $client->complete('Solo fuentes aprobadas', [['role' => 'user', 'content' => 'Precio?']],
            [['name' => 'consultar_propiedad', 'description' => 'Consulta', 'input_schema' => ['type' => 'object']]], 600, true);
        $this->assertSame(['id' => 'call_1', 'name' => 'consultar_propiedad', 'input' => ['id' => 'abc']], $first->toolUses()[0]);
        $this->assertSame(40, $first->inputTokens);
        $this->assertSame(12, $first->outputTokens);
        $final = $client->complete('Solo fuentes aprobadas', [
            ['role' => 'assistant', 'content' => $first->content],
            ['role' => 'user', 'content' => [['type' => 'tool_result', 'tool_use_id' => 'call_1', 'content' => '{"ok":true}']]],
        ], [], 600, false);
        $this->assertSame('Dato vigente', $final->text());
        Http::assertSent(fn ($r) => $r->url() === 'https://api.openai.com/v1/chat/completions'
            && $r['store'] === false && $r['max_completion_tokens'] === 600 && ! isset($r['tool_choice'])
            && $r['messages'][1]['tool_calls'][0]['function']['arguments'] === '{"id":"abc"}'
            && $r['messages'][2]['role'] === 'tool' && $r['messages'][2]['tool_call_id'] === 'call_1');
    }

    public function test_refuses_outside_local_without_sending_any_request(): void
    {
        $this->app['env'] = 'production';
        Http::fake();
        try {
            (new OpenAiChatClient('fake-key', 'model', 20))->complete('test', [], [], 100, false);
            $this->fail('Expected local-only failure');
        } catch (LlmFailure $e) {
            $this->assertSame('LOCAL_COPILOT_ONLY', $e->errorCode);
        }
        Http::assertNothingSent();
    }

    public function test_http_failures_are_redacted_and_keep_conservative_billing(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        foreach ([401 => ['PROVIDER_REJECTED', false, false], 429 => ['RATE_LIMITED', true, false], 500 => ['PROVIDER_ERROR', true, true]] as $status => $expected) {
            Http::swap(new Factory);
            Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'secret-canary']], $status)]);
            try {
                (new OpenAiChatClient('secret-canary', 'model', 20))->complete('private context', [], [], 100, false);
                $this->fail('Expected provider failure');
            } catch (LlmFailure $e) {
                $this->assertSame($expected, [$e->errorCode, $e->retryable, $e->billable]);
                $this->assertStringNotContainsString('secret-canary', $e->getMessage());
            }
        }
    }

    public function test_rejects_truncated_and_malformed_tool_arguments(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        foreach (['length', 'bad-json'] as $case) {
            Http::swap(new Factory);
            Http::fake(['api.openai.com/*' => Http::response(['choices' => [[
                'finish_reason' => $case === 'length' ? 'length' : 'tool_calls',
                'message' => ['tool_calls' => [['id' => 'x', 'function' => ['name' => 'buscar_propiedades', 'arguments' => '{broken']]]],
            ]], 'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 1]])]);
            try {
                (new OpenAiChatClient('fake', 'model', 20))->complete('test', [], [], 100, true);
                $this->fail('Expected invalid output failure');
            } catch (LlmFailure $e) {
                $this->assertTrue($e->billable);
                $this->assertFalse($e->retryable);
            }
        }
    }

    public function test_timeout_is_unknown_billable_and_retryable(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        Http::fake(fn () => throw new ConnectionException('secret-canary'));
        try {
            (new OpenAiChatClient('fake', 'model', 20))->complete('test', [], [], 100, false);
            $this->fail('Expected timeout');
        } catch (LlmFailure $e) {
            $this->assertSame(['TIMEOUT', true, true], [$e->errorCode, $e->retryable, $e->billable]);
        }
    }

    public function test_binding_requires_local_configuration_and_preserves_anthropic(): void
    {
        $this->app['env'] = 'local';
        config(['agent.llm_provider' => 'openai', 'agent.llm_model' => 'model', 'services.openai.key' => 'fake',
            'services.openai.input_rate' => 1, 'services.openai.output_rate' => 2, 'services.openai.local_budget_usd' => 1,
            'conversations.ai_enabled' => false]);
        $this->assertInstanceOf(OpenAiChatClient::class, app(LlmClient::class));
        config(['conversations.ai_enabled' => true]);
        $this->assertInstanceOf(DisabledLlmClient::class, app(LlmClient::class));
        config(['conversations.ai_enabled' => false, 'services.openai.local_budget_usd' => null]);
        $this->assertInstanceOf(DisabledLlmClient::class, app(LlmClient::class));
        config(['services.openai.local_budget_usd' => 1]);
        config(['services.openai.key' => '']);
        $this->assertInstanceOf(DisabledLlmClient::class, app(LlmClient::class));
        config(['agent.llm_provider' => 'anthropic', 'services.anthropic.key' => 'fake']);
        $this->assertInstanceOf(AnthropicMessagesClient::class, app(LlmClient::class));
    }

    public function test_rejects_invalid_token_accounting(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        Http::fake(['api.openai.com/*' => Http::response(['choices' => [['finish_reason' => 'stop', 'message' => ['content' => 'test']]],
            'usage' => ['prompt_tokens' => -1, 'completion_tokens' => 1]])]);
        $this->expectException(LlmFailure::class);
        (new OpenAiChatClient('fake', 'model', 20))->complete('test', [], [], 100, false);
    }
}
