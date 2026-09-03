<?php

namespace App\Domain\CRM\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use LogicException;

final class CreateOrGetOpenLeadProcedure
{
    /** @return array{lead_id: int, assigned_user_id: ?int, created: bool} */
    public function execute(
        int $tenantId,
        int $contactId,
        string $sourceChannel,
        string $sourceKind,
        ?string $title,
        string $priority,
        CarbonImmutable $occurredAt,
    ): array {
        $connection = DB::connection();

        if ($connection->transactionLevel() !== 0) {
            throw new LogicException('sp_create_or_get_open_lead must not run inside an application transaction.');
        }

        $statement = $connection->getPdo()->prepare(<<<'SQL'
            CALL sp_create_or_get_open_lead(
                ?, ?, NULL, NULL, ?, ?, ?, ?, ?,
                @everprop_lead_id, @everprop_assigned_user_id, @everprop_lead_created
            )
            SQL);

        $statement->execute([
            $tenantId,
            $contactId,
            $sourceChannel,
            $sourceKind,
            $title,
            $priority,
            $occurredAt->utc()->format('Y-m-d H:i:s.v'),
        ]);

        while ($statement->nextRowset()) {
            // Drain all CALL result sets before selecting session OUT values.
        }

        $statement->closeCursor();

        $result = $connection->selectOne(<<<'SQL'
            SELECT
                @everprop_lead_id AS lead_id,
                @everprop_assigned_user_id AS assigned_user_id,
                @everprop_lead_created AS created
            SQL);

        if ($result === null || $result->lead_id === null) {
            throw new LogicException('sp_create_or_get_open_lead returned no lead.');
        }

        return [
            'lead_id' => (int) $result->lead_id,
            'assigned_user_id' => $result->assigned_user_id === null ? null : (int) $result->assigned_user_id,
            'created' => (bool) $result->created,
        ];
    }
}
