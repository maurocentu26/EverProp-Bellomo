<?php

namespace App\Providers;

use App\Domain\AgentRuntime\Llm\AnthropicMessagesClient;
use App\Domain\AgentRuntime\Llm\DisabledLlmClient;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\Conversations\Transports\TransportRegistry;
use App\Domain\Identity\Policies\UserPolicy;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyFeature;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Inventory\Policies\ProjectPolicy;
use App\Domain\Inventory\Policies\PropertyFeaturePolicy;
use App\Domain\Inventory\Policies\PropertyMediaPolicy;
use App\Domain\Inventory\Policies\PropertyPolicy;
use App\Domain\Tenancy\Contracts\TenantResolver;
use App\Domain\Tenancy\Exceptions\TenantContextMissing;
use App\Domain\Tenancy\Resolvers\TrustedTenantResolver;
use App\Domain\Tenancy\TenantContext;
use App\Jobs\SendWebPush;
use App\Models\User;
use GuzzleHttp\Client;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use LogicException;
use Minishlink\WebPush\WebPush;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(TransportRegistry::class);
        $this->app->bind(LlmClient::class, fn (): LlmClient => config('agent.llm_provider') === 'anthropic'
            && filled(config('services.anthropic.key')) && filled(config('agent.llm_model'))
            ? new AnthropicMessagesClient((string) config('services.anthropic.key'), (string) config('agent.llm_model'),
                (string) config('services.anthropic.base_url'), (string) config('services.anthropic.version'), (int) config('agent.timeout_seconds'))
            : new DisabledLlmClient);
        $this->app->bind(WebPush::class, fn () => new WebPush(['VAPID' => ['subject' => config('webpush.subject'), 'publicKey' => config('webpush.public_key'), 'privateKey' => config('webpush.private_key')]], ['TTL' => 3600], new Client(['timeout' => 10, 'connect_timeout' => 5, 'allow_redirects' => false])));
        $this->app->bind(TenantResolver::class, TrustedTenantResolver::class);
        $this->app->scoped(
            TenantContext::class,
            static fn (): never => throw TenantContextMissing::forTenantOperation(),
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::listen(NotificationSent::class, function ($event) {
            if ($event->channel === 'database' && $event->notifiable instanceof User && config('webpush.private_key')) {
                try {
                    SendWebPush::dispatch((int) $event->notifiable->tenant_id, (int) $event->notifiable->id, $event->notification->id)->onConnection(config('webpush.connection'));
                } catch (\Throwable $error) {
                    // The persisted CRM action must not fail when the delivery queue is unavailable.
                    report($error);
                }
            }
        });

        if ($this->app->environment('production') && config('tenancy.allow_local_resolver')) {
            throw new LogicException('The local tenant resolver cannot be enabled in production.');
        }

        if ($this->app->environment('production') && config('tenancy.hosts', []) === []) {
            throw new LogicException('At least one trusted tenant hostname is required in production.');
        }

        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(Project::class, ProjectPolicy::class);
        Gate::policy(Property::class, PropertyPolicy::class);
        Gate::policy(PropertyFeature::class, PropertyFeaturePolicy::class);
        Gate::policy(PropertyMedia::class, PropertyMediaPolicy::class);

        // Copilot drafts spend the tenant's model budget: own keys per tenant + advisor (not shared with other throttles).
        RateLimiter::for('copilot', static fn (Request $request): array => [
            Limit::perMinute((int) config('conversations.copilot_per_minute'))->by('copilot-min|'.$request->user()?->tenant_id.'|'.$request->user()?->id),
            Limit::perDay((int) config('conversations.copilot_per_day'))->by('copilot-day|'.$request->user()?->tenant_id.'|'.$request->user()?->id),
        ]);

        RateLimiter::for('login', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('security.login_rate_limit_per_minute', 5),
        )->by('login|'.$request->ip()));

        RateLimiter::for('public-leads', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('security.public_lead_rate_limit_per_minute', 20),
        )->by('public-leads|'.$request->ip()));

        // Keyed by IP (+ token when present): random bearer tokens cannot escape the per-IP budget.
        RateLimiter::for('public-chat', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('conversations.web_rate_limit_per_minute', 20),
        )->by('public-chat|'.$request->ip()));
        RateLimiter::for('public-chat-read', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('conversations.web_read_rate_limit_per_minute', 120),
        )->by('public-chat-read|'.$request->ip()));
        // Meta delivers from shared infrastructure in bursts; the signature is the real gate.
        RateLimiter::for('meta-webhooks', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('conversations.meta_webhook_rate_limit_per_minute', 2000),
        )->by('meta-webhooks|'.$request->ip()));

        RateLimiter::for('webhooks', static fn (Request $request): Limit => Limit::perMinute(120)
            ->by('webhooks|'.$request->ip()));
    }
}
