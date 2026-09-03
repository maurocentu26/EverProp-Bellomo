<?php

namespace App\Domain\Inventory\Concerns;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

trait HasPublicId
{
    protected static function bootHasPublicId(): void
    {
        static::creating(static function (Model $model): void {
            if (! $model->getAttribute('public_id')) {
                $model->setAttribute('public_id', (string) Str::uuid());
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }
}
