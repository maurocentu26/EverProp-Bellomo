<?php

namespace App\Providers;

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
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use LogicException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
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

        RateLimiter::for('login', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('security.login_rate_limit_per_minute', 5),
        )->by('login|'.$request->ip()));

        RateLimiter::for('public-leads', static fn (Request $request): Limit => Limit::perMinute(
            (int) config('security.public_lead_rate_limit_per_minute', 20),
        )->by('public-leads|'.$request->ip()));

        RateLimiter::for('webhooks', static fn (Request $request): Limit => Limit::perMinute(120)
            ->by('webhooks|'.$request->ip()));
    }
}
