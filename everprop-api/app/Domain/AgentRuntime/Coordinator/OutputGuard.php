<?php

namespace App\Domain\AgentRuntime\Coordinator;

/**
 * Deterministic checks on the model's final text before it can be queued (ADR D09, evals
 * "no inventar precio" / "no confirmar visita"). The model is not trusted to follow the prompt:
 * - every money expression must match an (amount, currency) pair returned by a tool this turn or
 *   written in an approved knowledge excerpt; amounts without a currency must match some pair's
 *   amount. "$" is pesos (ARS). "90 mil" / "1,2 millones" are scaled before comparing;
 * - no claim that a visit/unit is confirmed, scheduled or reserved; and when a visit was requested
 *   this turn the reply must say an advisor confirms it.
 */
final class OutputGuard
{
    private const USD = 'US\$|U\$S|U\$D|USD|u\$s|d[oó]lares?';

    private const ARS = 'ARS|\$|pesos?';

    private const SCALE = '(?:\s*(mil(?:lones|l[oó]n)?|k|M)\b)?';

    private const CLAIMS = [
        '/(visita|cita|turno|recorrida)[^.!?\n]{0,40}(confirmad|agendad|reservad|coordinad|programad|fijad|pactad)/iu',
        '/(\bno\s+)?(confirm|agend|reserv|program|fij|pact)(o|amos|é|ada|ado)\b[^.!?\n]{0,40}(visita|cita|turno|recorrida|unidad|propiedad|lote|departamento|casa)/iu',
        '/(\bno\s+)?\b(est[aá]|qued[oó]|queda)\s+(todo\s+)?(confirmad|agendad|programad|reservad|fijad|pactad)/iu',
        '/\b(te\s+espero|te\s+esperamos|nos\s+vemos)\b/iu',
    ];

    /**
     * @param  list<array{amount: string, currency: string}>  $prices  prices returned by tools this turn
     * @param  list<string>  $knowledge  approved knowledge excerpts shown to the model this turn
     * @return list<string> violation codes (empty = ok)
     */
    public function check(string $text, array $prices, array $knowledge, bool $visitRequested = false): array
    {
        $allowed = [];
        foreach ($prices as $price) {
            $allowed[] = [$this->normalize($price['amount'], null), $price['currency']];
        }
        foreach ($knowledge as $excerpt) {
            foreach ($this->money($excerpt) as $pair) {
                $allowed[] = $pair;
            }
        }

        $violations = [];
        foreach ($this->money($text) as [$amount, $currency]) {
            $ok = false;
            foreach ($allowed as [$a, $c]) {
                if ($a === $amount && ($currency === null || $c === null || $c === $currency)) {
                    $ok = true;
                    break;
                }
            }
            if (! $ok) {
                $violations[] = 'UNSUPPORTED_AMOUNT';
                break;
            }
        }
        if ($this->claimsConfirmation($text)) {
            $violations[] = 'CONFIRMATION_CLAIM';
        }
        if ($visitRequested && ! in_array('CONFIRMATION_CLAIM', $violations, true)
            && preg_match('/asesor[^.!?\n]{0,60}confirm|confirm[^.!?\n]{0,60}asesor/iu', $text) !== 1) {
            $violations[] = 'VISIT_NOT_MARKED_PENDING';
        }

        return $violations;
    }

    /** A negated statement ("no está confirmada", "sin confirmar", "todavía no") is the honest answer. */
    private function claimsConfirmation(string $text): bool
    {
        foreach (self::CLAIMS as $pattern) {
            preg_match_all($pattern, $text, $matches, PREG_OFFSET_CAPTURE);
            foreach ($matches[0] as [$match, $offset]) {
                // Negation counts only right before the verb ("no está confirmada", "sin confirmar",
                // "todavía no quedó agendada"), never anywhere nearby ("Sin problema, quedó confirmada").
                if (preg_match('/(confirm|agend|reserv|program|fij|pact|coordin)/iu', $match, $stem, PREG_OFFSET_CAPTURE) !== 1) {
                    return true;
                }
                $before = substr($text, 0, $offset + $stem[0][1]);
                if (preg_match('/\b(no|sin)\s+((est[aá]|qued[oó]|queda|fue|es|se)\s+)?$/iu', $before) !== 1) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Money expressions: currency before or after the number, optional scale word, or a bare
     * scaled amount ("90 mil") next to a price verb (currency unknown).
     *
     * @return list<array{0: string, 1: ?string}>
     */
    public function money(string $text): array
    {
        $number = '(\d[\d.,]*)';
        $found = [];
        $patterns = [
            ['/(?:'.self::USD.')\s?'.$number.self::SCALE.'/iu', 'USD'],
            ['/'.$number.self::SCALE.'\s?(?:de\s+)?(?:'.self::USD.')/iu', 'USD'],
            ['/(?:'.self::ARS.')\s?'.$number.self::SCALE.'/iu', 'ARS'],
            ['/'.$number.self::SCALE.'\s?(?:de\s+)?(?:'.self::ARS.')/iu', 'ARS'],
        ];
        $consumed = [];
        foreach ($patterns as [$pattern, $currency]) {
            preg_match_all($pattern, $text, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE | PREG_UNMATCHED_AS_NULL);
            foreach ($matches as $m) {
                $offset = $m[1][1];
                if (isset($consumed[$offset])) {
                    continue;
                }
                $consumed[$offset] = true;
                $found[] = [$this->normalize((string) $m[1][0], $m[2][0] ?? null), $currency];
            }
        }
        preg_match_all('/(?:sale|cuesta|vale|precio|valor)[^.!?\n]{0,30}?'.$number.'\s*(mil(?:lones|l[oó]n)?|k)\b/iu', $text, $bare, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($bare as $m) {
            if (! isset($consumed[$m[1][1]])) {
                $found[] = [$this->normalize((string) $m[1][0], (string) $m[2][0]), null];
            }
        }

        return $found;
    }

    /** "85.000", "85,000", "85000.00", "85.000,00", "90"+"mil", "1,2"+"millones" -> integer string */
    public function normalize(string $number, ?string $scale): string
    {
        $number = rtrim($number, '.,');
        $multiplier = match (mb_strtolower((string) $scale)) {
            'mil', 'k' => 1_000,
            'millones', 'millón', 'millon', 'm' => 1_000_000,
            default => 1,
        };
        if ($multiplier > 1 && preg_match('/^(\d+)[.,](\d{1,2})$/', $number, $m) === 1) {
            return (string) ((int) $m[1] * $multiplier + (int) round((int) str_pad($m[2], 2, '0') * $multiplier / 100));
        }
        $number = (string) preg_replace('/[.,]\d{1,2}$/', '', $number);
        $digits = ltrim((string) preg_replace('/\D/', '', $number), '0') ?: '0';

        return (string) ((int) $digits * $multiplier);
    }
}
