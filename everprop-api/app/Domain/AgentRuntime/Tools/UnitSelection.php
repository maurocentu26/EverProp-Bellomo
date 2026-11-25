<?php

namespace App\Domain\AgentRuntime\Tools;

use Illuminate\Database\Query\Builder;

final class UnitSelection
{
    public static function conflicts(string $message, string $code): bool
    {
        $code = mb_strtoupper(trim($code));
        $references = self::references($message);
        if (in_array($code, $references['excluded'], true)) {
            return true;
        }
        if (! preg_match('/^([A-Z-]*\d+)[A-Z]*$/D', $code, $candidate)) {
            return false;
        }

        return in_array($candidate[1], $references['families'], true)
            && ! in_array($code, $references['codes'], true);
    }

    public static function constrain(Builder $query, string $message): void
    {
        $references = self::references($message);
        $query->where(fn (Builder $q) => $q->whereNull('p.code')->orWhereNotIn('p.code', $references['excluded']));
        foreach ($references['families'] as $family) {
            // Filter siblings before LIMIT, without turning a general search into a guessed exact code.
            $query->where(fn (Builder $q) => $q->whereNull('p.code')->orWhereRaw('p.code NOT REGEXP ?', ['^'.$family.'[A-Za-z]*$'])
                ->orWhereIn('p.code', $references['codes']));
        }
    }

    /** @return array{families: list<string>, codes: list<string>, excluded: list<string>} */
    private static function references(string $message): array
    {
        // shortcut: explicit numeric unit references only; implicit references and complex negations need clarification.
        preg_match_all('/\b(?:(no(?:\s+(?:quiero|busco|es|era))?|excepto|menos)\s+)?(?:el|la|unidad|lote|depto|departamento|casa)\s+([a-z-]*\d+[a-z]*)(?![\p{L}\p{N}_-])/iu', $message, $mentions, PREG_SET_ORDER);
        $families = [];
        $excluded = [];
        foreach ($mentions as $mention) {
            $code = mb_strtoupper($mention[2]);
            if ($mention[1] !== '') {
                $excluded[] = $code;
            } elseif (preg_match('/^([A-Z-]*\d+)[A-Z]*$/D', $code, $family)) {
                $families[] = $family[1];
            }
        }
        // Include comparison siblings even when the article is not repeated: "el 17 y 17A".
        preg_match_all('/(?<![\p{L}\p{N}_-])[a-z-]*\d+[a-z]*(?![\p{L}\p{N}_-])/iu', $message, $tokens);

        return ['families' => array_values(array_unique($families)),
            'codes' => array_values(array_diff(array_unique(array_map('mb_strtoupper', $tokens[0])), $excluded)),
            'excluded' => array_values(array_unique($excluded))];
    }
}
