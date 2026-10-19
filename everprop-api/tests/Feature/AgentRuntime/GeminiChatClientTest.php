<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\AgentRuntime\Llm\DisabledLlmClient;
use App\Domain\AgentRuntime\Llm\GeminiChatClient;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GeminiChatClientTest extends TestCase
{
    public function test_translates_tool_roundtrip_and_usage(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        Http::preventStrayRequests();

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()->push([
                'candidates' => [
                    [
                        'finishReason' => 'STOP',
                        'content' => [
                            'parts' => [
                                [
                                    'functionCall' => [
                                        'name' => 'consultar_propiedad',
                                        'args' => ['id' => 'abc'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
                'usageMetadata' => [
                    'promptTokenCount' => 45,
                    'candidatesTokenCount' => 15,
                ],
            ])->push([
                'candidates' => [
                    [
                        'finishReason' => 'STOP',
                        'content' => [
                            'parts' => [
                                ['text' => 'El lote está disponible a USD 85.000.'],
                            ],
                        ],
                    ],
                ],
                'usageMetadata' => [
                    'promptTokenCount' => 70,
                    'candidatesTokenCount' => 10,
                ],
            ]),
        ]);

        $client = new GeminiChatClient('fake-gemini-key', 'gemini-3.8-flash', 20);

        $first = $client->complete(
            'Sos un asesor inmobiliario',
            [['role' => 'user', 'content' => '¿Precio del lote?']],
            [['name' => 'consultar_propiedad', 'description' => 'Consulta', 'input_schema' => ['type' => 'object']]],
            600,
            true
        );

        $this->assertSame('tool_use', $first->stopReason);
        $this->assertSame(45, $first->inputTokens);
        $this->assertSame(15, $first->outputTokens);
        $this->assertCount(1, $first->toolUses());
        $this->assertSame('consultar_propiedad', $first->toolUses()[0]['name']);
        $this->assertSame(['id' => 'abc'], $first->toolUses()[0]['input']);

        $callId = $first->toolUses()[0]['id'];

        $final = $client->complete(
            'Sos un asesor inmobiliario',
            [
                ['role' => 'assistant', 'content' => $first->content],
                ['role' => 'user', 'content' => [
                    ['type' => 'tool_result', 'tool_use_id' => $callId, 'content' => '{"disponible":true,"precio":85000}'],
                ]],
            ],
            [],
            600,
            false
        );

        $this->assertSame('end_turn', $final->stopReason);
        $this->assertSame('El lote está disponible a USD 85.000.', $final->text());
        $this->assertSame(70, $final->inputTokens);
        $this->assertSame(10, $final->outputTokens);

        Http::assertSent(function ($r) {
            $isPost = $r->url() === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
            $hasKey = $r->hasHeader('x-goog-api-key', 'fake-gemini-key');

            return $isPost && $hasKey;
        });
    }

    public function test_refuses_outside_local_without_sending_any_request(): void
    {
        $this->app['env'] = 'production';
        Http::fake();

        try {
            (new GeminiChatClient('fake-key', 'gemini-3.8-flash', 20))->complete('test', [], [], 100, false);
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
            Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'secret-canary']], $status)]);
            try {
                (new GeminiChatClient('secret-canary', 'gemini-3.8-flash', 20))->complete('private context', [], [], 100, false);
                $this->fail('Expected provider failure');
            } catch (LlmFailure $e) {
                $this->assertSame($expected, [$e->errorCode, $e->retryable, $e->billable]);
                $this->assertStringNotContainsString('secret-canary', $e->getMessage());
            }
        }
    }

    public function test_timeout_is_unknown_billable_and_retryable(): void
    {
        $this->app['env'] = 'local';
        config(['conversations.ai_enabled' => false]);
        Http::fake(fn () => throw new ConnectionException('secret-canary'));
        try {
            (new GeminiChatClient('fake', 'gemini-3.8-flash', 20))->complete('test', [], [], 100, false);
            $this->fail('Expected timeout');
        } catch (LlmFailure $e) {
            $this->assertSame(['TIMEOUT', true, true], [$e->errorCode, $e->retryable, $e->billable]);
        }
    }

    public function test_app_service_provider_binding_resolves_gemini_client(): void
    {
        $this->app['env'] = 'local';
        config([
            'agent.llm_provider' => 'gemini',
            'agent.llm_model' => 'gemini-3.8-flash',
            'agent.timeout_seconds' => 25,
            'services.gemini.key' => 'test-key',
            'services.gemini.input_rate' => 0.075,
            'services.gemini.output_rate' => 0.30,
            'services.gemini.local_budget_usd' => 10,
            'conversations.ai_enabled' => false,
        ]);

        $resolved = app(LlmClient::class);
        $this->assertInstanceOf(GeminiChatClient::class, $resolved);
        $this->assertSame('gemini', $resolved->provider());
        $this->assertSame('gemini-3.8-flash', $resolved->model());

        // Remains enabled in local when conversations.ai_enabled is true (autonomous AI testing in local)
        config(['conversations.ai_enabled' => true]);
        $this->assertInstanceOf(GeminiChatClient::class, app(LlmClient::class));

        // Disables if outside local
        $this->app['env'] = 'production';
        $this->assertInstanceOf(DisabledLlmClient::class, app(LlmClient::class));
    }
}
