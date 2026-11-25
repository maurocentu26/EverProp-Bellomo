<?php

namespace App\Domain\AgentRuntime\Coordinator;

use App\Domain\AgentRuntime\Knowledge\KnowledgeSafety;

/**
 * Deterministic checks on the model's final text before it can be queued (ADR D09, evals
 * "no inventar precio" / "no confirmar visita"). The model is not trusted to follow the prompt:
 * - EVP-200: no price, no availability claim, and no quote or installment unless the project authorizes them.
 *   A money expression passes only when it repeats the visitor's own request (contact summary) or, with
 *   financing authorized, an (amount, currency) pair of an approved knowledge excerpt; amounts without a
 *   currency must match some pair's amount. "$" is pesos (ARS). "90 mil" / "1,2 millones" are scaled first;
 * - no claim that a visit/unit is confirmed, scheduled or reserved; and when a visit was requested
 *   this turn the reply must say an advisor confirms it;
 * - commercial terms (installments, percentages, rates, financing periods) need the same pair in this
 *   turn's approved knowledge (EVP-113, see terms()). Property descriptions are not evidence: an advisor
 *   edits them without approval;
 * - property facts (bedrooms, bathrooms, rooms, m², unit codes, availability, delivery dates, the tenant's place
 *   names and amenities) need this turn's inventory tool results or approved knowledge (EVP-192, see
 *   unsupportedFacts()). Here a returned description IS evidence: it is the listing itself, not a commercial promise.
 * Text is read after NFKC and without invisible characters, and a regex that fails is GUARD_ERROR (fails closed).
 */
final class OutputGuard
{
    private const USD = 'US\$|U\$S|U\$D|USD|u\$s|d[oó]lares?';

    private const ARS = 'ARS|\$|pesos?';

    private const SCALE = '(?:\s*(mil(?:lones|l[oó]n)?|k|M)\b)?';

    /**
     * Links require an exact tenant host from server configuration; payment data needs approved evidence.
     * Neither visitor input nor poisoned knowledge can authorize an external destination.
     * URL: scheme, www. or a bare domain on a common TLD. Payment: CBU/CVU (22 digits) or an alias (word.word.word).
     */
    private const LINK = '/(?:https?:\/\/|www\.)[^\s<>"\')\]]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|ar|io|app|ly|me|co|link|site|online|shop|store|xyz|info|top|click|page|biz)\b(?:[:\/?#][^\s<>"\')\]]*)?/iu';

    private const PAYMENT = '/\b(?:\d[ -]?){21}\d\b|\b[a-z][a-z0-9]+(?:\.[a-z][a-z0-9]+){2,}\b/iu';

    /** EVP-192: scarcity and demand ("la última unidad", "quedan pocas"): no tool returns stock, so only a source backs it. */
    private const SCARCITY = '/\b(?:[uú]ltim[oa]s?+\s++(?:\d++\s++)?+(?:unidad(?:es)?+|lotes?+|deptos?+|departamentos?+|casas?+|oportunidad(?:es)?+|disponibles?+|que\s++qued\p{L}++)|quedan?+\s++(?:muy\s++)?+poc[oa]s|poc[oa]s\s++(?:unidades|lotes|deptos|departamentos|casas|disponibles)|se\s++(?:est[aá]n?+\s++)?+vend(?:e|en|iendo)\s++(?:muy\s++)?+r[aá]pido|(?:alta|mucha)\s++demanda|[uú]nic[oa]\s++(?:unidad|lote|depto|departamento|casa)\s++(?:disponible|que\s++queda))\b/iu';

    private const CLAIMS = [
        '/(visita|cita|turno|recorrida)[^.!?\n]{0,40}(confirmad|agendad|reservad|coordinad|programad|fijad|pactad)/iu',
        '/(\bno\s+)?(agend|reserv|program|fij|pact)(o|amos|é|ada|ado)\b[^.!?\n]{0,40}(visita|cita|turno|recorrida|unidad|propiedad|lote|departamento|casa|\b(?:el|la)\s+\d)/iu',
        // "Te separo el 12A", "Separamos el 12A para vos", "Apartamos el lote 12A": a first-person hold with the unit as
        // its immediate object (never "guardé tu interés en el lote", a registration, nor "se guardan las propiedades").
        '/\b(?:(?:te|se)\s+)?(separ|apart|guard|bloque)(?:o|amos|é|e|ar[eé]|aremos)\s+(?:(?:el|la|los|las|ese|esa|este|esta)\s+)?(?:unidad|propiedad|lote|depto|departamento|casa|terreno|\d)/iu',
        // "Ya lo tenés reservado", "Tenés el 12A reservado hasta el viernes".
        '/\b(?:ten[eé]s|tenemos)\s+(?:\S+\s+){0,2}?(reservad|separad|apartad|guardad|bloquead)[oa]s?\b/iu',
        // EVP-196: "te confirmo que el 12A está disponible" or "información confirmada sobre los lotes" reports a fact
        // (checked by the fact guard); confirming commits only to a visit, a reservation or a purchase.
        '/(\bno\s+)?(confirm)(o|amos|é|ad[oa]s?)\b[^.!?\n]{0,40}(visita|cita|turno|recorrida|reserva|compra|se[ñn]a|operaci[oó]n|boleto)/iu',
        // "Te confirmo el lote 12A", "Confirmado el depto 12A": the unit as direct object (no "que") is a commitment.
        '/(\bno\s+)?(confirm)(o|amos|é|ad[oa]s?)\s+(?:(?:el|la|los|las|tu|su|ese|esa|este|esta|nuestro|nuestra)\s+)?(?:unidad|propiedad|lote|depto|departamento|casa|terreno|\d)/iu',
        // "¡Confirmado!": an exclamation is a commitment, whatever follows.
        '/(\bno\s+)?(confirm)(ad[oa]s?)\s*!/iu',
        // Holding a unit for the visitor: "te lo apartamos", "te lo dejo reservado", "quedó separado para vos", "ya
        // quedó a tu nombre", "ya es tuyo". A description ("la cocina está separada del living") holds nothing.
        '/\b((?:te|se)\s+l[oa]s?\s+(?:separ|apart|bloque|guard|reserv)\p{L}*|(?:te|se)\s+l[oa]s?\s+dej\p{L}*\s+(?:separad|apartad|bloquead|reservad)[oa]s?|(?:qued[oó]|queda)\s+(?:apartad|bloquead|reservad)[oa]s?|est[aá]\s+reservad[oa]s?\s+(?:para\s+(?:vos|usted|ti)|a\s+tu\s+nombre)|(?:separad|apartad|bloquead)[oa]s?\s+(?:para\s+(?:vos|usted|ti)|a\s+tu\s+nombre)|(?:qued[oó]|queda|est[aá]|lo\s+pongo|lo\s+dejo|lo\s+dejamos)\s+a\s+tu\s+nombre|(?:te|se)?\s*l[oa]s?\s+(?:tengo|tenemos|dejo|dejamos)\s+(?:separad|apartad|reservad|guardad|bloquead)[oa]s?|\bl[oa]s?\s+(?:separ|apart|reserv|bloque|guard)\p{L}*\s+para\s+(?:vos|usted|ti)|(?:qued[oó]|queda)\s+para\s+(?:vos|usted|ti)|ya\s+es\s+tuy[oa]s?|(?:lote|unidad|depto|departamento|casa|terreno|propiedad|\d+[a-z]{0,2})\s+(?:ya\s+)?es\s+tuy[oa]s?)\b/iu',
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
     * @param  list<array<string, mixed>>  $facts  properties returned by inventory tools this turn (EVP-192): code,
     *                                             bedrooms, bathrooms, area_m2, city, province, neighborhood, project,
     *                                             category, description; all of them are AVAILABLE
     * @param  bool  $inventoryChecked  an inventory tool answered this turn (items, an empty list or NOT_FOUND)
     * @param  list<string>  $locations  the tenant's own place names (server-scoped), so a location is recognized
     * @param  list<string>  $notFound  unit codes an inventory tool reported missing this turn
     * @param  list<string>  $serverTexts  other server texts whose numbers the model may repeat (business hours)
     * @param  string|null  $factsText  the part of $text the fact checks read (the contact summary without the
     *                                  visitor's own name, phone and email)
     * @param  list<string>  $allowedHosts  exact tenant domains from server configuration, never RAG or visitor input
     * @param  bool  $financingAllowed  the project authorizes quotes and installments from approved knowledge (EVP-200;
     *                                  no caller sets it until the per-project panel flag exists)
     * @return list<string> violation codes (empty = ok)
     */
    public function check(string $text, array $prices, array $knowledge, bool $visitRequested = false, bool $draft = false, bool $outOfHours = false, array $visitorMessages = [], array $requested = [], array $facts = [], bool $inventoryChecked = false, array $locations = [], array $notFound = [], array $serverTexts = [], ?string $factsText = null, array $allowedHosts = [], bool $financingAllowed = false): array
    {
        $text = $this->canonical($text, strict: true);
        $evidence = fn (string $item): string => mb_substr($this->canonical($item), 0, self::EVIDENCE_CHARS);
        $knowledge = array_map(fn (string $item): string => $evidence(KnowledgeSafety::evidence($item)), $knowledge);
        $requested = array_map($evidence, $requested);
        // EVP-200: the assistant never states a price, and quotes and installments only when the project authorizes
        // them ($financingAllowed, off until the panel flag exists). Tool prices never back an amount; approved
        // knowledge backs amounts and terms only when authorized. The visitor's own request ($requested, the
        // server-built contact summary) may still be repeated back to them.
        $commercial = $financingAllowed ? [...$knowledge, ...$requested] : $requested;
        $allowed = [];
        foreach ($commercial as $excerpt) {
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
        if (array_diff($this->terms($text), [...array_merge(...array_map($this->terms(...), $commercial)),
            ...$this->negatedEchoTerms($text, $visitorMessages)]) !== []) {
            $violations[] = 'UNSUPPORTED_TERM';
        }
        // EVP-200: a bare number in a price sentence ("el 12A sale 85.000", "1.200 el metro", "85 lucas") is an amount,
        // even without a currency; it passes only when the commercial evidence above has the same digits.
        $backed = array_map(fn (string $e): string => preg_replace('/\D++/', ' ', preg_replace('/(?<=\d)[.,](?=\d{3}\b)/', '', $e) ?? '') ?? '', $commercial);
        foreach ($this->priceNumbers($text) as $digits) {
            if (! in_array('UNSUPPORTED_AMOUNT', $violations, true)
                && array_filter($backed, fn (string $b): bool => in_array($digits, explode(' ', $b), true)) === []) {
                $violations[] = 'UNSUPPORTED_AMOUNT';
            }
        }
        // EVP-200: with quotes and installments not authorized, saying that there are installments, financing, a
        // discount or a cheaper unit informs about them too, numbers or not. Asking, lacking the data or handing it to
        // an advisor does not; the server-built contact summary ($requested) repeats the visitor's own request.
        if (! $financingAllowed && $requested === [] && ! in_array('UNSUPPORTED_TERM', $violations, true) && $this->financingClaim($text)) {
            $violations[] = 'UNSUPPORTED_TERM';
        }
        if ($this->unverifiedLinks($this->withoutVisitorEmails($text, $visitorMessages), $allowedHosts)) {
            $violations[] = 'UNVERIFIED_LINK';
        }
        if ($this->unsupported(self::PAYMENT, $text, $knowledge)) {
            $violations[] = 'PAYMENT_DATA';
        }
        // EVP-200: stock and demand are availability claims, never stated even when a source says so.
        if ($this->ok(preg_match(self::SCARCITY, $text)) === 1) {
            $violations[] = 'UNSUPPORTED_AVAILABILITY';
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
        array_push($violations, ...$this->unsupportedFacts($factsText === null ? $text : $this->canonical($factsText, strict: true), $facts,
            $inventoryChecked, $notFound, $locations, [...$knowledge, ...$requested], $visitorMessages, [...array_column($prices, 'amount'), ...$serverTexts], $requested !== []));
        if ($this->broken) {
            $violations[] = 'GUARD_ERROR';
        }
        $this->broken = false;

        return array_values(array_unique($violations));
    }

    /**
     * EVP-200: digits of every number that reads as a price in a sentence with a price word: 4 to 8 digits or with
     * thousands separators, or followed by a scale ("85 mil", "85 lucas"). Years, phones (runs next to '-' or longer
     * than 8 digits), surfaces and other units stay out. ponytail: lexical; "Sí, ese es el precio" relies on evals.
     *
     * @return list<string>
     */
    private function priceNumbers(string $text): array
    {
        $found = [];
        foreach (preg_split('/(?<=[.!?;\n])\s++/u', $text) ?: [] as $sentence) {
            if ($this->ok(preg_match('/\b(?:precios?|valor(?:es)?+|sale|salen|cuesta|cuestan|vale|valen|arranca|arrancan|desde|lista|contado|presupuesto|lucas|verdes|palos|euros?|cotizaci[oó]n|cotiza)\b|€|\bel\s++metro\b|\bpor\s++(?:m2|m²|metro)/iu', $sentence)) !== 1) {
                continue;
            }
            foreach ($this->matches('/(?<![\p{N}\-\/.,])(\d{1,3}(?:[.,]\d{3})++|\d{4,8}|\d++(?=\s*+(?:mil|lucas|palos|k)\b))(?![\p{N}\-\/]|[.,]\d)(?!\s*+(?:m2|m²|metros|mts|ha\b|hect|km|a[ñn]os?\b|cuot|%|hs\b|horas?\b|dorm|amb|ba[ñn]))/iu', $sentence) as $m) {
                $digits = preg_replace('/\D++/', '', (string) $m[1][0]) ?? '';
                if (preg_match('/^(?:19|20)\d\d$/', $digits) !== 1) {
                    $found[] = $digits;
                }
            }
        }

        return array_values(array_unique($found));
    }

    /** EVP-200: an affirmative sentence about installments, financing, discounts or a cheaper unit (see check()). */
    private function financingClaim(string $text): bool
    {
        foreach (preg_split('/(?<=[.!?;:\n])\s++/u', $text) ?: [] as $sentence) {
            if ($this->ok(preg_match('/\b(?:cuot\p{L}*+|financ\p{L}*+|anticipo|descuentos?|bonificaci\p{L}*+|promo\p{L}*+|planes?\s++de\s++pago|m[aá]s\s++barat\p{L}*+|econ[oó]mic\p{L}*+|accesibles?|tu\s++presupuesto|precio\s++especial|ofertas?)\b/iu', $sentence)) === 1
                && ($this->ok(preg_match('/¿|\?\s*+$|\basesor|\bno\s++(?:te\s++)?(?:tengo|tenemos|puedo|podemos|cuento|contamos|s[eé])\b|\bsin\s++(?:datos|informaci[oó]n)\b/iu', $sentence)) !== 1
                    // "Hay financiación propia, un asesor te detalla": handing it over does not undo stating it exists.
                    || $this->ok(preg_match('/\b(?:hay|tenemos|ofrecemos|contamos\s++con|cuenta\s++con|tiene|tienen|se\s++puede|se\s++pueden|pod[eé]s|aceptamos|incluye|incluyen|existe|existen|est[aá]\s++(?:en\s++)?+(?:promo|oferta))\b(?![^.!?\n]{0,30}?\b(?:asesor|pregunt|consult))/iu', $sentence)) === 1)) {
                return true;
            }
        }

        return false;
    }

    /** @param list<string> $allowedHosts Exact hosts resolved by the server for this tenant. */
    private function unverifiedLinks(string $text, array $allowedHosts): bool
    {
        $this->ok(preg_match_all(self::LINK, $text, $matches));
        foreach ($matches[0] as $link) {
            $link = rtrim($link, '.,;:!?');
            $url = parse_url(str_contains($link, '://') ? $link : 'https://'.$link);
            if ($url === false || ! in_array(strtolower($url['host'] ?? ''), $allowedHosts, true)
                || ($url['scheme'] ?? '') !== 'https' || isset($url['user']) || isset($url['pass'])
                || isset($url['port']) || isset($url['query']) || isset($url['fragment'])
                || preg_match('/[%{}\\\\]|collect/i', $link) !== 0) {
                return true;
            }
        }

        return false;
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
        // EVP-192 review: a mark left on a letter ("dormi̇torios" with U+0307) or a Latin letter outside Western
        // European accented forms ("ı", small capitals, "ɑ") hides a word from the fact patterns: fail closed.
        if ($strict && $this->ok(preg_match('/(?!\x{FE0F})\p{Mn}|(?![A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}])\p{Latin}/u', $nfkc)) === 1) {
            $this->broken = true;
        }
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
     * EVP-196: the visitor's own terms that the reply only denies or lacks ("no tengo información confirmada respecto
     * a una financiación en 60 cuotas" after "¿se puede en 60 cuotas?"). The clause runs from the negation to the
     * next punctuation, contrast, exception or conjunction ("no ofrecemos financiación salvo en 60 cuotas" denies
     * nothing about the 60), and every term in it must be the visitor's. Terms are still read on the whole reply, so
     * a denied clause never hides the financing context of the next sentence.
     *
     * @param  list<string>  $visitorMessages
     * @return list<string>
     */
    private function negatedEchoTerms(string $text, array $visitorMessages): array
    {
        $asked = array_merge(...array_map(fn (string $m): array => $this->terms($this->canonical($m)), $visitorMessages));
        $denied = [];
        $rest = $text; // the reply without the denied clauses
        // Only a lack of data ("no tengo información…", "no puedo confirmarte…"); "no ofrecemos 60 cuotas" is itself a claim.
        foreach ($asked === [] ? [] : $this->matches('/\bno\s++(?:(?:tengo|tenemos|cuento\s++con|contamos\s++con|dispongo\s++de|disponemos\s++de)\s++(?:informaci[oó]n|info|datos?+|el\s++dato|confirmaci[oó]n)|(?:te\s++)?+puedo\s++confirmar(?:te|le)?+)(?:[^.!?\n,;:](?!\b(?:pero|aunque|sino|igual|mientras|salvo|excepto|menos|m[aá]s|hasta|solo|s[oó]lo|[uú]nicamente|y|e|porque|ya)\b))*+[^.!?\n,;:]?/iu', $text) as $m) {
            $clause = (string) $m[0][0];
            $terms = $this->terms($clause);
            // Not a lack of data when it excludes ("no te puedo confirmar otra opción que las 60 cuotas") or the reply
            // goes on to grant it anywhere ("…en dólares. En pesos, sí", "…, solo en pesos").
            $then = substr($text, (int) $m[0][1] + strlen($clause));
            if ($terms !== [] && array_diff($terms, $asked) === []
                // The clause is the whole sentence ("…60 cuotas para el 12B, para el 14 está ok" is not).
                && $this->ok(preg_match('/^\s*+(?:[.!?\n]|$)/u', $then)) === 1
                && $this->ok(preg_match('/\bque\b|\bno\b.*\bno\b|\b(?:otr[oa]s?|salvo|excepto|aparte|fuera|distint\p{L}*|diferente\p{L}*|m[aá]s\s++all[aá])\b/isu', $clause)) !== 1
                // Nothing after it grants the terms: "en pesos, sí", "en pesos se puede", "pero sí en 36", "solo en
                // pesos". A conditional "si querés" or "pero un asesor te ayuda" grants nothing.
                && $this->ok(preg_match('/\bs[íi](?=\s*+(?:[,.!;]|$))|\bsí\b|\bse\s++puede\b|\best[aá]\s++(?:ok|bien)\b|\b(?:en|para)\s++(?:pesos|d[oó]lares)\b|\b(?:pero|sino|solo|s[oó]lo|[uú]nicamente|en\s++cambio)\b(?=[^.!?\n]{0,30}?(?:\bs[íi]\b|\d|cuot|financ|plan|anticipo|pesos|d[oó]lares|usd|ars))/iu', $then)) !== 1) {
                array_push($denied, ...$terms);
                $rest = substr_replace($rest, str_repeat(' ', strlen($clause)), (int) $m[0][1], strlen($clause));
            }
        }

        // Exempt by occurrence, not by value: the same term affirmed elsewhere ("El plan vigente es en 60 cuotas") stays.
        return array_values(array_diff($denied, $this->terms($rest)));
    }

    /**
     * EVP-113: commercial terms as normalized "number|kind" pairs.
     *
     * @return list<string>
     */
    private function terms(string $text): array
    {
        return $this->termsAndOffsets($text)[0];
    }

    /**
     * @return array{0: list<string>, 1: list<array{0: int, 1: int}>}
     */
    private function termsAndOffsets(string $text, bool $raw = false, bool $carryFinancing = false): array
    {
        if (! $raw) {
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
        }
        $n = self::NUMBERS;
        $found = [];
        $spans = [];
        if ($this->ok(preg_match('/\bsin\s++(?:inter[eé]s(?:es)?+|recargos?+|costo\s++financiero)\b|\btasa\s++(?:de\s++)?+cero\b|\binter[eé]s(?:es)?+\s++cero\b|\b(?:no\s++tienen?+|libres?+\s++de)\s++inter[eé]s/iu', $text)) === 1) {
            $found[] = '0|tasa';
        }
        if ($this->ok(preg_match('/\bsin\s++(?:anticipo|entrega|se[ñn]a)\b|\bno\s++(?:hace\s++falta|requiere|lleva)\s++(?:un\s++|el\s++)?+anticipo\b/iu', $text)) === 1) {
            $found[] = '0|anticipo';
        }
        $add = function (?string $numbers, string $kind, ?string $unit = null, ?int $offset = null) use (&$found, &$spans): void {
            if ($numbers !== null && $offset !== null) {
                $spans[] = [$offset, strlen($numbers)];
            }
            preg_match_all('/\d++(?:[.,]\d++)?+/', (string) $numbers, $digits);
            foreach ($digits[0] as $digit) {
                $found[] = ((float) str_replace(',', '.', $digit) * ($unit !== null && stripos($unit, 'a') === 0 ? 12 : 1)).'|'.$kind;
            }
        };

        $cuotas = self::INSTALLMENTS;
        foreach ($this->matches('/'.$n.self::FILLER.'\s*+\p{Pd}?+\s*+'.$cuotas.'\b/iu', $text) as $m) {
            $add($m[1][0], 'cuotas', offset: $m[1][1]);
        }
        foreach ($this->matches('/\ben\s++'.$n.'\s*+veces\b|(?<![\p{L}\p{N}])x\s*+(\d++)\b/iu', $text) as $m) {
            $cap = $m[1][0] !== null ? $m[1] : $m[2];
            $add($cap[0], 'cuotas', offset: $cap[1]); // "en 36 veces", "x36"
        }
        foreach ($this->matches('/\b'.$cuotas.'\b(?:\s++(?:sin\s++inter[eé]s(?:es)?+|fijas?+|mensuales|iguales))?+\s*+(?::|\bde\b|\bhasta\b|,?+\s*+\bo\s++(?:en\s++|de\s++)?+|\by\s++(?:en|de)\s++)\s*+(?:hasta\s++)?+'.$n.self::NOT_A_COUNT.'/iu', $text) as $m) {
            $add($m[1][0], 'cuotas', offset: $m[1][1]);
        }
        foreach ($this->matches('/\b(anticipo|entrega|se[ñn]a|descuento|bonificaci[oó]n)\s*+(?::|\bdel?\b|\bhasta\b)?+\s*+(?:hasta\s++)?+(?:(?:el|un|una)\s++)?+'.$n.self::NOT_A_COUNT.'/iu', $text) as $m) {
            $add($m[2][0], $this->percentKind((string) $m[1][0], ''), offset: $m[2][1]);
        }
        foreach ($this->matches('/'.$n.'\s*+(?:del?\s++)?+(?:anticipo|se[ñn]a)\b/iu', $text) as $m) {
            $add($m[1][0], 'anticipo', offset: $m[1][1]);
        }
        foreach ($this->matches('/'.$n.'\s*+%/u', $text) as $m) {
            // Bounded windows (whole characters): the keyword is next to the percentage, so no scan of the whole text.
            $before = mb_strcut(substr($text, 0, $m[0][1]), max(0, $m[0][1] - 400));
            $after = mb_strcut(substr($text, $m[0][1] + strlen((string) $m[0][0])), 0, 400);
            $kind = $this->percentKind($after, $before);
            // A percentage with no kind is a term only in a sentence about financing ("70 % de avance" is not).
            $sentence = last(preg_split('/[.!?;\n]/u', $before) ?: ['']).$m[0][0].(preg_split('/[.!?;\n]/u', $after) ?: [''])[0];
            if ($kind !== '%' || $this->ok(preg_match(self::FINANCING, $sentence)) !== 0) {
                $add($m[1][0], $kind, offset: $m[1][1]);
            }
        }
        foreach ($this->matches('/\b'.self::RATE.'(?:\s++(?:anual|nominal|efectiva|mensual|fij[ao]|del?|es|un|una)\b)*+\s*+:?+\s*+(\d++(?:[.,]\d++)?+)/iu', $text) as $m) {
            $add($m[1][0], 'tasa', offset: $m[1][1]);
        }
        foreach ($this->matches('/'.$n.'\s*+%?+\s*+(?:de\s++)?+'.self::RATE.'\b/iu', $text) as $m) {
            $add($m[1][0], 'tasa', offset: $m[1][1]);
        }

        // Periods: a sentence about financing or payment, or the one right after it ("12 cuotas. Después, 60 meses más").
        $sentences = $raw ? [$text] : ($this->ok(preg_split('/(?<=[.!?;])\s+|\n+/u', $text)) ?: []);
        $periodsParts = [];
        $periodOffsets = [];
        $cursor = 0;
        foreach ($sentences as $i => $sentence) {
            $pos = $raw ? 0 : (strpos($text, $sentence, $cursor) ?: $cursor);
            $cursor = $pos + strlen($sentence);
            $financing = fn (int $j): bool => $this->ok(preg_match(self::FINANCING, $sentences[$j])) !== 0;
            // The previous sentence carries over, unless this one is about the works or handing over a unit.
            $carries = ($i > 0 && $financing($i - 1)) || ($raw && $carryFinancing);
            if ($financing($i) || ($carries && $this->ok(preg_match('/\bobra\b|\bse\s+entrega|\bposesi[oó]n\b/iu', $sentence)) === 0)) {
                $periodsParts[] = [$sentence, $pos];
            }
        }
        foreach ($periodsParts as [$part, $baseOffset]) {
            foreach ($this->matches('/'.$n.'\s*+(mes(?:es)?+|años?+)\b/iu', $part) as $m) {
                // "tiene 5 años", "antigüedad de 5 años" are an age, not a period.
                if (stripos((string) $m[2][0], 'a') !== 0 || preg_match('/(?:\btiene|antig[uü]edad(?:\s+de)?)\s*+$/iu', mb_strcut(substr($part, 0, $m[0][1]), max(0, $m[0][1] - 40))) !== 1) {
                    $add($m[1][0], 'meses', $m[2][0], $baseOffset + $m[1][1]);
                }
            }
            foreach ($this->matches('/'.$n.'\s*+veces\b/iu', $part) as $m) {
                $add($m[1][0], 'cuotas', offset: $baseOffset + $m[1][1]); // "Pagalo 36 veces"
            }
            foreach ($this->matches('/\bplazo(?:\s++(?:m[aá]ximo|total))?+\s*+(?::|\bde\b|\bhasta\b)\s*+(?:hasta\s++)?+'.$n.'\s*+(mes(?:es)?+|años?+)?+/iu', $part) as $m) {
                $add($m[1][0], 'meses', $m[2][0], $baseOffset + $m[1][1]);
            }
            // "saldo a 48", "resto en 48", "financiamos 48": a bare number after financing words is a period.
            foreach ($this->matches('/\b(?:saldo|resto|financi\p{L}*+)\s++(?:(?:a|en|hasta)\s++)?+'.$n.self::NOT_A_COUNT.'(?!\s*+'.self::INSTALLMENTS.')/iu', $part) as $m) {
                $add($m[1][0], 'meses', offset: $baseOffset + $m[1][1]);
            }
        }

        return [array_values(array_unique($found)), $spans];
    }

    /*
     * EVP-192: property facts. unsupportedFacts() and its helpers.
     */

    /**
     * The only frames where the visitor's own words may come back without evidence (besides a "¿…?" question):
     * "No encontré lotes en Yala", "No tengo confirmado si tiene pileta", "¿Buscás en Yala?" / "Busco opciones en Yala".
     * A negation elsewhere in the sentence ("No te preocupes, tiene pileta") is not one of them.
     */
    private const ECHO_FRAME = '/\bno\s++(?:encontr\p{L}*+|hay(?!\s++(?:[\p{L}]++\s++){0,2}?(?:problema|drama|inconveniente|duda|apuro|cuidado)\b)|(?:tengo|tenemos)(?!\s++(?:[\p{L}]++\s++){0,2}?(?:dudas?|problema|drama|inconveniente|apuro)\b)|figura\p{L}*+|cuento|contamos|aparece\p{L}*+|veo|dispongo|s[eé](?!\s++(?:[\p{L}]++\s++){0,1}?si\b)|lo\s++tengo|est[aá]\s++confirmad\p{L}*+)\b|\bsin\s++(?:datos?|informaci[oó]n|confirmar)\b|\b(?:busco|buscamos|busc[aá]s|busque(?:mos)?+|necesit[aá]s|prefer[ií]s)\b/iu';

    /**
     * A sentence about handing over or finishing a unit: there a month, a period or a relative date is a delivery date.
     * "El 30 % de entrega" is a down payment (terms()), and "novedades de la obra" is not a date.
     */
    private const DELIVERY = '/\bse\s++entreg|\bentrega(?:mos|n)?+\s++(?:(?:es|ser[aá])\s++)?+(?:en|para|a\s++partir|prevista|estimada|inmediata|el|la|de\s++(?:la\s++)?+(?:obra|unidad|llaves|posesi)|(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b|(?:19|20)\d\d\b)|\bfecha\s++de\s++entrega|\bposesi[oó]n|\bobra\s++(?:se\s++)?+(?:termin|entreg|finaliz|estar|va\s++a\s++estar|estimad)|\bfin(?:al)?+\s++de\s++(?:la\s++)?+obra|\bfinaliz|\btermin(?:a|an|ar[aá]n?+|ad[oa]s?+|aci[oó]n|[oó])\b|\binaugur|\bllaves\b|\bestar[aá]\s++list[oa]|\blist[oa]s?+\s++(?:para|en\b)|\bva\s++a\s++estar\s++list|\bse\s++complet|\bculmin|\bmud(?:arte|arse|arnos|anza)\b|\bhabitar\b|\bocupar\b/iu';

    private const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

    /** On folded text: "mar-27", "en el '27"-style months, quarters, seasons and relative dates ("el año que viene"). */
    private const WHEN = '(?:'.self::MONTHS.')|(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[-\/ .\']?+\d{2}\b|\'\d{2}\b|verano|otono|invierno|primavera|ano\s++que\s++viene|proximo\s++ano|fin(?:es|al)?+\s++de(?:l)?+\s++ano|principios\s++de|mediados\s++de|\bq[1-4]\b|(?:primer|segundo|tercer|cuarto|1er|2do|3er|4to|1°|2°|3°|4°)\s++(?:trimestre|semestre)';

    /** Counts and surfaces after a number ("3 dormitorios", "3 amb", "120 m²" -> NFKC "m2", "300 mts", "2 hectáreas"). */
    private const KINDS = [
        'dorm' => 'dormitorios?+|dormis?+\b|dorms?+\b\.?+|habitaci(?:o|ó)n(?:es)?+|hab\b\.?+|cuartos?+|piezas?+|rec[aá]maras?+',
        'bano' => 'ba[ñn]os?+\b|toilettes?+',
        'amb' => 'ambientes?+|amb\b\.?+',
        'm2' => 'm2\b|m\s*+\^\s*+2|mts?+\.?+\s*+2\b|metros?+\s++cuadrados|metros?+2\b|mts?+\b\.?+|metros\b(?!\s++(?:de|del|hasta|desde)\b)|hect[aá]reas?+|ha\b',
    ];

    /** The same kinds as a label before the number ("Dormitorios: 3", "Superficie (m2): 120", "Dormitorios → 3"). */
    private const LABELS = [
        'dorm' => 'dormitorios?+|dorm\.|habitaciones',
        'bano' => 'ba[ñn]os?+',
        'amb' => 'ambientes|amb\.',
        'm2' => '(?:superficie|sup\.)(?:\s++(?:total|cubierta|semicubierta|construida|del\s++(?:lote|terreno)))?+(?:\s*+\(\s*+m2\s*+\))?+|m2|metros\s++cuadrados',
    ];

    /** A number after a unit noun that is a count, a surface, a period or a time, never a unit code. */
    private const NOT_A_CODE = '(?!\s*+(?:dorm|ba[ñn]|amb|m2\b|metros|mts|habit|hab\b|pieza|cuarto|hect|ha\b|%|cuot|ctas|mes|años?\b|semana|d[ií]as?\b|plantas?\b|x\s*+\d|hs\b|horas?\b|usd|us\$|pesos|d[oó]lares|mil\b|k\b))';

    private const CODE = '[a-z]{0,3}-?+\d[a-z0-9\-\/]{0,15}';

    private const UNIT_NOUN = '(?:unidad(?:es)?+|deptos?+\.?+|departamentos?+|dptos?+\.?+|lotes?+|local(?:es)?+|cocheras?+|oficinas?+|casas?+|d[uú]plex|c[oó]digos?+|terrenos?+|parcelas?+|ph\b|galp[oó]n(?:es)?+|box(?:es)?+|torres?+|mz\.?+|manzanas?+)';

    /** "ambos tienen 3 dormitorios" (or "las 2 unidades tienen..." after wordsToDigits) claims the value for every unit. */
    private const EVERY = '/\b(?:ambos|ambas|los\s++dos|las\s++dos|todos|todas|cada\s++un[oa]|(?:los|las)\s++\d++(?:\s++(?:unidades|lotes|deptos?+|departamentos|dptos?+|casas))?+\s++(?:tienen|son|cuentan|est[aá]n|quedan|ofrecen|incluyen|miden|poseen|disponen|presentan|comparten))\b/iu';

    /** Catalogue labels too generic to read as a place ("cerca del centro"). */
    private const GENERIC_PLACES = ['centro', 'norte', 'sur', 'este', 'oeste', 'zona', 'otro', 'otros', 'otra', 'varios', 'general', 'sin dato', 'sin datos', 'sin localidad'];

    /**
     * Amenities and features on folded text (lower case, no accents), each group with its forms (diminutives and common
     * synonyms included). A form of one group never backs another: "cochera" does not back "pileta".
     * ponytail: a closed list; a feature outside it ("helipuerto") passes on the prompt alone. Upgrade path: grow the
     * list from production traces and the tenant's own listing vocabulary.
     */
    private const AMENITIES = [
        'pileta' => 'pilet(?:a|ita)s?+|piscinas?+|natatorios?+',
        'spa' => 'saunas?+|spa|jacuzzis?+|hidromasajes?+',
        'gimnasio' => 'gimnasios?+|gym|fitness',
        'cochera' => 'cocher(?:a|ita)s?+|garages?+|garajes?+|estacionamientos?+|parking|lugar\s++para\s++(?:el|tu|un)\s++auto',
        'quincho' => 'quinch(?:o|ito)s?+',
        'sum' => 's\.?u\.?m\.?|salon\s++de\s++usos\s++multiples',
        'parrilla' => 'parrill(?:a|ita)s?+|parrilleros?+|asadores?+|fogoneros?+|horno\s++de\s++barro',
        'balcon' => 'balcon(?:es|cito)?+',
        'terraza' => 'terraz(?:a|ita)s?+',
        'patio' => 'patio(?:s|cito)?+|patiecito',
        'jardin' => 'jardin(?:es|cito)?+',
        'ascensor' => 'ascensor(?:es)?+',
        'seguridad' => 'seguridad\s++(?:24|privada|perimetral|las\s++24)|vigilancia|porteria|portero|barrio\s++(?:cerrado|privado)|country|garita|camaras\s++de\s++seguridad',
        'lavadero' => 'laundry|lavaderos?+',
        'solarium' => 'solarium',
        'cowork' => 'co-?working|cowork',
        'aire' => 'aire\s++acondicionado|splits?+|a\/a',
        'calefaccion' => 'calefaccion|losa\s++radiante|estufas?+|hogar\s++a\s++lena',
        'amoblado' => 'amoblad[oa]s?+|amueblad[oa]s?+',
        'baulera' => 'bauleras?+',
        'vestidor' => 'vestidor(?:es)?+',
        'juegos' => 'playroom|juegos\s++infantiles|plaza\s++de\s++juegos',
        'canchas' => 'canchas?+|tenis|padel',
        'clubhouse' => 'club\s*+house',
        'servicios' => 'cloacas?+|asfalto|todos\s++los\s++servicios',
        'gas' => 'gas\s++natural|\bgas\b|todos\s++los\s++servicios',
        'agua' => 'agua\s++corriente|red\s++de\s++agua|(?<!vista\sal\s)\bagua\b|todos\s++los\s++servicios',
        'luz' => 'luz\s++electrica|\bluz\b(?!\s++natural)|todos\s++los\s++servicios',
        'legal' => 'escritura\s++(?:inmediata|lista|al\s++dia|en\s++mano|individual)|(?:con|tiene)\s++escritura|escriturad[oa]s?+|apto\s++(?:credito|profesional|mascotas)',
    ];

    /**
     * EVP-192: property facts in the reply that this turn's evidence does not back, one code per kind.
     *
     * Evidence per unit: what the inventory tools returned THIS turn for that unit (structured fields first: a field
     * that exists overrides any listing or source; then its own listing text, place and category) plus approved
     * knowledge (and, in the contact summary, the visitor's request). A sentence about a unit reads only that unit's
     * evidence; the unit carries over to the next lines until another one is named (lists, "Unidad 12B:\n- 3 dorm").
     *
     * - UNSUPPORTED_FACT: any number that is not in the evidence (a whitelist, so "Tiene 3." or "y el 12B, 3" fail too).
     *   Counts and surfaces are typed (bedrooms, bathrooms, rooms, m²); a bare number takes the kind the sentence or
     *   the visitor's last question is about. Amounts and commercial terms are left to money() and terms(), years and
     *   delivery periods to the date check;
     * - UNSUPPORTED_UNIT: a unit code nobody returned, named or wrote in a source;
     * - UNSUPPORTED_AVAILABILITY: "disponible" for a unit not returned this turn; "vendida" for one not reported missing;
     * - UNSUPPORTED_DATE, UNSUPPORTED_LOCATION, UNSUPPORTED_AMENITY: delivery dates, the tenant's places and the
     *   amenities above, against the unit's evidence.
     *
     * The visitor's words back a fact only inside a "¿…?" question or an ECHO_FRAME. Questions are never availability
     * claims.
     * ponytail: lexical; qualitative claims ("muy luminoso"), places outside the tenant's catalogue and features outside
     * AMENITIES pass on the prompt alone. The safety net is the evaluation with the real model (Q01) and starting with
     * the copilot (go-live F2 5b).
     *
     * @param  list<array<string, mixed>>  $facts
     * @param  list<string>  $notFound  unit codes an inventory tool reported missing this turn (lower case)
     * @param  list<string>  $locations
     * @param  list<string>  $evidence  canonical approved knowledge and requested text
     * @param  list<string>  $visitorMessages
     * @param  list<string>  $allowed  numbers the server put in front of the model (prices, business hours)
     * @return list<string>
     */
    private function unsupportedFacts(string $text, array $facts, bool $inventoryChecked, array $notFound, array $locations, array $evidence, array $visitorMessages, array $allowed, bool $requestedAmounts = false): array
    {
        $records = [];
        foreach ($facts as $f) {
            $listing = implode("\n", array_filter([$f['description'] ?? null, $f['city'] ?? null, $f['province'] ?? null, $f['neighborhood'] ?? null,
                $f['project'] ?? null, ($f['category'] ?? null) === 'GARAGE' ? 'cochera' : null], fn (mixed $v): bool => is_string($v) && $v !== ''));
            $code = mb_strtolower(trim((string) ($f['code'] ?? '')));
            $records[] = [
                'code' => $code,
                'codeFold' => $this->fold($code),
                'price' => $f['price'] ?? null,
                'project' => trim($this->fold((string) ($f['project'] ?? ''))),
                'available' => ! ($f['summary_only'] ?? false),
                'fields' => array_map(fn (string $field): ?string => isset($f[$field]) && is_numeric($f[$field]) ? $this->numberValue((string) $f[$field]) : null,
                    ['dorm' => 'bedrooms', 'bano' => 'bathrooms', 'm2' => 'area_m2']),
                'listing' => mb_substr($this->canonical($listing), 0, self::EVIDENCE_CHARS),
            ];
        }
        $codes = array_values(array_unique(array_filter(array_column($records, 'code'))));
        $available = array_values(array_unique(array_filter(array_map(fn (array $r): string => $r['available'] ? $r['code'] : '', $records))));
        $availableCount = count(array_filter($records, fn (array $r): bool => $r['available']));
        $notFound = array_values(array_unique(array_map(fn (string $c): string => mb_strtolower(trim($c)), $notFound)));
        $knowledgeItems = array_values(array_filter(array_map(fn (string $e): string => mb_substr($e, 0, self::EVIDENCE_CHARS), $evidence),
            fn (string $e): bool => $e !== ''));
        $knowledgeItemsFold = array_map($this->fold(...), $knowledgeItems);
        $visitor = mb_substr($this->canonical(implode("\n", $visitorMessages)), 0, self::EVIDENCE_CHARS);
        $visitorRead = $this->factsReading($visitor);
        $visitorFold = $this->fold($visitor);
        $visitorTyped = $this->typedPairs($visitorRead);
        $visitorNumbers = $this->numberTokens($visitorRead);
        $visitorCodes = array_column($this->unitMentions($visitorRead), 0);
        $lastVisitorRead = $this->factsReading($this->canonical((string) (end($visitorMessages) ?: '')));
        $lastVisitorCodes = array_column($this->unitMentions($lastVisitorRead), 0);
        foreach ([...$codes, ...$notFound] as $c) {
            if ($this->hasWord($lastVisitorRead, $c)) {
                $lastVisitorCodes[] = $c;
            }
        }
        $lastVisitorCodes = array_values(array_unique($lastVisitorCodes));
        $asked = $this->askedKindFromMessages(array_slice($visitorMessages, -3));
        $base = [...$visitorNumbers, ...$this->numberTokens(implode("\n", $allowed)), (string) count($facts)];
        $digitRuns = function (string $src): array {
            $runs = [];
            foreach ($this->matches('/(?<![\p{L}\p{N}])\d(?:[ \-.\/]?+\d)++(?![\p{L}\p{N}])/u', $src) as $m) {
                $d = (string) preg_replace('/\D/', '', (string) $m[0][0]);
                if (strlen($d) >= 8) {
                    $runs[] = $d;
                }
            }

            return $runs;
        };
        $baseDigitRuns = $digitRuns($visitor."\n".implode("\n", $allowed));
        $places = array_values(array_diff(array_unique(array_filter(array_map(fn (string $l): string => trim($this->fold($l)), $locations),
            fn (string $l): bool => mb_strlen($l) >= 4)), self::GENERIC_PLACES));

        // Evidence for a set of units (null = every returned unit), computed once per set.
        $cache = [];
        $proof = function (?array $units) use (&$cache, $records, $knowledgeItems, $knowledgeItemsFold, $digitRuns): array {
            $key = $units === null ? '*' : implode('|', $units);
            if (! isset($cache[$key])) {
                $mine = array_values(array_filter($records, fn (array $r): bool => $units === null || in_array($r['code'], $units, true)));
                $scopedKnowledge = $units === null ? $knowledgeItems : array_values(array_filter($knowledgeItems, function (int $i) use ($mine, $knowledgeItemsFold): bool {
                    $itemFold = $knowledgeItemsFold[$i];
                    foreach ($mine as $r) {
                        if ($this->hasWord($itemFold, $r['codeFold']) || ($r['project'] !== '' && $this->hasWord($itemFold, $r['project']))) {
                            return true;
                        }
                    }

                    return false;
                }, ARRAY_FILTER_USE_KEY));
                $knowledge = implode("\n", $scopedKnowledge);
                $raw = implode("\n", [$knowledge, ...array_column($mine, 'listing')]);
                $read = $this->factsReading($raw);
                $delivery = implode("\n", array_filter($this->ok(preg_split('/(?<=[.!?;])\s++|\n++/u', $raw)) ?: [],
                    fn (string $s): bool => $this->ok(preg_match(self::DELIVERY, $s)) === 1));
                $cache[$key] = [
                    'records' => $mine, 'raw' => $raw, 'fold' => $this->fold($raw), 'numbers' => $this->numberTokens($read),
                    'digitRuns' => $digitRuns($raw),
                    'knowledgeTyped' => $this->typedPairs($this->factsReading($knowledge)),
                    'listingTyped' => array_map(fn (array $r): array => $this->typedPairs($this->factsReading($r['listing'])), $mine),
                    'codes' => array_column($this->unitMentions($read), 0),
                    'delivery' => $delivery, 'deliveryFold' => $this->fold($delivery), 'periods' => $this->periods($this->factsReading($delivery)),
                ];
            }

            return $cache[$key];
        };

        $found = [];
        $current = [];
        $financing = false; // the previous segment was about financing ("12 cuotas. Después, 60 meses más")
        $prev = ['claims' => [], 'availability' => [], 'places' => [], 'amenities' => []];
        $checkAvailability = function (array $availabilities, array $about) use (&$found, $available, $notFound, $availableCount, $inventoryChecked): void {
            foreach ($availabilities as $availability) {
                // EVP-200: the assistant never confirms that a unit is available, even one a tool just returned.
                if ($availability === 'POSITIVE'
                    || ($availability === 'NEGATIVE' && ($about !== []
                        ? array_diff($about, $notFound) !== [] || array_intersect($about, $available) !== []
                        : $notFound === [] && ! ($inventoryChecked && $availableCount === 0)))) {
                    $found['UNSUPPORTED_AVAILABILITY'] = true;
                }
            }
        };
        foreach ($this->segments($this->factsReading($text)) as $segment) {
            $wasFinancing = $financing;
            $financing = $this->ok(preg_match(self::FINANCING, $segment)) === 1;
            $question = $this->ok(preg_match('/¿|\?\s*+$/u', $segment)) === 1;
            $echoStart = null;
            $echoEnd = null;
            if ($question) {
                $echoStart = 0;
                $echoEnd = strlen($segment);
            } else {
                foreach ($this->matches(self::ECHO_FRAME, $segment) as $em) {
                    $candidateStart = (int) $em[0][1];
                    $beforeEcho = mb_strcut(substr($segment, 0, $candidateStart), max(0, $candidateStart - 48));
                    if ($this->ok(preg_match('/\bsi\s++(?:[\p{L}]++\s++){0,4}$/iu', $beforeEcho)) === 1) {
                        continue;
                    }
                    $echoStart = $candidateStart;
                    $echoEnd = $this->ok(preg_match('/[,;:]|\b(?:pero|aunque|sino|porque|ya\s++que|as[ií]\s++que|por\s++eso|adem[aá]s)\b|\by\s++(?:adem[aá]s|tiene|queda|es|est[aá]|son|cuentan?|ofrecen?|salen?|cuestan?|valen?|(?:el|la|los|las)\s++(?:\d|unidad|lote|depto|departamento|casa))\b/iu', $segment, $endM, PREG_OFFSET_CAPTURE, $echoStart)) === 1
                        ? (int) $endM[0][1] : strlen($segment);
                    break;
                }
            }
            $echoAt = static fn (int $pos): bool => $echoStart !== null && $pos >= $echoStart && $pos < $echoEnd;
            $fold = $this->fold($segment);
            $nonEchoFold = $echoStart === null ? $fold : $this->fold(substr($segment, 0, $echoStart).' '.substr($segment, $echoEnd));
            $delivers = $this->ok(preg_match(self::DELIVERY, $segment)) === 1;
            $mentions = $this->unitMentions($segment);
            foreach ($codes as $code) {
                $numeric = preg_match('/^\d++$/', $code) === 1;
                foreach ($this->wordOffsets($segment, $code) as $offset) {
                    if ($numeric) {
                        $beforeCode = mb_strcut(substr($segment, 0, $offset), max(0, $offset - 32));
                        $afterCode = mb_strcut($segment, $offset + strlen($code), 32);
                        if ($this->ok(preg_match('/\b(?:'.self::UNIT_NOUN.'|la|el|las|los|del|al)\s++(?:(?:n(?:ro|[°ºo])\.?+|n[uú]mero|#)\s*+)?+$/iu', $beforeCode)) !== 1
                            || $this->ok(preg_match('/^'.self::NOT_A_CODE.'/iu', $afterCode)) !== 1) {
                            continue;
                        }
                    }
                    $mentions[] = [$code, $offset, strlen($code)];
                }
            }
            usort($mentions, fn (array $a, array $b): int => $a[1] <=> $b[1]);
            $named = array_values(array_unique(array_column($mentions, 0)));
            $unnamedOption = $this->ok(preg_match('/\b(?:otr[oa]\s++(?:opci[oó]n|alternativa|unidad|lote|depto|departamento|casa|propiedad)|(?:un|una)\s++segund[oa]\s++(?:opci[oó]n|alternativa|unidad|lote|depto|departamento|casa)|y\s++(?:un|una)\s++(?:opci[oó]n|alternativa|lote|depto|departamento|casa))\b/iu', $segment)) === 1;
            if ($named !== []) {
                $current = $named;
            } elseif ($unnamedOption) {
                $current = [];
            }
            $scope = $current === [] ? null : $current;
            $every = $this->ok(preg_match(self::EVERY, $segment)) === 1;
            $pluralVerb = $this->ok(preg_match('/\b(?:tienen|son|cuentan|est[aá]n|quedan|ofrecen|incluyen|miden|poseen|disponen|presentan|comparten)\b/iu', $segment)) === 1;

            // A price belongs to a unit, not to another listing or a brochure with the same number.
            if (! $requestedAmounts) {
                $segmentMoney = $this->moneyMatches($segment, true);
                usort($segmentMoney, fn (array $a, array $b): int => $a[2] <=> $b[2]);
                $respectively = count($named) === count($segmentMoney) && count($named) > 1
                    && $this->ok(preg_match('/\brespectivamente\b/iu', $segment)) === 1;
                $previousMoneyOffset = -1;
                foreach ($segmentMoney as $moneyIndex => [$amount, $currency, $offset]) {
                    $beforeMoney = substr($segment, 0, $offset);
                    if ($this->ok(preg_match('/\b'.self::INSTALLMENTS.self::FILLER.'\s++(?:de\s++)?+(?:(?:'.self::USD.'|'.self::ARS.')\s*+)?+$/iu', $beforeMoney)) === 1) {
                        continue; // Installment amounts still require approved knowledge in check().
                    }
                    $beforeUnits = array_values(array_filter($mentions, fn (array $m): bool => $m[1] < $offset));

                    $priceGroup = array_values(array_filter($beforeUnits, fn (array $m): bool => $m[1] > $previousMoneyOffset));
                    $priceUnits = $beforeUnits !== [] ? [end($beforeUnits)[0]] : ($named ?: ($current ?: ($lastVisitorCodes ?: $notFound)));
                    if ($respectively) {
                        $priceUnits = [$named[$moneyIndex]];
                    } elseif (count($priceGroup) > 1 && ($every || $pluralVerb || $this->ok(preg_match('/\b(?:cuestan|valen|salen)\b/iu', $segment)) === 1)) {
                        $priceUnits = array_values(array_unique(array_column($priceGroup, 0)));
                    }
                    $previousMoneyOffset = $offset;
                    foreach ($priceUnits as $unit) {
                        $backed = array_any($records, fn (array $r): bool => $r['code'] === $unit && is_array($r['price'])
                            && isset($r['price']['amount'], $r['price']['currency'])
                            && $this->normalize((string) $r['price']['amount'], null) === $amount
                            && ($currency === null || $r['price']['currency'] === $currency));
                        if (! $backed) {
                            $found['UNSUPPORTED_AMOUNT'] = true;
                        }
                    }
                }
            }

            // Unit codes: returned, named by the visitor (repeating it invents no unit) or written in a source.
            foreach ($named as $code) {
                if (! in_array($code, $codes, true) && ! in_array($code, $notFound, true) && ! in_array($code, $visitorCodes, true)
                    && ! in_array($code, $proof(null)['codes'], true)
                    && ! (preg_match('/\p{L}/u', $code) === 1 && $this->hasWord($visitor, $code))) {
                    $found['UNSUPPORTED_UNIT'] = true;
                }
            }

            // Numbers: each one bound to the nearest unit named before it (else after it, else the carried unit),
            // or all contiguous units before a plural verb ("El 12A tiene 1 baño, y el 12B y el 12C tienen 3 dormitorios").
            $segClaims = $this->claims($segment, $delivers, $mentions, $asked, $question, $wasFinancing);
            $segTypedClaims = [];
            $claimedForUnit = [];
            foreach ($segClaims as [$value, $kind, $offset, $when]) {
                $before = array_values(array_filter($mentions, fn (array $m): bool => $m[1] < $offset));
                $claimEvery = $every;
                if (count($before) >= 2 && $pluralVerb) {
                    $group = [end($before)];
                    for ($idx = count($before) - 2; $idx >= 0; $idx--) {
                        $leftAt = $before[$idx][1];
                        $rightAt = $group[0][1];
                        if (array_filter($segClaims, fn (array $c): bool => $c[2] > $leftAt && $c[2] < $rightAt) !== []) {
                            break;
                        }
                        array_unshift($group, $before[$idx]);
                    }
                    if (count($group) >= 2) {
                        $units = array_values(array_unique(array_column($group, 0)));
                        $claimEvery = true;
                    } else {
                        $units = [end($before)[0]];
                    }
                } elseif ($before !== []) {
                    $units = [end($before)[0]];
                } elseif (count($mentions) >= 2 && $pluralVerb) {
                    $units = $named;
                    $claimEvery = true;
                } elseif ($mentions !== []) {
                    $units = [$mentions[0][0]];
                } else {
                    $units = $scope;
                }
                if ($units === null && count($records) > 1 && $kind !== null && $kind !== 'digits') {
                    $claimEvery = true;
                }
                if ($kind !== null && $kind !== 'digits') {
                    $segTypedClaims[] = [$value, $kind];
                    foreach ($units ?? [] as $u) {
                        $claimedForUnit[$u][$kind] = true;
                    }
                }
                $unitProof = $proof($units);
                // A catalogue count describes the named set, not a numeric attribute of its first unit.
                $catalogueCount = $inventoryChecked && $named !== [] && ! $every && $offset < $mentions[0][1]
                    && $this->ok(preg_match('/\b(?:por|cada)\s++(?:(?:cada|una?|el|la)\s++)?+(?:'.self::UNIT_NOUN.'|opci[oó]n)\b/iu', $segment)) === 0
                    && $value === (string) count($named)
                    && array_diff($named, $available) === []
                    && $this->ok(preg_match('/\b(?:tenemos|hay|encontramos|encontr[eé])\s++(?:disponibles\s++)?+$/iu', substr($segment, 0, $offset))) === 1
                    && $this->ok(preg_match('/^\d++\s++(?:lotes|unidades|opciones)\b/iu', substr($segment, $offset))) === 1;
                $ok = match ($kind) {
                    // A phone or an account number: the same digits inside a single run of the visitor, a source or the server.
                    'digits' => array_any([...$baseDigitRuns, ...$unitProof['digitRuns']], fn (string $r): bool => str_contains($r, $value)),
                    null => $catalogueCount || in_array($value, [...(($units === null || $when) ? $base : []), ...$unitProof['numbers'], ...$this->recordValues($unitProof['records'])], true),
                    default => ($echoAt($offset) && in_array($value.'|'.$kind, $visitorTyped, true)) || $this->typedBacked($value, $kind, $unitProof, $claimEvery),
                };
                if (! $ok) {
                    $found['UNSUPPORTED_FACT'] = true;
                }
            }

            // Availability: never in a question. "disponible" needs every unit it is about returned this turn (with no
            // unit: something returned and nothing reported missing); "vendida" needs that unit reported missing.
            $availabilities = $question ? [] : $this->availability($segment, $named !== [] || $this->ok(preg_match('/\b'.self::UNIT_NOUN.'/iu', $segment)) === 1,
                $named !== [] || $current !== [] || $lastVisitorCodes !== []);
            $about = $named !== [] ? $named : ($current !== [] ? $current : $lastVisitorCodes);
            $checkAvailability($availabilities, $about);

            $hasEllipsisWord = $this->ok(preg_match('/\b(?:tambi[eé]n|igual|lo\s++mismo|[ií]dem)\b/iu', $segment)) === 1;
            $scopedUnits = $named !== [] ? $named : ($scope ?? ($every && count($records) > 1 ? $codes : []));
            $unitProofs = ($every || $pluralVerb || $hasEllipsisWord) && count($scopedUnits) > 1
                ? array_map(fn (string $u): array => $proof([$u]), $scopedUnits) : [$proof($scope)];
            if ($hasEllipsisWord && count($named) > 1) {
                foreach ($segTypedClaims as [$tv, $tk]) {
                    foreach ($named as $u) {
                        if (! isset($claimedForUnit[$u][$tk]) && ! $this->typedBacked($tv, $tk, $proof([$u]), false)) {
                            $found['UNSUPPORTED_FACT'] = true;
                        }
                    }
                }
            }
            foreach ($unitProofs as $dateProof) {
                if ($this->unsupportedDates($segment, $fold, $delivers, $question, $dateProof, $visitor, $visitorRead, $visitorFold)) {
                    $found['UNSUPPORTED_DATE'] = true;
                }
            }
            $segPlaces = [];
            foreach ($places as $place) {
                if ($this->hasWord($fold, $place)) {
                    $segPlaces[] = $place;
                    if (array_any($unitProofs, fn (array $p): bool => ! $this->hasWord($p['fold'], $place))
                        && ($this->hasWord($nonEchoFold, $place) || ! $this->hasWord($visitorFold, $place))) {
                        $found['UNSUPPORTED_LOCATION'] = true;
                    }
                }
            }
            $segAmenities = [];
            foreach (self::AMENITIES as $forms) {
                $pattern = '/(?<![\p{L}\p{N}])(?:'.$forms.')(?![\p{L}\p{N}])/u';
                // EVP-196: only what the reply affirms ("no figuran datos sobre pileta" claims no pool).
                if ($this->ok(preg_match($pattern, $fold)) === 1 && ! $this->deniedInReply($pattern, $fold)) {
                    $segAmenities[] = $pattern;
                    if (array_any($unitProofs, fn (array $p): bool => ! $this->affirmed($pattern, $p['fold']))
                        && ($this->ok(preg_match($pattern, $nonEchoFold)) === 1 || $this->ok(preg_match($pattern, $visitorFold)) !== 1)) {
                        $found['UNSUPPORTED_AMENITY'] = true;
                    }
                }
            }

            // A3: elliptical predicate ("El 12A tiene pileta y 3 dormitorios. El 12B también.") re-checks missing prior facts against $ellipsisTargets.
            $ellipsisTargets = $named !== [] ? $named : ($scope ?? []);
            if ($ellipsisTargets !== [] && $hasEllipsisWord) {
                $unitProof = $proof($ellipsisTargets);
                $segKinds = array_column($segTypedClaims, 1);
                foreach ($prev['claims'] as [$pv, $pk]) {
                    if (! in_array($pk, $segKinds, true) && ! $this->typedBacked($pv, $pk, $unitProof, count($ellipsisTargets) > 1)) {
                        $found['UNSUPPORTED_FACT'] = true;
                    }
                }
                if ($availabilities === [] && $prev['availability'] !== []) {
                    $checkAvailability($prev['availability'], $ellipsisTargets);
                }
                foreach ($prev['places'] as $pp) {
                    if (! in_array($pp, $segPlaces, true)
                        && array_any(array_map(fn (string $u): array => $proof([$u]), $ellipsisTargets), fn (array $p): bool => ! $this->hasWord($p['fold'], $pp))) {
                        $found['UNSUPPORTED_LOCATION'] = true;
                    }
                }
                foreach ($prev['amenities'] as $pa) {
                    if (! in_array($pa, $segAmenities, true)
                        && array_any(array_map(fn (string $u): array => $proof([$u]), $ellipsisTargets), fn (array $p): bool => ! $this->affirmed($pa, $p['fold']))) {
                        $found['UNSUPPORTED_AMENITY'] = true;
                    }
                }
            }
            if ($segTypedClaims !== [] || $availabilities !== [] || $segPlaces !== [] || $segAmenities !== []) {
                $prev = ['claims' => $segTypedClaims, 'availability' => $availabilities, 'places' => $segPlaces, 'amenities' => $segAmenities];
            }
            if ($unnamedOption) {
                $current = [];
            }
        }

        return array_values(array_filter(['UNSUPPORTED_AMOUNT', 'UNSUPPORTED_FACT', 'UNSUPPORTED_UNIT', 'UNSUPPORTED_AVAILABILITY', 'UNSUPPORTED_DATE',
            'UNSUPPORTED_LOCATION', 'UNSUPPORTED_AMENITY'], fn (string $code): bool => isset($found[$code])));
    }

    /**
     * Sentences, lines and "¿…?" questions as separate segments. Abbreviations and list numbers ("1. Lote 12A")
     * do not end one ("Depto. 12C tiene…"). Trailing "? " clauses without "¿" split at the last comma.
     *
     * @return list<string>
     */
    private function segments(string $text): array
    {
        $parts = $this->ok(preg_split('/(?<!\bdepto\.)(?<!\bdpto\.)(?<!\bnro\.)(?<!\bsup\.)(?<!\bav\.)(?<!\bdorm\.)(?<!\bamb\.)(?<!\bmz\.)(?<!^\d\.)(?<!^\d\d\.)(?<!\n\d\.)(?<!\n\d\d\.)(?<=[.!?;])\s++|(?<=[!?])(?=[\p{L}\p{N}¡¿])|\n++|(?=¿)/iu', $text)) ?: [];
        $out = [];
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }
            if (! str_contains($part, '¿') && str_ends_with($part, '?')) {
                $splitPattern = '/(?:,\s++|\s++(?:pero|aunque)\s++|\s++(?:y|o)\s++(?=(?:te|quer[eé]s|prefer[ií]s|necesit[aá]s|busc[aá]s|coordin|agend|paso|llam|arm|segu)\b))(?=[^,]*\?\s*+$)/iu';
                foreach ($this->ok(preg_split($splitPattern, $part)) ?: [$part] as $sub) {
                    $sub = trim($sub);
                    if ($sub !== '') {
                        $out[] = $sub;
                    }
                }
            } else {
                $out[] = $part;
            }
        }

        return $out;
    }

    /**
     * Every number of a reply segment as [value, kind|null, offset]. Long digit runs (phones, accounts) are one claim of
     * kind "digits", compared by their digits. Skipped: amounts and commercial terms (money(), terms(), which already
     * need the same pair in the evidence; a list counts: "12, 24 o 36 cuotas"), years, delivery periods and
     * abbreviated months (unsupportedDates()), ordinals, and the digits of a unit code. A bare number in a list takes the
     * kind of the next one ("2 o 3 dormitorios"); otherwise the kind said before it in the segment ("el 12A tiene 2
     * dormitorios y el 12B, 3"), else the kind of the visitor's last question ("¿cuántos dormitorios?" -> "Tiene 3."),
     * within plausible values.
     *
     * @param  list<array{0: string, 1: int, 2: int}>  $mentions
     * @return list<array{0: string, 1: ?string, 2: int, 3: bool}>
     */
    private function claims(string $segment, bool $delivers, array $mentions, ?string $asked, bool $question, bool $financing = false): array
    {
        $claims = [];
        $spans = [];
        $kindsUnion = implode('|', self::KINDS);
        foreach ($this->matches('/(?<![\p{L}\p{N}])\d(?:[ \-.\/]?+\d)++(?![\p{L}\p{N}])/u', $segment) as $m) {
            $rawRun = (string) $m[0][0];
            $runOffset = (int) $m[0][1];
            $tailAfter = mb_strcut($segment, $runOffset + strlen($rawRun), 80);
            if ($this->ok(preg_match('/[ \-.\/]\d++$/u', $rawRun, $tailM)) === 1
                && $this->ok(preg_match('/^'.self::FILLER.'\s*+\p{Pd}?+\s*+(?:'.$kindsUnion.')/iu', $tailAfter)) === 1) {
                $rawRun = substr($rawRun, 0, strlen($rawRun) - strlen($tailM[0]));
            }
            $digits = (string) preg_replace('/\D/', '', $rawRun);
            if (strlen($digits) >= 8 && preg_match('/\d{1,3}(?:\.\d{3}){2,}/', $rawRun) !== 1) {
                $claims[] = [$digits, 'digits', $runOffset, false, false];
                $spans[] = [$runOffset, strlen($rawRun)];
            }
        }
        $commercialSpans = [
            ...array_map(fn (array $m): array => [$m[2], $m[3]], $this->moneyMatches($segment, alreadyDigits: true)),
            ...$this->termsAndOffsets($segment, raw: true, carryFinancing: $financing)[1],
        ];
        foreach ($this->matches('/(?<![\p{L}\p{N}])\d++(?:[.,]\d++)*+/u', $segment) as $m) {
            [$token, $offset] = [(string) $m[0][0], (int) $m[0][1]];
            foreach ([...$spans, ...array_map(fn (array $u): array => [$u[1], $u[2]], $mentions)] as [$at, $length]) {
                if ($offset >= $at && $offset < $at + $length) {
                    continue 2; // part of a phone, an account or a unit code
                }
            }
            // Whole characters only: a cut inside "ó" would make every /u pattern fail (GUARD_ERROR).
            $before = mb_strcut(substr($segment, 0, $offset), max(0, $offset - 48));
            $after = mb_strcut($segment, $offset + strlen($token), 160);
            if ($offset === 0 && preg_match('/^\d{1,2}$/', $token) === 1 && $this->ok(preg_match('/^\.\s++\p{L}/u', $after)) === 1) {
                continue; // numbered list item ("1. Lote 12A...")
            }
            if (in_array($token, ['2', '3', '4'], true) && $this->ok(preg_match('/^[dk](?![\p{L}\p{N}])/i', $after)) === 1) {
                continue; // "2D", "3D", "4K"
            }
            if ($this->ok(preg_match('/^(?:er|ro|ra|do|da|to|ta|vo|va|mo|ma|no|na|°|º)\b/iu', $after)) === 1
                || ($delivers && $this->ok(preg_match('/^\s*+(?:mes(?:es)?+|a[nñ]os?+|semanas?+|d[ií]as?+)\b/iu', $after)) === 1)
                || ($delivers && strlen($token) === 2 && $this->ok(preg_match('/\b(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[-\/.\']?+$|\'$/iu', $before)) === 1)) {
                continue;
            }
            $kind = null;
            foreach (self::KINDS as $k => $forms) {
                if ($this->ok(preg_match('/^'.self::FILLER.'\s*+\p{Pd}?+\s*+(?:'.$forms.')/iu', $after)) === 1
                    || $this->ok(preg_match('/(?:'.self::LABELS[$k].')\s*+(?::|→|=|\p{Pd})?+\s*+(?:de\s++)?+$/iu', $before)) === 1
                    || $this->ok(preg_match('/^\s*+(?:'.self::LABELS[$k].')\s*+—/iu', $segment)) === 1) {
                    $kind = $k;
                    break;
                }
            }
            // Years and "los 2 tienen..." / "las 2 unidades tienen..." skip only when no property kind was detected.
            if ($kind === null && (($this->ok(preg_match('/^(?:19|20)\d\d$/', $token)) === 1
                    && $this->ok(preg_match('/^\s*+(?:,|y|o|a|-)\s*+\d++\s*+(?:'.$kindsUnion.')/iu', $after)) !== 1)
                || $this->ok(preg_match('/^\s*+[\/\-]\s*+(?:19|20)\d\d\b/', $after)) === 1
                || ($this->ok(preg_match('/\b(?:los|las)\s++$/iu', $before)) === 1
                    && $this->ok(preg_match('/^\s++(?:(?:unidades|lotes|deptos?+|departamentos|dptos?+|casas)\s++)?+(?:tienen|son|cuentan|est[aá]n|quedan|ofrecen|incluyen|miden|poseen|disponen|presentan|comparten)\b/iu', $after)) === 1))) {
                continue;
            }
            // Amounts and commercial terms are skipped only when money() or terms() registered that exact offset.
            if ($kind === null) {
                foreach ($commercialSpans as [$at, $length]) {
                    if ($offset >= $at && $offset < $at + $length) {
                        continue 2;
                    }
                }
            }
            // EVP-196: the minutes of a time ("9:00", "18.30 hs") belong to the hour, checked as a time.
            if ($kind === null && preg_match('/^[0-5]\d$/', (string) $token) === 1 && $this->ok(preg_match('/(?<![\d:])\d{1,2}:$/', $before)) === 1) {
                continue;
            }
            // A date or a time ("12 de marzo", "a las 10", "el jueves 15") never takes a property kind.
            $when = $kind === null && ($this->ok(preg_match('/^\s*+(?:de\s++(?:'.self::MONTHS.')|hs\b|h\b|:\d|\/\d)/iu', $after)) === 1
                || $this->ok(preg_match('/(?:\blas|\bel\s++d[ií]a|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s++$/iu', $before)) === 1);
            $claims[] = [$this->numberValue($token), $kind, $offset, ! $when && $this->ok(preg_match('/^\s*+(?:,|y|o|a|-)\s*+\d/u', $after)) === 1, $when];
        }
        foreach (self::KINDS as $k => $forms) {
            foreach ($this->matches('/\b(?:un|una|uno)'.self::FILLER.'\s++(?:'.$forms.')/iu', $segment) as $m) {
                $claims[] = ['1', $k, (int) $m[0][1], false, false];
            }
        }
        if ($this->ok(preg_match('/\bmonoamb(?:iente)?+s?+\b/iu', $segment, $mono, PREG_OFFSET_CAPTURE)) === 1) {
            $claims[] = ['1', 'amb', (int) $mono[0][1], false, false];
        }
        usort($claims, fn (array $a, array $b): int => $a[2] <=> $b[2]);
        $plausible = fn (string $value, string $kind): bool => $kind === 'm2' ? (float) $value < 100000 : (float) $value <= 20;
        for ($i = count($claims) - 2; $i >= 0; $i--) {
            if ($claims[$i][1] === null && $claims[$i][3] && $claims[$i + 1][1] !== null && $claims[$i + 1][1] !== 'digits') {
                $claims[$i][1] = $claims[$i + 1][1];
            }
        }
        $last = null;
        foreach ($claims as $i => $claim) {
            if ($claim[1] !== null) {
                $last = $claim[1] === 'digits' ? $last : $claim[1];

                continue;
            }
            $inherited = $last ?? ($question ? null : $asked);
            if ($inherited !== null && ! $claim[4] && $plausible($claim[0], $inherited)) {
                $claims[$i][1] = $inherited;
            }
        }

        return array_map(fn (array $c): array => [$c[0], $c[1], $c[2], $c[4]], $claims);
    }

    /**
     * A typed value backed by the units' evidence: a structured field that exists is the only truth for its unit;
     * otherwise the unit's listing; sources only when no unit has the field. "ambos/todos": every returned unit.
     *
     * @param  array<string, mixed>  $proof
     */
    private function typedBacked(string $value, string $kind, array $proof, bool $every): bool
    {
        $pair = $value.'|'.$kind;
        $records = array_values(array_filter($proof['records'], fn (array $r): bool => $r['available']));
        $own = function (int $i, array $r) use ($proof, $kind, $pair, $value): ?bool {
            $field = $r['fields'][$kind] ?? null;

            return $field !== null ? $field === $value : (in_array($pair, $proof['listingTyped'][$i] ?? [], true) ? true : null);
        };
        if ($every) {
            foreach ($proof['records'] as $i => $r) {
                if ($r['available'] && $own($i, $r) !== true) {
                    return false;
                }
            }

            return $records !== [];
        }
        $hasField = false;
        foreach ($proof['records'] as $i => $r) {
            $hasField = $hasField || ($r['fields'][$kind] ?? null) !== null;
            if ($own($i, $r) === true) {
                return true;
            }
        }

        return ! $hasField && in_array($pair, $proof['knowledgeTyped'], true);
    }

    /**
     * Counts and surfaces of a text as "value|kind" (evidence, the visitor's words).
     *
     * @return list<string>
     */
    private function typedPairs(string $read): array
    {
        $pairs = [];
        foreach ($this->segments($read) as $segment) {
            foreach ($this->claims($segment, false, [], null, true) as [$value, $kind]) {
                if ($kind !== null) {
                    $pairs[] = $value.'|'.$kind;
                }
            }
        }

        return array_values(array_unique($pairs));
    }

    /**
     * Every number of a text, as plain decimals.
     *
     * @return list<string>
     */
    private function numberTokens(string $text): array
    {
        preg_match_all('/\d++(?:[.,]\d++)*+/', $text, $m);

        return array_values(array_unique(array_map($this->numberValue(...), $m[0])));
    }

    /**
     * The returned units' own numbers: fields and the digits of their codes.
     *
     * @param  list<array<string, mixed>>  $records
     * @return list<string>
     */
    private function recordValues(array $records): array
    {
        $values = [];
        foreach ($records as $r) {
            array_push($values, ...array_values(array_filter($r['fields'], fn (?string $v): bool => $v !== null)), ...$this->numberTokens((string) $r['code']));
        }

        return $values;
    }

    /**
     * The kind the visitor asked about in their last 2-3 messages, returning the most recent unambiguous one.
     *
     * @param  list<string>  $messages
     */
    private function askedKindFromMessages(array $messages): ?string
    {
        foreach (array_reverse($messages) as $msg) {
            $read = $this->factsReading($this->canonical($msg));
            $kinds = $this->askedKinds($read);
            if (count($kinds) === 1) {
                return $kinds[0];
            }
            if (count($kinds) > 1) {
                return null;
            }
        }

        return null;
    }

    /** @return list<string> */
    private function askedKinds(string $read): array
    {
        return array_keys(array_filter([
            'dorm' => '/\b(?:dormitorios?|dorm|habitaci(?:o|ó)n(?:es)?|cuartos?|piezas?)\b/iu',
            'bano' => '/\bba[ñn]os?\b/iu',
            'amb' => '/\bambientes?\b/iu',
            'm2' => '/\b(?:metros|m2|mts|superficie|mide|tama[ñn]o|hect[aá]reas?)\b/iu',
        ], fn (string $p): bool => $this->ok(preg_match($p, $read)) === 1));
    }

    /**
     * EVP-196: every mention in the reply sits right under a statement that the data is missing, alone or in a list
     * of amenities that starts there: "no figuran confirmados los datos sobre pileta, gimnasio ni cochera", "no sé si
     * el 12A tiene pileta", "no puedo confirmarte si tiene cochera". A denial ("sin pileta", "no tiene cochera") is a
     * claim about the property and still needs evidence; anything else in between ("no sé si viste que tiene
     * pileta") leaves the mention affirmed.
     */
    private function deniedInReply(string $pattern, string $fold): bool
    {
        $has = '(?:tiene|tienen|cuenta\s++con|cuentan\s++con|hay|incluye|incluyen|posee|dispone\s++de|trae)';
        $whether = 'si\s++(?:(?!que\b)[\p{L}\p{N}]++\s++){0,2}?'.$has;
        // Only a lack of data exempts a mention: "no tiene cochera" or "sin pileta" is itself a claim about the property.
        $frame = '\b(?:no\s++(?:figuran?+|tengo|tenemos|cuento\s++con|contamos\s++con)\s++(?:(?:confirmad[oa]s?+|los|las|el|la|datos?+|informacion|info|detalles)\s++){0,4}?(?:sobre|de|acerca\s++de)(?:\s++'.$whether.')?+'
            .'|no\s++(?:te\s++)?+(?:se|puedo\s++confirmar(?:te|le)?+)\s++'.$whether.')';
        $article = '(?:(?:el|la|los|las|un|una)\s++)?+';
        // Every earlier item of the list is itself an amenity ("sin duda, la pileta…" is no list).
        $item = '(?>'.implode('|', self::AMENITIES).')';
        $denial = '/'.$frame.'\s++'.$article.'(?>'.$item.'\s*+(?:,|\by\b|\bni\b|\bo\b)\s*+'.$article.'){0,6}$/u';
        $mentions = $this->matches($pattern, $fold);
        foreach ($mentions as $m) {
            $after = substr($fold, (int) $m[0][1] + strlen((string) $m[0][0]), 30);
            // A comparison praises it ("…pileta más linda"); a verb starts a new claim ("no tengo detalles sobre el quincho
            // y la pileta es climatizada").
            if ($this->ok(preg_match($denial, substr($fold, 0, (int) $m[0][1]))) !== 1
                || $this->ok(preg_match('/^\s*+(?:m[aá]s|como|que|mejor|igual|tan|es|son|esta|estan|tiene|tienen|cuenta|cuentan|viene|vienen|queda|quedan|incluye|incluyen)\b/u', $after)) === 1) {
                return false;
            }
        }

        return $mentions !== [];
    }

    /**
     * The pattern appears without a negation right before it: "sin ascensor ni cochera" or "no figuran datos sobre
     * pileta, gimnasio ni cochera" affirm nothing. An affirmative verb or a contrast in between ends the negation
     * ("no hay dudas, tiene pileta", "no tiene cochera pero sí pileta"); "no sé si tiene pileta" stays negated.
     */
    private function affirmed(string $pattern, string $fold): bool
    {
        foreach ($this->matches($pattern, $fold) as $m) {
            $before = substr($fold, 0, (int) $m[0][1]);
            // The nearest negation decides ("no tiene cochera y no hay pileta" denies the pool too).
            $negated = $this->ok(preg_match('/\b(?:sin|(?:tampoco|ni)(?:\s++(?:tiene|tienen|cuenta\s++con|cuentan\s++con|hay|posee|incluye|trae|dispone\s++de))?+|no\s++(?:tiene|tienen|cuenta\s++con|cuentan\s++con|hay|posee|incluye|trae|dispone\s++de|es|est[aá]|figuran?+|tengo|tenemos|cuento\s++con|contamos\s++con|puedo\s++confirmar|s[eé]))\s++((?:(?!(?:no|sin|tampoco|ni)\b)[\p{L}\p{N},]++\s++){0,8}?)$/u', $before, $neg));
            $between = $negated === 1 ? $neg[1] : '';
            $doubt = $this->ok(preg_match('/^si\s[^,]*+$/u', $between)) === 1; // "no sé si tiene pileta"
            if ($negated !== 1 || $this->ok(preg_match('/\b(?:pero|sino|aunque)\b/u', $between)) === 1
                || (! $doubt && $this->ok(preg_match('/\b(?:tiene|tienen|incluye|incluyen|posee|poseen|cuenta|cuentan|dispone|disponen|trae|traen|hay)\b/u', $between)) === 1)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Years anywhere ("en 2027", "03/2027"); in a delivery sentence also months, quarters, relative dates and periods,
     * backed only by delivery sentences of the evidence (a promo "válida hasta diciembre" dates no delivery). The
     * visitor's year backs a "¿…?" question, or a sentence about their visit that is not about a delivery.
     *
     * @param  array<string, mixed>  $evidence
     */
    private function unsupportedDates(string $segment, string $fold, bool $delivers, bool $question, array $evidence, string $visitor, string $visitorRead, string $visitorFold): bool
    {
        $visit = ! $delivers && $this->ok(preg_match('/\b(?:visita|cita|turno|recorrida)/iu', $segment)) === 1;
        $years = $delivers ? $evidence['delivery'] : $evidence['raw'];
        // Not a group of a longer number ("0170 0991 2000 0012", "351-2020" after a 3+ digit phone prefix).
        foreach ($this->matches('/(?<![\p{N}.,])(?<!\d\s)(?<!\d{3}-)\b((?:19|20)\d{2})\b(?![.,]\d)(?!\s\d)(?!\s*+(?:m2\b|mts|metros|%|usd|us\$|pesos|d[oó]lares|cuot|ctas|mil\b))/iu', $segment) as $m) {
            $year = (string) $m[1][0];
            if ($this->ok(preg_match('/(?:usd|us\$|u\$s|\$|ars)\s*+$/iu', substr($segment, 0, (int) $m[1][1]))) === 1
                || $this->ok(preg_match('/^\s*+(?:y|o|a|-)\s*+\d++\s*+(?:'.implode('|', self::KINDS).')/iu', substr($segment, (int) $m[1][1] + 4))) === 1) {
                continue; // an amount or a range ending in a count/surface ("1950 o 2000 m2")
            }
            if (! $this->hasWord($years, $year) && ! (($question || $visit) && $this->hasWord($visitor, $year))) {
                return true;
            }
        }
        if (! $delivers) {
            return false;
        }
        if ($this->ok(preg_match('/\b(?:posesion|entrega)(?:\s++es)?+\s++inmediata\b/u', $fold)) === 1
            && ! str_contains($evidence['deliveryFold'], 'inmediata')
            && ! ($question && str_contains($visitorFold, 'inmediata'))) {
            return true;
        }
        foreach ($this->matches('/(?<![\p{L}\p{N}])('.self::WHEN.')(?![\p{L}\p{N}])/u', $fold) as $m) {
            $when = trim((string) $m[1][0]);
            if (! $this->hasWord($evidence['deliveryFold'], $when) && ! ($question && $this->hasWord($visitorFold, $when))) {
                return true;
            }
        }
        $backed = [...$evidence['periods'], ...($question ? $this->periods($visitorRead) : [])];

        return array_diff($this->periods($segment), $backed) !== [];
    }

    /**
     * Periods as "value|unit" in months, weeks or days: "24 meses", "2 años" (= 24 meses), "un año", "año y medio",
     * "medio año", "8 semanas", "90 días".
     *
     * @return list<string>
     */
    private function periods(string $text): array
    {
        $found = [];
        foreach ($this->matches('/'.self::NUMBERS.'\s*+(mes(?:es)?+|a[nñ]os?+|semanas?+|d[ií]as?+)\b/iu', $text) as $m) {
            preg_match_all('/\d++(?:[.,]\d++)?+/', (string) $m[1][0], $digits);
            $unit = mb_strtolower((string) $m[2][0]);
            foreach ($digits[0] as $digit) {
                $value = (float) $this->numberValue($digit);
                $found[] = match (true) {
                    str_starts_with($unit, 'a') => ($value * 12).'|meses',
                    str_starts_with($unit, 'mes') => $value.'|meses',
                    str_starts_with($unit, 'sem') => $value.'|semanas',
                    default => $value.'|dias',
                };
            }
        }
        if ($this->ok(preg_match('/\b(?:(?:un|1)\s++)?+a[nñ]o\s++y\s++medio\b/iu', $text)) === 1) {
            $found[] = '18|meses';
        } elseif ($this->ok(preg_match('/\bun\s++a[nñ]o\b/iu', $text)) === 1) {
            $found[] = '12|meses';
        }
        if ($this->ok(preg_match('/\bmedio\s++a[nñ]o\b/iu', $text)) === 1) {
            $found[] = '6|meses';
        }

        return array_values(array_unique($found));
    }

    /** "120", "120,5", "120.50" and "1.200" (thousands) as a plain decimal string. */
    private function numberValue(string $number): string
    {
        if (preg_match('/^\d{1,3}(?:\.\d{3})++$/', $number) === 1) {
            $number = str_replace('.', '', $number);
        }

        return (string) (float) str_replace(',', '.', $number);
    }

    /**
     * Unit codes as [code in lower case, byte offset, length]: after a unit noun, with lists ("unidades 12A y 12C",
     * "lote número 34"), after an article ("la 12A", "el 12-3-A", "el 12 sigue…"), or a bare upper-case code ("12B",
     * "L-101", "12-3-A"). A count, surface, period or time after the number is not a code.
     *
     * @return list<array{0: string, 1: int, 2: int}>
     */
    private function unitMentions(string $segment): array
    {
        $found = [];
        $add = function (string $code, int $offset) use (&$found): void {
            $code = rtrim($code, '-/');
            if (preg_match('/\d/', $code) === 1
                && preg_match('/^(?:m2|mt2|3d|2d|4k|q[1-4]|t[1-4]|rn\d++|rp\d++|\d++(?:er|ro|ra|do|da|to|ta|vo|va|mo|ma|no|na|hs|h|am|pm|km|cm|mm|m))$/i', $code) !== 1) {
                $found[] = [mb_strtolower($code), $offset, strlen($code)];
            }
        };
        $list = '((?:\s*+(?:,|\by\b|\be\b|\bo\b)\s*+'.self::CODE.')*+)';
        foreach ($this->matches('/\b'.self::UNIT_NOUN.'\s++(?:(?:n(?:ro|[°ºo])\.?+|n[uú]mero|#)\s*+)?+('.self::CODE.')'.self::NOT_A_CODE.$list.'/iu', $segment) as $m) {
            $add((string) $m[1][0], (int) $m[1][1]);
            // "Lote 12A, 85 m2": a listed number followed by a count or surface is a fact, not another code.
            foreach ($this->matches('/'.self::CODE.'/iu', (string) $m[2][0]) as $n) {
                $at = (int) $m[2][1] + (int) $n[0][1];
                // "80.50 m2" / "80,50 m2": the decimal part belongs to the number, on either side of the separator.
                if (preg_match('/\d[.,]$/', substr($segment, 0, $at)) === 1
                    || $this->ok(preg_match('/^(?:[.,]\d++)?+'.self::NOT_A_CODE.'/iu', substr($segment, $at + strlen((string) $n[0][0])))) !== 1) {
                    continue;
                }
                $add((string) $n[0][0], $at);
            }
        }
        foreach ($this->matches('/\b(?:la|el|las|los|del|al)\s++(\d++[a-z]{1,2}\b|[a-z]{1,2}-?+\d++[a-z]?+\b|\d++(?:-[a-z0-9]++)++|\d{1,4}(?=\s++(?:est[aá]|sigue|tiene|queda|cuesta|sale|vale|ya)\b|,\s*+(?:la|el|las|los)\s++\d|\s++(?:y|e|o)\s++(?:la|el|las|los)\s++\d))'.self::NOT_A_CODE.'/iu', $segment) as $m) {
            $add((string) $m[1][0], (int) $m[1][1]);
        }
        foreach ($this->matches('/(?<![\p{L}\p{N}\-])(\d{1,4}[A-Z]{1,2}|[A-Z]{1,2}-?\d{1,4}[A-Z]?|\d{1,4}-\d{1,4}-[A-Z0-9]{1,3})(?![\p{L}\p{N}])/u', $segment) as $m) {
            if (preg_match('/^(?:M2|MT2|3D|2D|4K|Q[1-4]|T[1-4]|RN\d++|RP\d++|\d++(?:HS|H|AM|PM|KM|CM|MM|M|ER|RO|RA|DO|DA|TO|TA|VO|VA|MO|MA|NO|NA))$/', (string) $m[1][0]) !== 1) {
                $add((string) $m[1][0], (int) $m[1][1]);
            }
        }
        foreach ($this->matches('/(?<![\p{L}\p{N}\-])(\d{1,4}[a-z]{1,2})(?![\p{L}\p{N}])/u', $segment) as $m) {
            $tok = (string) $m[1][0];
            $off = (int) $m[1][1];
            if (preg_match('/^(?:m2|mt2|3d|2d|4k|\d++(?:hs|h|am|pm|km|cm|mm|m|er|ro|ra|do|da|to|ta|vo|va|mo|ma|no|na))$/', $tok) === 1) {
                continue;
            }
            $beforeTok = mb_strcut($segment, max(0, $off - 24), min($off, 24));
            $afterTok = mb_strcut($segment, $off + strlen($tok), 24);
            if ($this->ok(preg_match('/(?:[:,]|\b(?:y|e|o|recomiendo|opciones?))\s++$/iu', $beforeTok)) === 1
                || $this->ok(preg_match('/^\s*+(?:,|\b(?:y|e|o)\b)\s*+\d{1,4}[a-z]{1,2}\b/u', $afterTok)) === 1) {
                $add($tok, $off);
            }
        }
        $unique = [];
        foreach ($found as $mention) {
            $unique[$mention[0].'@'.$mention[1]] = $mention;
        }

        return array_values($unique);
    }

    /**
     * Byte offsets of $code as a whole token of $segment (case-insensitive).
     *
     * @return list<int>
     */
    private function wordOffsets(string $segment, string $code): array
    {
        return array_map(fn (array $m): int => (int) $m[0][1], $code === '' ? [] : $this->matches('/(?<![\p{L}\p{N}])'.preg_quote($code, '/').'(?![\p{L}\p{N}])/iu', $segment));
    }

    /**
     * POSITIVE ("disponible", "a la venta", "todavía la tenemos", "se puede comprar", "no está vendido", "no se vendió"),
     * NEGATIVE ("no está disponible", "vendida", "se vendió") or both when both appear in one segment.
     *
     * @param  bool  $specific  a unit code is named in the segment or in the visitor's last message
     * @return list<'POSITIVE'|'NEGATIVE'>
     */
    private function availability(string $segment, bool $aboutUnit, bool $specific = false): array
    {
        $found = [];
        if ($this->ok(preg_match('/\bno\s++(?:cuento|contamos)\s++con\s++disponibilidad\b/iu', $segment)) === 1) {
            $found[] = 'NEGATIVE';
        }
        // EVP-196: "el reglamento no está disponible para consultar por este canal": a document or the channel, never a
        // unit ("el 12B está disponible para ver el sábado" names one, so it stays a claim).
        $meta = fn (string $before, string $after): bool => ! $aboutUnit && ! $specific
            && $this->ok(preg_match('/\b(?:reglamentos?|documentos?|informaci[oó]n|archivos?|planos?|folletos?|brochures?|gu[ií]as?|cat[aá]logos?|contratos?|formularios?)\b/iu', $before)) === 1
            && $this->ok(preg_match('/^\s++(?:para\s++(?:consultar|descargar|leer|compartir)\b|(?:\p{L}++\s++){0,3}?(?:a\s++trav[eé]s\s++de|por)\s++este\s++(?:canal|medio|chat)\b)/iu', $after)) === 1;
        // EVP-196: "Actualmente nuestro equipo no está disponible" (out of hours) is about people: the staff noun opens a
        // segment that names no unit. Anything before it ("según nuestro equipo…", "de acuerdo a…") reports on a unit.
        $staff = fn (string $before): bool => ! $aboutUnit
            && $this->ok(preg_match('/^\s*+(?:(?:actualmente|lamentablemente|hoy|ahora|por\s++ahora|en\s++este\s++momento),?+\s++)?+(?:nuestr[oa]s?+|el|la|los|las|mi|mis)\s++(?:equipo|asesor(?:es|as?)?+|personal)\s++(?:(?:de|comercial)\s++(?:\p{L}++\s++)?+)?+(?:no\s++)?+(?:(?:est[aá]n?+|se\s++encuentra\p{L}*+)\s++)?+$/iu', $before)) === 1;
        foreach ($this->matches('/\bno\s++disponibles?+\b|\bno\s++(?:est[aá]n?+|sigue|siguen|queda|quedan|hay|tenemos|figuran?+(?:\s++como)?+|se\s++encuentra)\s++(?:m[aá]s\s++)?+(?:disponibles?+|libres?+|a\s++la\s++venta|en\s++venta)\b|\bno\s++(?:encontr\p{L}*+|encuentr\p{L}*+|hay|tenemos|quedan|veo|tengo|cont[aá]mos\s++con|cuento\s++con|dispon(?:emos|go)\s++de)\s++(?:\p{L}++\s++){0,3}?(?:disponibles?+|libres?+|a\s++la\s++venta|en\s++venta)\b|\bya\s++no\s++(?:est[aá]n?+|sigue|siguen|queda|quedan|la|lo|las|los)\b/iu', $segment) as $m) {
            $before = substr($segment, 0, (int) $m[0][1]);
            // Only "no está disponible" can be about people: "nuestro equipo ya no lo tiene" denies a unit.
            $aboutStaff = $staff($before) && preg_match('/^no\s++(?:est[aá]n?+|se\s++encuentra)\b/iu', (string) $m[0][0]) === 1;
            if (! $aboutStaff && ! $meta($before, substr($segment, (int) $m[0][1] + strlen((string) $m[0][0])))) {
                $found[] = 'NEGATIVE';
            }
        }
        foreach ($this->matches('/\b(?:vendid[oa]s?+|ocupad[oa]s?+|alquilad[oa]s?+)\b|\b(?:ya\s++)?se\s++vendi[oó]\b/iu', $segment) as $m) {
            $before = substr($segment, 0, (int) $m[0][1]);
            $negatedParticiple = $this->ok(preg_match('/\b(?:no|ni|tampoco)\s++(?:(?:todav[ií]a|a[uú]n)\s++)?+(?:(?:est[aá]n?+|fue|fueron|ha\s++sido|han\s++sido|se\s++ha|qued[oó]|se\s++encuentra|sigue|siguen|figura\p{L}*+)\s++(?:(?:todav[ií]a|a[uú]n)\s++)?+)?+$/iu', $before)) === 1
                || (str_contains(mb_strtolower((string) $m[0][0]), 'vendi') && $this->ok(preg_match('/\b(?:no|ni|tampoco)\s++(?:(?:todav[ií]a|a[uú]n)\s++)?+(?:se\s++ha\s++)?+$/iu', $before)) === 1);
            $found[] = $negatedParticiple ? 'POSITIVE' : 'NEGATIVE';
        }
        foreach ($this->matches('/\bdisponibles?+\b|\bdisponibilidad\b|\ba\s++la\s++venta\b|\ben\s++venta\b|\b(?:est[aá]n?+|sigue|siguen|queda|quedan)\s++libres?+\b|\b(?:todav[ií]a|a[uú]n)\s++(?:la|lo|las|los)\s++tenemos\b|\bse\s++(?:puede|pueden)\s++comprar\b|\bpod[eé]s\s++comprar(?:la|lo|las|los)?+\b|\bquedan?+\s++(?:\d++|unidades|lotes|departamentos|casas)\b|\bnadie\s++(?:(?:lo|la|los|las)\s++)?+(?:compr|reserv|se[ñn])\p{L}*+|\b(?:todav[ií]a|a[uú]n)\s++no\s++(?:(?:lo|la|los|las)\s++)?+(?:compr|reserv|se[ñn])\p{L}*+|\b(?:ya|lote|unidad|depto|departamento|casa|terreno|propiedad|\d++[a-z]{0,2})\s++(?:ya\s++)?+es\s++tuy[oa]s?+\b|\b(?:lo|la|los|las)\s++pod[eé]s\s++(?:reservar|se[ñn]ar)\b|\bno\s++(?:est[aá]n?+|fue|fueron|qued[oó])\s++(?:reservad|se[ñn]ad)[oa]s?+\b|\bsin\s++(?:vender(?:se)?+|comprador(?:es)?+|due[ñn][oa]s?+)\b|\bno\s++tiene\s++comprador\b|\bhay\s++stock\b|\bquedan\s++(?:varias|varios|algunas|algunos|unas|unos|bastantes|muchas|muchos)\b|\bpod[eé]s\s++(?:reservar|se[ñn]ar)(?:la|lo|las|los)\b|\bse\s++(?:puede|pueden)\s++(?:reservar|se[ñn]ar)\b(?!\s++(?:un|una|el|la|tu)\s++(?:turno|visita|horario|cita|recorrida))/iu', $segment) as $m) {
            $before = substr($segment, 0, (int) $m[0][1]);
            $after = substr($segment, (int) $m[0][1] + strlen((string) $m[0][0]));
            if ($staff($before)
                || ($this->ok(preg_match('/^disponibles?+$/iu', (string) $m[0][0])) === 1
                    && $this->ok(preg_match('/\bno\s++$/iu', $before)) === 1)
                || $this->ok(preg_match('/\bno\s++(?:est[aá]n?+|sigue|siguen|queda|quedan|hay|tenemos|figuran?+(?:\s++como)?+|se\s++encuentra)\s++(?:m[aá]s\s++)?+(?:(?:est[aá]n?+|sigue|siguen|queda|quedan)\s++)?+$/iu', $before)) === 1
                || $this->ok(preg_match('/\bno\s++(?:encontr\p{L}*+|encuentr\p{L}*+|hay|tenemos|quedan|veo|tengo|cont[aá]mos\s++con|cuento\s++con|dispon(?:emos|go)\s++de)\s++(?:\p{L}++\s++){0,3}?$/iu', $before)) === 1
                // "horarios disponibles", "asesores disponibles"; a state verb makes it a claim ("según los datos sigue
                // disponible"), and a suffix is no noun ("candidatos"). "los datos de disponibilidad" goes through the
                // restricted noun rule below instead.
                || (! str_starts_with(mb_strtolower((string) $m[0][0]), 'disponibilidad') && $this->ok(preg_match('/\b(?:horarios?|turnos?|d[ií]as?|fechas?|asesor(?:es|as?)?+|informaci[oó]n|info|datos)\s++(?:(?!(?:est[aá]n?+|sigue|siguen|queda|quedan|contin\p{L}*+|figura\p{L}*+|aparece\p{L}*+|permanece\p{L}*+|es|son)\b)\p{L}++\s++)?+$/iu', $before)) === 1)
                // EVP-196: a noun phrase about data ("la información que tengo disponible sobre la unidad 12A", "los
                // detalles oficiales disponibles en nuestro sistema") states nothing about a unit, whatever it names.
                || ($this->ok(preg_match('/\b(?:informaci[oó]n|info|datos|detalles?)\s++(?:(?:que\s++(?:tengo|tenemos)|oficiales|actuales)\s++)?+$/iu', $before)) === 1
                    && $this->ok(preg_match('/^\s++(?:sobre|de|del|acerca|en\s++(?:el|nuestro)\s++sistema)\b/iu', $after)) === 1)
                // EVP-200: up to four words between "si" and the state ("un asesor te confirma si el 12A está disponible").
                || $this->ok(preg_match('/(?:consult\p{L}*+|pregunt\p{L}*+|saber|ver|averigu\p{L}*+|confirm\p{L}*+|chequ\p{L}*+|revis\p{L}*+)\s++si\s++(?:[\p{L}\p{N}\-\/]++\s++){0,4}?$/iu', $before)) === 1
                // EVP-200: lacking it, even about a named unit ("no puedo confirmarte la disponibilidad del 12A", "no tengo
                // información sobre la disponibilidad del 12A"); "te paso los detalles de disponibilidad del 12B" stays.
                || (str_starts_with(mb_strtolower((string) $m[0][0]), 'disponibilidad')
                    && $this->ok(preg_match('/\bno\s++(?:te\s++|le\s++)?+(?:(?:puedo|podemos)\s++(?:confirmar|informar|asegurar|garantizar)(?:te|le)?+|(?:tengo|tenemos|cuento\s++con|contamos\s++con)\s++(?:(?:la\s++)?+informaci[oó]n|datos|detalles?)\s++(?:sobre|de|acerca\s++de))\s++la\s++$/iu', $before)) === 1
                    && $this->ok(preg_match('/^[^.!?\n;]{0,40}?(?::|\b(?:es|est[aá]|sigue|contin[uú]a|se\s++mantiene|vigente|inmediata|total|confirmad\p{L}*+|garantizad\p{L}*+|asegurad\p{L}*+)\b)/iu', $after)) !== 1)
                // EVP-200: the noun handed to a person, allowlisted: "la disponibilidad del 12A te la confirma un asesor",
                // "el precio y la disponibilidad te los confirma un asesor", "un asesor te confirma la disponibilidad".
                || (str_starts_with(mb_strtolower((string) $m[0][0]), 'disponibilidad')
                    && (($this->ok(preg_match('/(?:^|[,:;]\s*+)(?:(?:el|los)\s++precios?\s++y\s++)?+(?:la|su)\s++$/iu', $before)) === 1
                            && $this->ok(preg_match('/^\s++(?:del?\s++(?:[\p{L}\p{N}\-\/]++\s++){1,3}?)?+(?:te|se|le)\s++(?:l[oa]s?+\s++)?+(?:va\s++a\s++)?+confirm\p{L}*+\s++(?:un|una|el|la|nuestro|nuestra)\s++asesor/iu', $after)) === 1)
                        || $this->ok(preg_match('/^\s*+(?:un|una|el|la|nuestro|nuestra)\s++asesor[ae]?+\s++(?:te|le|les)\s++(?:va\s++a\s++)?+confirm\p{L}*+\s++(?:la|su)\s++$|^\s*+(?:un|una|el|la|nuestro|nuestra)\s++asesor[ae]?+\s++va\s++a\s++confirmar(?:te|le|les)\s++(?:la|su)\s++$/iu', $before)) === 1)
                    && $this->ok(preg_match('/^\s++(?:del?\s++(?:[\p{L}\p{N}\-\/]++\s++){0,3}?)?+[^.!?\n;]{0,40}?\b(?:es|est[aá]|sigue|contin[uú]a|inmediata|total|confirmad\p{L}*+|garantizad\p{L}*+|asegurad\p{L}*+)\b/iu', $after)) !== 1)
                // EVP-200: the visitor's schedule ("contame tu disponibilidad horaria para visitar el 12A") is no unit state.
                || (str_starts_with(mb_strtolower((string) $m[0][0]), 'disponibilidad')
                    && ($this->ok(preg_match('/\btu\s++$/iu', $before)) === 1 || $this->ok(preg_match('/^\s++(?:horari|de\s++horario|para\s++(?:la\s++)?+visita|para\s++(?:ir|visitar|recorrer))/iu', $after)) === 1))
                // EVP-196: the exemptions below never apply while a specific unit is at stake (named here or asked
                // about by the visitor): "puedo mostrarte las unidades disponibles, entre ellas el 12B" stays a claim.
                || (! $specific && (
                    // An offer to search ("puedo buscarte lotes disponibles", "si buscás lotes disponibles, decime…").
                    $this->ok(preg_match('/\b(?:buscar(?:te|le|les)?+|si\s++busc(?:[aá]s|an)|mostrar(?:te|le|les)?+|encontrar(?:te|le|les)?+)\s++(?:(?:otras?|m[aá]s|las|los|unas?|unos|algunas?|algunos|nuevas?)\s++)?+(?:opciones|propiedades|unidades|lotes|casas|departamentos|deptos|terrenos|alternativas)\s++$/iu', $before)) === 1
                    // The noun as what someone checks or lacks ("sobre el precio ni la disponibilidad", "dentro de
                    // nuestra disponibilidad"), never a statement ("disponibilidad inmediata", "…: sigue en pie").
                    || (str_starts_with(mb_strtolower((string) $m[0][0]), 'disponibilidad')
                        && $this->ok(preg_match('/\b(?:(?:ni|dentro\s++de|sobre(?:\s++\p{L}++){0,3}?|consultar(?:te|le)?+|consulto|verificar(?:te|le)?+|verifico|chequear(?:te|le)?+|chequeo|revisar(?:te|le)?+|reviso|confirmar(?:te|le)?+)\s++(?:la|nuestra|su)|(?:detalles?|datos|informaci[oó]n|info)\s++(?:(?!(?:de|sobre)\b)\p{L}++\s++)?+(?:de|sobre)(?:\s++la)?+)\s++$/iu', $before)) === 1
                        && $this->ok(preg_match('/^[^.!?\n;]{0,40}?(?::|\b(?:es|est[aá]|sigue|contin[uú]a|se\s++mantiene|vigente|inmediata|total|confirmad\p{L}*+|garantizad\p{L}*+|asegurad\p{L}*+)\b)/iu', $after)) !== 1)
                    // EVP-200: "Encontré 3 lotes en venta en Yala": the listing's operation, not a unit's state.
                    || ($this->ok(preg_match('/^en\s++venta$/iu', (string) $m[0][0])) === 1
                        && $this->ok(preg_match('/\b(?:lotes|casas|departamentos|deptos|unidades|propiedades|terrenos|opciones|locales|cocheras)\s++$/iu', $before)) === 1)
                    || $meta($before, $after)))
                || $this->ok(preg_match('/^\s++(?:la\s++)?+financiaci[oó]n\b/iu', $after)) === 1
                || ($this->ok(preg_match('/^disponibles?+$/iu', (string) $m[0][0])) === 1
                    && $this->ok(preg_match('/\bfinanciaci[oó]n\s++$/iu', $before)) === 1)
                || (! $aboutUnit && $this->ok(preg_match('/(?:estoy|estamos|quedo|quedamos|sigo|seguimos)\s++$/iu', $before)) === 1)
                || (! $aboutUnit && $this->ok(preg_match('/^\s++para\s++(?:ayud|respond|lo\s+que|cualquier|charlar|hablar)/iu', $after)) === 1)) {
                continue;
            }

            $found[] = 'POSITIVE';
        }

        return array_values(array_unique($found));
    }

    /**
     * The copy the fact checks read: tables as "Row — Header: cell.", formatting and emoji gone, spelled numbers as
     * digits, "1 mil metros" / "2 mil m^2" as 1000 / 2000, "3 (tres)" once.
     */
    private function factsReading(string $text): string
    {
        // "por ciento" and "m^2" first: wordsToDigits would read "ciento" as 100 and "^" blocks "mil m2".
        $text = $this->wordsToDigits($this->ok(preg_replace(['/[*_~`|\p{So}\p{Sk}]/u', '/\bpor\s*+ciento\b/iu', '/\bm\s*+\^\s*+2\b/iu'], [' ', '%', 'm2'], $this->tables($text, true))) ?? $text);

        return $this->ok(preg_replace_callback(['/(\d++(?:[.,]\d++)?+)\s++mil\b(?=\s++(?:metros|m2|mts|hect))/iu', '/(\d++)\s*+\(\s*+\1\s*+\)/u'],
            fn (array $m): string => str_contains($m[0], '(') ? $m[1] : (string) ((float) $this->numberValue($m[1]) * 1000), $text)) ?? $text;
    }

    /** Lower case, compatibility forms and no accents ("Nueva Córdoba" -> "nueva cordoba", "Jardín" -> "jardin"). */
    private function fold(string $text): string
    {
        $decomposed = \Normalizer::normalize(mb_strtolower($text), \Normalizer::FORM_KD);
        if ($decomposed === false) {
            $this->broken = true;

            return mb_strtolower($text);
        }

        return $this->ok(preg_replace('/\p{Mn}++/u', '', $decomposed)) ?? $decomposed;
    }

    /** The literal $needle as a whole token of $haystack, case-insensitive ("12A" is not inside "112A" nor "12AB"). */
    private function hasWord(string $haystack, string $needle): bool
    {
        return $needle !== '' && $this->ok(preg_match('/(?<![\p{L}\p{N}])'.preg_quote($needle, '/').'(?![\p{L}\p{N}])/iu', $haystack)) === 1;
    }

    /**
     * Markdown tables: each data row also as "Header: cell." lines, so a column header reads next to its value. With
     * $rowLabels (EVP-192) the table is replaced by "Row — Header: cell." lines, so every value keeps its unit
     * ("12B — Dormitorios: 3.").
     */
    private function tables(string $text, bool $rowLabels = false): string
    {
        $rows = [];
        $plain = [];
        $header = null;
        foreach (explode("\n", $text) as $line) {
            if (substr_count($line, '|') < 2) {
                $header = null;
                $plain[] = $line;

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
                if (! $rowLabels) {
                    $rows[] = ($header[$i] ?? '').': '.$cell.'.';
                } elseif ($i > 0) {
                    $rows[] = $cells[0].' — '.($header[$i] ?? '').': '.$cell.'.';
                }
            }
        }
        if ($rowLabels) {
            return implode("\n", [...$plain, ...$rows]);
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
                if ($this->ok(preg_match('/^confirmado\b/iu', substr($text, $offset + $stem[0][1]))) === 1
                    && $this->ok(preg_match('/\bno[ \t]++(?:tengo|tenemos)[ \t]++(?:el[ \t]++)?dato[ \t]++$/iu', $before)) === 1) {
                    continue;
                }
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
        return array_map(fn (array $m): array => [$m[0], $m[1]], $this->moneyMatches($text));
    }

    /**
     * @return list<array{0: string, 1: ?string, 2: int, 3: int}> [amount, currency, offset, length]
     */
    private function moneyMatches(string $text, bool $alreadyDigits = false): array
    {
        if (! $alreadyDigits) {
            $text = $this->ok(preg_replace('/[*_~`|\p{So}\p{Sk}]/u', ' ', $text)) ?? $text;
            $text = $this->wordsToDigits($text);
        }
        $number = '(\d[\d.,]*)';
        $found = [];
        $patterns = [
            ['/(?:'.self::USD.')[ \t]*'.$number.self::SCALE.'/iu', 'USD'],
            ['/'.$number.self::SCALE.'[ \t]*(?:de[ \t]+)?(?:'.self::USD.')(?![\p{L}\p{N}]|[ \t]*\d)/iu', 'USD'],
            ['/(?:'.self::ARS.')[ \t]*'.$number.self::SCALE.'/iu', 'ARS'],
            ['/'.$number.self::SCALE.'[ \t]*(?:de[ \t]+)?(?:'.self::ARS.')(?![\p{L}\p{N}]|[ \t]*\d)/iu', 'ARS'],
        ];
        $consumed = [];
        foreach ($patterns as [$pattern, $currency]) {
            foreach ($this->matches($pattern, $text) as $m) {
                $offset = $m[1][1];
                if (isset($consumed[$offset])) {
                    continue;
                }
                $consumed[$offset] = true;
                $len = ($m[2][0] ?? '') !== '' ? ((int) $m[2][1] + strlen((string) $m[2][0]) - $offset) : strlen((string) $m[1][0]);
                $found[] = [$this->normalize((string) $m[1][0], $m[2][0] ?? null), $currency, $offset, $len];
            }
        }
        foreach ($this->matches('/(?:sale|cuesta|vale|precio|valor)[^.!?\n]{0,30}?'.$number.'[ \t]*(mil(?:lones|l[oó]n)?|k)\b/iu', $text) as $m) {
            if (! isset($consumed[$m[1][1]])) {
                $len = (int) $m[2][1] + strlen((string) $m[2][0]) - (int) $m[1][1];
                $found[] = [$this->normalize((string) $m[1][0], (string) $m[2][0]), null, $m[1][1], $len];
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
        $text = $this->ok(preg_replace('/(?<=[\d.,])[ \t]{2,}(?=(?:mil|mill[oó]n|millones)\b)/iu', ' ', $text)) ?? $text;
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
