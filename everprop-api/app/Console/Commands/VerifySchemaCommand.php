<?php

namespace App\Console\Commands;

use App\Domain\Shared\Infrastructure\Database\SchemaContractVerifier;
use Illuminate\Console\Command;

final class VerifySchemaCommand extends Command
{
    protected $signature = 'everprop:schema:verify';

    protected $description = 'Verify the immutable EverProp MySQL baseline contract.';

    public function handle(SchemaContractVerifier $verifier): int
    {
        $checks = $verifier->verify();
        $rows = [];

        foreach ($checks as $name => $check) {
            $rows[] = [
                $name,
                $this->display($check['expected']),
                $this->display($check['actual']),
                $check['passed'] ? 'PASS' : 'FAIL',
            ];
        }

        $this->table(['Check', 'Expected', 'Actual', 'Status'], $rows);

        if (collect($checks)->contains(static fn (array $check): bool => ! $check['passed'])) {
            $this->error('EverProp schema contract verification failed.');

            return self::FAILURE;
        }

        $this->info('EverProp schema contract verified.');

        return self::SUCCESS;
    }

    private function display(mixed $value): string
    {
        if (is_array($value)) {
            return implode(', ', $value);
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        return (string) $value;
    }
}
