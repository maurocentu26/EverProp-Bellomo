<?php
namespace App\Domain\Identity\Policies;
use App\Models\User;
final class WebPushPolicy {
    public function manage(User $user, int $tenantId): bool {
        return (int) $user->tenant_id === $tenantId && $user->isActive();
    }
}
