<?php

namespace App\Domain\AgentRuntime\Coordinator;

/**
 * Deterministic checks on the model's final text before it can be queued (ADR D09, evals
 * "no inventar precio" / "no confirmar visita"). The model is not trusted to follow the prompt:
 * - every money expression must match an (amount, currency) pair returned by a tool this turn or
 *   written in an approved knowledge excerpt; amounts without a currency must match some pair's
 *   amount. "$" is pesos (ARS). "90 mil" / "1,2 millones" are scaled before comparing;
 * - no claim that a visit/unit is confirmed, scheduled or reserved; and when a visit was requested
 *   this turn the reply must say an advisor confirms it;
 * - commercial terms (installments, percentages, rates, financing periods) need the same pair in this
 *   turn's approved knowledge (EVP-113, see terms()). Property descriptions are not evidence: an advisor
 *   edits them without approval.
 * Text is read after NFKC and without invisible characters, and a regex that fails is GUARD_ERROR (fails closed).
 */
final class OutputGuard
{
    private const USD = 'US\$|U\$S|U\$D|USD|u\$s|d[oó]lares?';

    private const ARS = 'ARS|\$|pesos?';

    private const SCALE = '(?:\s*(mil(?:lones|l[oó]n)?|k|M)\b)?';

    /**
     * Links and payment data can only repeat what an approved source of the tenant says: a customer (or a
     * poisoned document) asking the model to "send this alias / pay at this link" must never reach anyone.
     * URL: scheme, www. or a bare domain on a common TLD. Payment: CBU/CVU (22 digits) or an alias (word.word.word).
     */
    private const LINK = '/(?:https?:\/\/|www\.)[^\s<>"\')\]]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|ar|io|app|ly|me|co|link|site|online|shop|store|xyz|info|top|click|page|biz)\b(?:\/[^\s<>"\')\]]*)?/iu';

    private const PAYMENT = '/\b(?:\d[ -]?){21}\d\b|\b[a-z][a-z0-9]+(?:\.[a-z][a-z0-9]+){2,}\b/iu';

    private const CLAIMS = [
        '/(visita|cita|turno|recorrida)[^.!?\n]{0,40}(confirmad|agendad|reservad|coordinad|programad|fijad|pactad)/iu',
        '/(\bno\s+)?(confirm|agend|reserv|program|fij|pact)(o|amos|é|ada|ado)\b[^.!?\n]{0,40}(visita|cita|turno|recorrida|unidad|propiedad|lote|departamento|casa)/iu',
        '/(\bno\s+)?\b(est[aá]|qued[oó]|queda)\s+(todo\s+)?(confirmad|agendad|programad|reservad|fijad|pactad)/iu',
        '/\b(te\s+espero|te\s+esperamos|nos\s+vemos)\b/iu',
    ];

    /**
     * EVP-113: the model's citation marks are found on the original text (ASCII or full-width brackets) and decided on
     * its NFKC form (markIds): "[fuente: F1]", "［ｆｕｅｎｔｅ： F1］", "(fuentes: a; b)", "[fuente F1]", "[source: F1]",
     * "[F1]". The innermost bracket goes first, with the emphasis around it when it is the same on both sides
     * ("**[fuente: F1]**"); then one cut open at the end. Ids are internal: the marks never reach a channel.
     */
    private const OPEN = '[\[(\x{FF3B}\x{FF08}\x{3010}]';

    private const CLOSE = '[\])\x{FF3D}\x{FF09}\x{3011}]';

    private const INSIDE = '[^\[\]()\x{FF3B}\x{FF3D}\x{FF08}\x{FF09}\x{3010}\x{3011}\n]';

    private const BRACKETED = '/[ \t]*+(?:([*_~]{1,3})'.self::OPEN.'('.self::INSIDE.'*+)'.self::CLOSE.'\1|'.self::OPEN.'('.self::INSIDE.'*+)'.self::CLOSE.')/u';

    private const BRACKETED_OPEN = '/[ \t]*+()[*_~]*+'.self::OPEN.'('.self::INSIDE.'*+)$/u';

    /** Ids a mark may carry: an alias of this turn's prompt or a source id (document UUID and chunk). */
    private const SOURCE_ID = '(?:F\d{1,3}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:#\d+)?)';

    /** Evidence beyond this many characters per item is not read (bounds the regex work per turn). */
    private const EVIDENCE_CHARS = 4000;

    /**
     * One number or a list ("12, 24 y 36", "de 12 a 36"), never the tail of a token ("m2", "12A" stay out).
     * Possessive, so a long list ("1,1,1,...") cannot backtrack until PCRE gives up (ReDoS, EVP-113 review).
     */
    private const NUMBERS = '(?<![\p{L}\p{N}.,])(\d++(?:[.,]\d++)?+(?:\s*+(?:,|y|o|a|al|-)\s*+\d++(?:[.,]\d++)?+)*+)';

    private const RATE = '(?:TNA|TEA|CFT(?:EA)?|tasa(?:\s+de\s+inter[eé]s)?|inter[eé]s)';

    /** A number after a noun ("Cuotas: 48") that is really a percentage, an amount, a surface or a period. */
    private const NOT_A_COUNT = '(?!\s*+(?:%|mes|año|d[ií]a|m2|metros|mil\b|mill|k\b|USD|US\$|U\$S|u\$s|pesos?|d[oó]lares|\$|ARS))';

    /** Sentences about financing or payment: only there (or right after one) "36 meses" / "3 años" is a term. */
    private const FINANCING = '/financ|plazo|\bpag[aáoué]|\babon|cuota|cr[eé]dito|hipotec|anticipo|\bsald|\bresto\b|escritur|inter[eé]s|\btasa|\bTNA\b|\bTEA\b|\bplan(?:es)?\b|mensual(?!mente)|\bte\s+lo\s+dej|\d\s*%\s*de\s+entrega|entrega\s+inicial/iu';

    /** Kind of a percentage by its nearest keyword: descuento, anticipo or tasa ("70 % de avance de obra" has none). */
    private const PERCENT_KIND = '(?:(descuento|bonific|ahorro|rebaj|promo|off\b)|(anticipo|entrega|se[ñn]a)|(TNA|TEA|CFT|tasa|inter[eé]s))';

    /** Installments: "cuotas", "cuotitas", "mensualidades", "pagos". */
    private const INSTALLMENTS = '(?:cuot\p{L}*+|ctas?+|mensualidades|pagos)';

    /** Words that may sit between a number and "cuotas" ("36 cómodas cuotas"), never a preposition or an article. */
    private const FILLER = '(?:\s++(?!(?:con|en|de|del|sin|a|al|para|y|o|u|e|por|que|se|las?|los?|el|un|una)\b)\p{L}++){0,2}';

    /** EVP-L10: promises of immediate human attention, rejected outside business hours. */
    private const IMMEDIATE = '/\b(enseguida|a la brevedad|en breve|en (unos|pocos) minutos|en un rato|hoy mismo|ahora mismo|ya te (atiende|atienden|llama|llaman|contacta|contactan|escribe|escriben|responde|responden))\b/iu';

    /** A regex failed (backtrack limit, invalid UTF-8): check() reports GUARD_ERROR instead of passing the text. */
    private bool $broken = false;

    /**
     * @param  list<array{amount: string, currency: string}>  $prices  prices returned by tools this turn
     * @param  list<string>  $knowledge  approved knowledge (heading and excerpt) shown to the model this turn
     * @param  list<string>  $visitorMessages  server-scoped visitor text, never approved link evidence
     * @param  list<string>  $requested  visitor text that may back terms and amounts: only for the server-built
     *                                   contact summary, which repeats the visitor's own request (EVP-113)
     * @return list<string> violation codes (empty = ok)
     */
    public function check(string $text, array $prices, array $knowledge, bool $visitRequested = false, bool $draft = false, bool $outOfHours = false, array $visitorMessages = [], array $requested = []): array
    {
        $text = $this->canonical($text, strict: true);
        $evidence = fn (string $item): string => mb_substr($this->canonical($item), 0, self::EVIDENCE_CHARS);
        $knowledge = array_map($evidence, $knowledge);
        $requested = array_map($evidence, $requested);
        $allowed = [];
        foreach ($prices as $price) {
            $allowed[] = [$this->normalize($price['amount'], null), $price['currency']];
        }
        foreach ([...$knowledge, ...$requested] as $excerpt) {
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
        if ($this->unsupportedTerms($text, [...$knowledge, ...$requested])) {
            $violations[] = 'UNSUPPORTED_TERM';
        }
        if ($this->unsupported(self::LINK, $this->withoutVisitorEmails($text, $visitorMessages), $knowledge)) {
            $violations[] = 'UNVERIFIED_LINK';
        }
        if ($this->unsupported(self::PAYMENT, $text, $knowledge)) {
            $violations[] = 'PAYMENT_DATA';
        }
        if ($this->claimsConfirmation($text)) {
            $violations[] = 'CONFIRMATION_CLAIM';
        }
        // A copilot draft cannot act, so it must not say it registered, requested or handed anything off.
        if ($draft && $this->ok(preg_match('/\b(registr|anot|ped|solicit|deriv|pas)(é|e|amos)\b[^.!?\n]{0,50}(inter[eé]s|visita|asesor|datos|contacto|tel[eé]fono)/iu', $text)) === 1) {
            $violations[] = 'ACTION_CLAIM';
        }
        // EVP-L10: with nobody online, never promise a person right away (the fixed notice says when they are back).
        if ($outOfHours && $this->ok(preg_match(self::IMMEDIATE, $text)) === 1) {
            $violations[] = 'IMMEDIATE_PROMISE';
        }
        if ($visitRequested && ! in_array('CONFIRMATION_CLAIM', $violations, true)
            && $this->ok(preg_match('/asesor[^.!?\n]{0,60}confirm|confirm[^.!?\n]{0,60}asesor/iu', $text)) !== 1) {
            $violations[] = 'VISIT_NOT_MARKED_PENDING';
        }
        if ($this->broken) {
            $violations[] = 'GUARD_ERROR';
        }
        $this->broken = false;

        return $violations;
    }

    /**
     * The text to send: the ORIGINAL characters (never the NFKC copy, so "m²" stays "m²"), without invisible ones
     * (visible()) and without citation marks or what they leave behind ("[]", "()", "**"), repeated until nothing
     * changes, so cleaning a clean text gives the same text. Cited ids resolve case-insensitively: an alias
     * "F1".."Fn" or the long source id. Unknown when a cited id is not a source of this turn.
     *
     * @param  list<string>  $sources  this turn's source ids in prompt order: alias F1 is $sources[0]
     * @return array{0: string, 1: list<string>, 2: bool} text without marks, cited source ids, unknown citation
     */
    public function citations(string $text, array $sources = []): array
    {
        $this->broken = false;
        $text = $this->visible($text);
        $ids = [];
        $mark = function (array $m) use (&$ids): string {
            $found = $this->markIds(isset($m[3]) ? $m[3] : $m[2]);
            if ($found === null) {
                return $m[0];
            }
            array_push($ids, ...$found);

            return '';
        };
        do {
            $before = $text;
            $text = $this->ok(preg_replace_callback(self::BRACKETED, $mark, $text)) ?? $before;
            $text = $this->ok(preg_replace_callback(self::BRACKETED_OPEN, $mark, $text)) ?? $before;
            $text = trim($this->ok(preg_replace(['/'.self::OPEN.'[\s*_~]*+'.self::CLOSE.'/u', '/[ \t]{2,}/u', '/[ \t]++([.,;:!?])/u'],
                ['', ' ', '$1'], $text)) ?? $before);
        } while ($text !== $before);

        $lower = array_map(mb_strtolower(...), $sources);
        $cited = [];
        $unknown = false;
        foreach ($ids as $id) {
            $id = mb_strtolower($id);
            $index = preg_match('/^f(\d{1,3})$/', $id, $alias) === 1 ? (int) $alias[1] - 1 : array_search($id, $lower, true);
            if ($index === false || ! isset($sources[$index])) {
                $unknown = true;

                continue;
            }
            $cited[] = $sources[$index];
        }

        return [$text, array_values(array_unique($cited)), $unknown];
    }

    /**
     * Fails closed on what is about to be sent: a "fuente: F1"/"source: <uuid>" left in it, or any source id (or
     * document UUID) of this turn. "Fuente: Instagram" or "La Fuente: 2 amb" are ordinary text.
     *
     * @param  list<string>  $sources
     */
    public function leftover(string $sent, array $sources): bool
    {
        $text = mb_strtolower($this->canonical($sent));
        if ($this->ok(preg_match('/(?:fuentes?|sources?)\s*+:?\s*+(?:'.self::SOURCE_ID.'|#\d)/iu', $text)) !== 0) {
            return true;
        }
        foreach (array_map(mb_strtolower(...), $sources) as $source) {
            if (str_contains($text, $source) || str_contains($text, explode('#', $source)[0])) {
                return true;
            }
        }

        return false;
    }

    /**
     * EVP-113 review: the request written as a grant or a state of the deal ("acordamos", "le corresponden", "condición
     * vigente", "aplica", "incluye", "precio final"). In a request (asks(): "Consulta si está disponible", "Pregunta si
     * se puede confirmar una visita") "confirm…" and "disponible" are the visitor's question, not a commitment.
     */
    public function commits(string $text, bool $asked = false): bool
    {
        $question = $asked ? '' : '|confirm|disponible';

        return $this->ok(preg_match('/\b(?:acord|ofrec|otorg|aprob|garantiz|reservad|corresp|vigent|aplic|inclu|acced|habilit|conced'.$question.')\p{L}*|\bprecio\s+final\b|\bte\s+(?:damos|hacemos|dejamos)\b/iu',
            $this->canonical($text))) !== 0;
    }

    /** The "Consulta" of a summary reads as the visitor's request ("Quiere pagar en 36 cuotas", "¿…?"). */
    public function asks(string $text): bool
    {
        return $this->ok(preg_match('/\b(?:quieren?|piden?|consultan?|preguntan?|le\s+interesa|les\s+interesa|buscan?)\b|¿/iu', $this->canonical($text))) === 1;
    }

    /**
     * The ids of a bracketed text that is a citation mark, or null when it is ordinary text ("(ver condiciones)",
     * "[fuente de agua]"). Decided on NFKC, so full-width forms count.
     *
     * @return list<string>|null
     */
    private function markIds(string $inside): ?array
    {
        $text = trim($this->canonical($inside));
        $list = self::SOURCE_ID.'(?:\s*+(?:[,;]|\by\b)\s*+'.self::SOURCE_ID.')*+';
        if ($this->ok(preg_match('/^(?:fuentes?|sources?)\s*+(?::\s*+(.*+)|('.$list.'))?+$/isu', $text, $m)) === 1) {
            $ids = ($m[1] ?? '') !== '' ? $m[1] : ($m[2] ?? '');
        } elseif ($this->ok(preg_match('/^'.$list.'$/iu', $text)) === 1) {
            $ids = $text;
        } else {
            return null;
        }

        return array_values(array_filter(array_map(fn (string $id): string => trim($id, " \"'`."),
            preg_split('/\s*+(?:[,;]|\by\b)\s*+/u', trim($ids), -1, PREG_SPLIT_NO_EMPTY) ?: []), fn (string $id): bool => $id !== ''));
    }

    /**
     * What the client sees and what is checked must be the same characters. Format characters (\p{Cf}: soft hyphen,
     * zero width, bidi controls, tags) and other invisible ones go; U+200D and U+FE0F stay only inside emoji
     * sequences; fillers that render as blank (U+3164, U+115F, U+1160, U+FFA0, U+2800) become a space.
     */
    private function visible(string $text): string
    {
        return $this->ok(preg_replace([
            '/[\x{3164}\x{115F}\x{1160}\x{FFA0}\x{2800}]/u',
            '/(?<![\p{So}\p{Sk}\x{FE0F}])\x{200D}|\x{200D}(?!\p{So})/u',
            '/(?<![\p{So}\p{Sk}])\x{FE0F}(?!\x{20E3})|[\x{FE00}-\x{FE0E}\x{E0100}-\x{E01EF}\x{034F}]|(?!\x{200D})\p{Cf}/u',
        ], [' ', '', ''], $text)) ?? $text;
    }

    /**
     * What the checks read: visible() text in NFKC (full-width forms become ASCII), keycaps ("3️⃣") and digits of any
     * script as ASCII, "٪" as "%". Strict (the text to send, never the evidence) fails closed on digit tricks NFKC would
     * hide or keep: a mark on a digit ("3̲6̲", "3́6"), two digits split by a non-ASCII space ("3\u{202F}6") and a word
     * mixing Latin with another script ("cuоtas" with a Cyrillic "о").
     */
    private function canonical(string $text, bool $strict = false): string
    {
        $text = $this->ok(preg_replace('/(\p{Nd})\x{FE0F}?\x{20E3}/u', '$1', $this->visible($text))) ?? $text;
        if ($strict && $this->ok(preg_match('/\p{N}\p{M}|\p{Nd}[\x{00A0}\x{202F}\x{2009}]\p{Nd}/u', $text)) !== 0) {
            $this->broken = true;
        }
        $nfkc = \Normalizer::normalize($text, \Normalizer::FORM_KC);
        if ($nfkc === false) {
            $this->broken = true; // invalid UTF-8: keep it, every /u pattern below fails and says so

            return $text;
        }

        // "٣٦ cuotas" reads as "36 cuotas"; a digit IntlChar cannot read fails closed.
        $nfkc = $this->ok(preg_replace_callback('/(?![0-9])\p{Nd}/u', function (array $m): string {
            $digit = \IntlChar::digit($m[0]);
            if (! in_array($digit, range(0, 9), true)) {
                $this->broken = true;

                return $m[0];
            }

            return (string) $digit;
        }, str_replace(['٪', '﹪', '％'], '%', $this->visible($nfkc)))) ?? $nfkc;
        if ($strict && $this->ok(preg_match_all('/\p{L}{2,}+/u', $nfkc, $words)) !== false) {
            foreach ($words[0] as $word) {
                if (preg_match('/\p{Latin}/u', $word) === 1 && preg_match('/[^\p{Latin}]/u', $word) === 1) {
                    $this->broken = true; // a homoglyph hides a word from the patterns
                }
            }
        }

        return $nfkc;
    }

    /**
     * Some term of the reply is not in the evidence as the same (number, kind) pair.
     *
     * @param  list<string>  $evidence
     */
    private function unsupportedTerms(string $text, array $evidence): bool
    {
        $backed = array_merge(...array_map($this->terms(...), $evidence));

        // A percentage with no recognizable kind ("%") needs the same number also without a kind in the evidence.
        return array_diff($this->terms($text), $backed) !== [];
    }

    /**
     * EVP-113: commercial terms as normalized "number|kind" pairs. A lone "36" (an id, a unit code) never backs
     * "36 cuotas", a term of another kind never backs it, and numbers are plain decimals ("10,50" -> "10.5").
     * - cuotas: "36 cuotas", "36 cuotitas", "36 cómodas cuotas", "en 36 veces", "12 o 24 cuotas", "18 mensualidades",
     *   "Cuotas: 48", "Cantidad de cuotas: 36", "12 cuotas sin interés o en 24";
     * - descuento / anticipo / tasa: a percentage by its keyword ("30 % de descuento", "anticipo del 30 %",
     *   "45 % TEA", "30 % off", "te bonificamos el 30 %"), or the keyword first ("Anticipo: 30", "Anticipo 30"),
     *   "0 de anticipo"; "%" when it has none; tasa also "TNA 45", "3 % de interés"; zero: "sin interés(es)",
     *   "tasa cero", "interés cero", "sin recargo" (0|tasa) and "sin anticipo/entrega/seña" (0|anticipo);
     * - meses: "36 meses", "3 años" (= 36), "Plazo: 60", "saldo a 48", "financiamos 48", only in a sentence about
     *   financing or payment or right after one, so "la obra se entrega en 6 meses" is not a term.
     *
     * ponytail: a lexical control; it cannot cover every paraphrase of a commercial promise. The safety net is the
     * evaluation with the real model (Q01) before any prompt or model change; upgrade path: a reviewed list of
     * phrasings from production traces.
     *
     * @return list<string>
     */
    private function terms(string $text): array
    {
        // A copy for reading only (never sent): Markdown/WhatsApp formatting, symbols and emoji split "**36** cuotas",
        // "36 💳 cuotas" or "36-cuotas"; table rows become "Header: cell." so "| Cuotas |…| 36 |" reads "Cuotas: 36.".
        // "Entrega 2027": a year after "entrega" is a date, never a down payment nor part of a list ("2027, 36 cuotas").
        $text = $this->ok(preg_replace(['/[*_~`|\p{So}\p{Sk}]/u', '/(\d)\s*+-\s*+(?=\p{L})/u', '/\b(entregas?+\s++(?:(?:en|de|para)\s++)?+)(?:19|20)\d\d\b/iu'],
            [' ', '$1 ', '$1 '], $this->tables($text))) ?? $text;
        // "XXXVI cuotas", "Ⅻ cuotas" (NFKC: "XII"): Roman numerals before a financing noun are numbers.
        $text = $this->ok(preg_replace_callback('/\b([IVXLC]{2,}+)(?=\s++(?:cuot|ctas?\b|mensualidades|pagos|meses|años|veces|%))/u',
            fn (array $m): string => (string) $this->roman($m[1]), $text)) ?? $text;
        // "por ciento" first: wordsToDigits would read "ciento" as 100.
        $text = $this->wordsToDigits($this->ok(preg_replace('/\bpor\s*+ciento\b/iu', '%', $text)) ?? $text);
        // "36 (treinta y seis) cuotas": the spelled copy goes; another number in parentheses stays, bare.
        $text = $this->ok(preg_replace(['/(\d++(?:[.,]\d++)?+)\s*+\(\s*+\1\s*+\)/u', '/\(\s*+(\d++(?:[.,]\d++)?+)\s*+\)/u'], ['$1', ' $1 '], $text)) ?? $text;
        $n = self::NUMBERS;
        $found = [];
        if ($this->ok(preg_match('/\bsin\s++(?:inter[eé]s(?:es)?+|recargos?+|costo\s++financiero)\b|\btasa\s++(?:de\s++)?+cero\b|\binter[eé]s(?:es)?+\s++cero\b|\b(?:no\s++tienen?+|libres?+\s++de)\s++inter[eé]s/iu', $text)) === 1) {
            $found[] = '0|tasa';
        }
        if ($this->ok(preg_match('/\bsin\s++(?:anticipo|entrega|se[ñn]a)\b|\bno\s++(?:hace\s++falta|requiere|lleva)\s++(?:un\s++|el\s++)?+anticipo\b/iu', $text)) === 1) {
            $found[] = '0|anticipo';
        }
        $add = function (?string $numbers, string $kind, ?string $unit = null) use (&$found): void {
            preg_match_all('/\d++(?:[.,]\d++)?+/', (string) $numbers, $digits);
            foreach ($digits[0] as $digit) {
                $found[] = ((float) str_replace(',', '.', $digit) * ($unit !== null && stripos($unit, 'a') === 0 ? 12 : 1)).'|'.$kind;
            }
        };

        $cuotas = self::INSTALLMENTS;
        foreach ($this->matches('/'.$n.self::FILLER.'\s*+'.$cuotas.'\b/iu', $text) as $m) {
            $add($m[1][0], 'cuotas');
        }
        foreach ($this->matches('/\ben\s++'.$n.'\s*+veces\b|(?<![\p{L}\p{N}])x\s*+(\d++)\b/iu', $text) as $m) {
            $add($m[1][0] ?? $m[2][0], 'cuotas'); // "en 36 veces", "x36"
        }
        foreach ($this->matches('/\b'.$cuotas.'\b(?:\s++(?:sin\s++inter[eé]s(?:es)?+|fijas?+|mensuales|iguales))?+\s*+(?::|\bde\b|\bhasta\b|,?+\s*+\bo\s++(?:en\s++|de\s++)?+|\by\s++(?:en|de)\s++)\s*+(?:hasta\s++)?+'.$n.self::NOT_A_COUNT.'/iu', $text) as $m) {
            $add($m[1][0], 'cuotas');
        }
        foreach ($this->matches('/\b(anticipo|entrega|se[ñn]a|descuento|bonificaci[oó]n)\s*+(?::|\bdel?\b|\bhasta\b)?+\s*+(?:hasta\s++)?+(?:(?:el|un|una)\s++)?+'.$n.self::NOT_A_COUNT.'/iu', $text) as $m) {
            $add($m[2][0], $this->percentKind((string) $m[1][0], ''));
        }
        foreach ($this->matches('/'.$n.'\s*+(?:del?\s++)?+(?:anticipo|se[ñn]a)\b/iu', $text) as $m) {
            $add($m[1][0], 'anticipo');
        }
        foreach ($this->matches('/'.$n.'\s*+%/u', $text) as $m) {
            // Bounded windows (whole characters): the keyword is next to the percentage, so no scan of the whole text.
            $before = mb_strcut(substr($text, 0, $m[0][1]), max(0, $m[0][1] - 400));
            $after = mb_strcut(substr($text, $m[0][1] + strlen((string) $m[0][0])), 0, 400);
            $kind = $this->percentKind($after, $before);
            // A percentage with no kind is a term only in a sentence about financing ("70 % de avance" is not).
            $sentence = last(preg_split('/[.!?;\n]/u', $before) ?: ['']).$m[0][0].(preg_split('/[.!?;\n]/u', $after) ?: [''])[0];
            if ($kind !== '%' || $this->ok(preg_match(self::FINANCING, $sentence)) !== 0) {
                $add($m[1][0], $kind);
            }
        }
        foreach ($this->matches('/\b'.self::RATE.'(?:\s++(?:anual|nominal|efectiva|mensual|fij[ao]|del?|es|un|una)\b)*+\s*+:?+\s*+(\d++(?:[.,]\d++)?+)/iu', $text) as $m) {
            $add($m[1][0], 'tasa');
        }
        foreach ($this->matches('/'.$n.'\s*+%?+\s*+(?:de\s++)?+'.self::RATE.'\b/iu', $text) as $m) {
            $add($m[1][0], 'tasa');
        }

        // Periods: a sentence about financing or payment, or the one right after it ("12 cuotas. Después, 60 meses más").
        $sentences = $this->ok(preg_split('/(?<=[.!?;])\s+|\n+/u', $text)) ?: [];
        $periods = [];
        foreach ($sentences as $i => $sentence) {
            $financing = fn (int $j): bool => $this->ok(preg_match(self::FINANCING, $sentences[$j])) !== 0;
            // The previous sentence carries over, unless this one is about the works or handing over a unit.
            if ($financing($i) || ($i > 0 && $financing($i - 1) && $this->ok(preg_match('/\bobra\b|\bse\s+entrega|\bposesi[oó]n\b/iu', $sentence)) === 0)) {
                $periods[] = $sentence;
            }
        }
        $periods = implode("\n", $periods);
        foreach ($this->matches('/'.$n.'\s*+(mes(?:es)?+|años?+)\b/iu', $periods) as $m) {
            // "tiene 5 años", "antigüedad de 5 años" are an age, not a period.
            if (stripos((string) $m[2][0], 'a') !== 0 || preg_match('/(?:\btiene|antig[uü]edad(?:\s+de)?)\s*+$/iu', mb_strcut(substr($periods, 0, $m[0][1]), max(0, $m[0][1] - 40))) !== 1) {
                $add($m[1][0], 'meses', $m[2][0]);
            }
        }
        foreach ($this->matches('/'.$n.'\s*+veces\b/iu', $periods) as $m) {
            $add($m[1][0], 'cuotas'); // "Pagalo 36 veces"
        }
        foreach ($this->matches('/\bplazo(?:\s++(?:m[aá]ximo|total))?+\s*+(?::|\bde\b|\bhasta\b)\s*+(?:hasta\s++)?+'.$n.'\s*+(mes(?:es)?+|años?+)?+/iu', $periods) as $m) {
            $add($m[1][0], 'meses', $m[2][0]);
        }
        // "saldo a 48", "resto en 48", "financiamos 48": a bare number after financing words is a period.
        foreach ($this->matches('/\b(?:saldo|resto|financi\p{L}*+)\s++(?:(?:a|en|hasta)\s++)?+'.$n.self::NOT_A_COUNT.'(?!\s*+'.self::INSTALLMENTS.')/iu', $periods) as $m) {
            $add($m[1][0], 'meses');
        }

        return array_values(array_unique($found));
    }

    /** Markdown tables: each data row also as "Header: cell." lines, so a column header reads next to its value. */
    private function tables(string $text): string
    {
        $rows = [];
        $header = null;
        foreach (explode("\n", $text) as $line) {
            if (substr_count($line, '|') < 2) {
                $header = null;

                continue;
            }
            if (preg_match('/^[\s|:\-]++$/', $line) === 1) {
                continue;
            }
            $cells = array_map(trim(...), explode('|', trim(trim($line), '|')));
            if ($header === null) {
                $header = $cells;

                continue;
            }
            foreach ($cells as $i => $cell) {
                $rows[] = ($header[$i] ?? '').': '.$cell.'.';
            }
        }

        return $rows === [] ? $text : $text."\n".implode("\n", $rows);
    }

    private function roman(string $numeral): int
    {
        $values = ['I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100];
        $total = 0;
        foreach (str_split($numeral) as $i => $char) {
            $next = $values[$numeral[$i + 1] ?? ''] ?? 0;
            $total += $values[$char] < $next ? -$values[$char] : $values[$char];
        }

        return $total;
    }

    /** descuento, anticipo or tasa by the keyword right after the percentage, else in the 3 words before it; "%" if none. */
    private function percentKind(string $after, string $before): string
    {
        $word = '[\p{L}\p{N}]';
        $k = [];
        if ($this->ok(preg_match('/^\s*+(?:del?\s+|en\s+)?(?:'.$word.'++\s+)?'.self::PERCENT_KIND.'/iu', $after, $k)) !== 1
            && $this->ok(preg_match('/'.self::PERCENT_KIND.$word.'*+(?:\s++'.$word.'++){0,3}+\s*+$/iu', $before, $k)) !== 1) {
            return '%';
        }

        return match (true) {
            ($k[1] ?? '') !== '' => 'descuento',
            ($k[2] ?? '') !== '' => 'anticipo',
            default => 'tasa',
        };
    }

    /**
     * @return list<array<int, array{0: ?string, 1: int}>>
     */
    private function matches(string $pattern, string $text): array
    {
        $m = [];
        $this->ok(preg_match_all($pattern, $text, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE | PREG_UNMATCHED_AS_NULL));

        return $m;
    }

    /**
     * @template T
     *
     * @param  T  $result
     * @return T
     */
    private function ok(mixed $result): mixed
    {
        if ($result === false || $result === null) {
            $this->broken = true;
        }

        return $result;
    }

    /** @param list<string> $visitorMessages */
    private function withoutVisitorEmails(string $text, array $visitorMessages): string
    {
        // Match whole tokens: an email must not authorize a URL, mailto link or its domain.
        $tokens = '/[^\s<>"\'()\[\],;]+/u';
        $matches = [];
        $tokensFound = $this->ok(preg_match_all($tokens, implode("\n", $visitorMessages), $matches)) ? $matches[0] : [];
        $emails = [];
        foreach ($tokensFound as $token) {
            $email = rtrim($token, '.!?');
            if (filter_var($email, FILTER_VALIDATE_EMAIL) !== false) {
                $emails[$email] = true;
            }
        }

        return $this->ok(preg_replace_callback($tokens, static function (array $match) use ($emails): string {
            $email = rtrim($match[0], '.!?');

            return isset($emails[$email]) ? substr($match[0], strlen($email)) : $match[0];
        }, $text)) ?? $text;
    }

    /**
     * Some match of $pattern in the text that does not appear (case-insensitive) in the approved sources.
     *
     * @param  list<string>  $knowledge
     */
    private function unsupported(string $pattern, string $text, array $knowledge): bool
    {
        $evidence = mb_strtolower(implode("\n", $knowledge));
        $matches = [];
        foreach ($this->ok(preg_match_all($pattern, $text, $matches)) ? $matches[0] : [] as $found) {
            $found = mb_strtolower(rtrim($found, '.,;:!?'));
            // Compare digits only for account numbers, so "0000 0031..." and "000000031..." are the same.
            $digits = preg_replace('/\D/', '', $found);
            if (strlen((string) $digits) === 22 ? ! str_contains((string) preg_replace('/\D/', '', $evidence), (string) $digits) : ! str_contains($evidence, $found)) {
                return true;
            }
        }

        return false;
    }

    /** A negated statement ("no está confirmada", "sin confirmar", "todavía no") is the honest answer. */
    private function claimsConfirmation(string $text): bool
    {
        foreach (self::CLAIMS as $pattern) {
            $matches = [];
            $found = $this->ok(preg_match_all($pattern, $text, $matches, PREG_OFFSET_CAPTURE)) ? $matches[0] : [];
            foreach ($found as [$match, $offset]) {
                // Negation counts only right before the verb ("no está confirmada", "sin confirmar",
                // "todavía no quedó agendada"), never anywhere nearby ("Sin problema, quedó confirmada").
                if ($this->ok(preg_match('/(confirm|agend|reserv|program|fij|pact|coordin)/iu', $match, $stem, PREG_OFFSET_CAPTURE)) !== 1) {
                    return true;
                }
                $before = substr($text, 0, $offset + $stem[0][1]);
                if ($this->ok(preg_match('/\b(no|sin)\s+((est[aá]|qued[oó]|queda|fue|es|se)\s+)?$/iu', $before)) !== 1) {
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
        $text = $this->wordsToDigits($text);
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
            foreach ($this->matches($pattern, $text) as $m) {
                $offset = $m[1][1];
                if (isset($consumed[$offset])) {
                    continue;
                }
                $consumed[$offset] = true;
                $found[] = [$this->normalize((string) $m[1][0], $m[2][0] ?? null), $currency];
            }
        }
        foreach ($this->matches('/(?:sale|cuesta|vale|precio|valor)[^.!?\n]{0,30}?'.$number.'\s*(mil(?:lones|l[oó]n)?|k)\b/iu', $text) as $m) {
            if (! isset($consumed[$m[1][1]])) {
                $found[] = [$this->normalize((string) $m[1][0], (string) $m[2][0]), null];
            }
        }

        return $found;
    }

    private const WORDS = [
        'un' => 1, 'uno' => 1, 'una' => 1, 'dos' => 2, 'tres' => 3, 'cuatro' => 4, 'cinco' => 5, 'seis' => 6,
        'siete' => 7, 'ocho' => 8, 'nueve' => 9, 'diez' => 10, 'once' => 11, 'doce' => 12, 'trece' => 13,
        'catorce' => 14, 'quince' => 15, 'dieciséis' => 16, 'dieciseis' => 16, 'diecisiete' => 17, 'dieciocho' => 18,
        'diecinueve' => 19, 'veinte' => 20, 'veintiún' => 21, 'veintiun' => 21, 'veintiuno' => 21, 'veintiuna' => 21,
        'veintidós' => 22, 'veintidos' => 22, 'veintitrés' => 23, 'veintitres' => 23, 'veinticuatro' => 24,
        'veinticinco' => 25, 'veintiséis' => 26, 'veintiseis' => 26, 'veintisiete' => 27, 'veintiocho' => 28,
        'veintinueve' => 29, 'treinta' => 30, 'cuarenta' => 40, 'cincuenta' => 50, 'sesenta' => 60, 'setenta' => 70,
        'ochenta' => 80, 'noventa' => 90, 'cien' => 100, 'ciento' => 100, 'doscientos' => 200, 'doscientas' => 200,
        'trescientos' => 300, 'trescientas' => 300, 'cuatrocientos' => 400, 'cuatrocientas' => 400, 'quinientos' => 500,
        'quinientas' => 500, 'seiscientos' => 600, 'seiscientas' => 600, 'setecientos' => 700, 'setecientas' => 700,
        'ochocientos' => 800, 'ochocientas' => 800, 'novecientos' => 900, 'novecientas' => 900,
    ];

    /**
     * Spelled-out Spanish amounts to digits so money() sees them: "ochenta y cinco mil" -> "85 mil",
     * "un millón doscientos mil" -> "1200 mil", "medio millón" -> "500 mil". A lone article or "medio"
     * ("un lote", "medio baño") is left alone.
     */
    public function wordsToDigits(string $text): string
    {
        $word = '(?:'.implode('|', array_keys(self::WORDS)).'|mil|mill[oó]n|millones|medio)';
        // "y" joins only tens+units ("ochenta y cinco") or a scale + "medio" ("un millón y medio"),
        // so a range ("entre dos y tres") is not summed.
        $and = '(?<=treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|mil|millón|millon|millones)\s+y';

        // Not right after digits: "85 mil" / "1,2 millones" are already handled by money().
        return $this->ok(preg_replace_callback('/(?<![\d.,]\s)(?<![\d.,])\b'.$word.'(?:(?:'.$and.')?\s+'.$word.')*\b/iu', function (array $m): string {
            $tokens = preg_split('/\s+/u', mb_strtolower($m[0]), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            if (array_diff($tokens, ['un', 'uno', 'una', 'medio', 'y']) === []) {
                return $m[0];
            }
            $total = 0;
            $current = 0.0;
            $scale = 0;
            foreach ($tokens as $token) {
                if ($token === 'mil' || in_array($token, ['millón', 'millon', 'millones'], true)) {
                    $scale = $token === 'mil' ? 1_000 : 1_000_000;
                    $total += (int) round(($current ?: 1) * $scale);
                    $current = 0.0;
                } elseif ($token === 'medio' && $current === 0.0 && $scale > 0) {
                    $total += intdiv($scale, 2); // "un millón y medio"
                } elseif ($token === 'medio') {
                    $current += 0.5; // "medio millón"
                } elseif ($token !== 'y') {
                    $current += self::WORDS[$token];
                }
            }
            $total += (int) $current;

            return $total >= 1_000 && $total % 1_000 === 0 ? ($total / 1_000).' mil' : (string) $total;
        }, $text)) ?? $text;
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
