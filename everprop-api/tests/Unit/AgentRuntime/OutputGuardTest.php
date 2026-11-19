<?php

namespace Tests\Unit\AgentRuntime;

use App\Domain\AgentRuntime\Coordinator\OutputGuard;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class OutputGuardTest extends TestCase
{
    private const PRICES = [['amount' => '85000.00', 'currency' => 'USD']];

    private const KNOWLEDGE = ['Financiación: 36 cuotas fijas de $ 150.000 durante la promoción.'];

    public function test_visitor_email_can_be_repeated_without_trusting_its_domain(): void
    {
        $guard = new OutputGuard;
        $visitor = ['Mi correo es qa@example.com'];
        $this->assertSame([], $guard->check('Correo: qa@example.com. ¿Confirmás tus datos?', [], [], visitorMessages: $visitor));
        foreach (['https://example.com', 'example.com', 'www.example.com', 'https://qa@example.com', 'mailto:qa@example.com', 'other@example.com', 'qa@example.com/pago', 'qa@example.com?x=1', 'qa@example.com!suffix'] as $link) {
            $this->assertContains('UNVERIFIED_LINK', $guard->check($link, [], [], visitorMessages: $visitor), $link);
        }
        $this->assertContains('UNVERIFIED_LINK', $guard->check('qa@example.com', [], []));
        $this->assertContains('PAYMENT_DATA', $guard->check('qa@example.com; alias lote.jujuy.ok', [], [], visitorMessages: $visitor));
    }

    /** @return array<string, array{string, list<string>, bool}> */
    public static function replies(): array
    {
        return [
            'exact price' => ['El lote sale USD 85.000.', [], false],
            'price with decimals' => ['Precio: US$ 85.000,00', [], false],
            'price in mil' => ['Está en 85 mil dólares.', [], false],
            'knowledge amount' => ['Hay 36 cuotas de $150.000.', [], false],
            'no money at all' => ['Tenemos 3 lotes en Jujuy de 300 m2.', [], false],
            'currency swap' => ['Sale $ 85.000.', ['UNSUPPORTED_AMOUNT'], false],
            'invented' => ['Sale USD 70.000.', ['UNSUPPORTED_AMOUNT'], false],
            'invented in mil' => ['Sale 90 mil dólares.', ['UNSUPPORTED_AMOUNT'], false],
            'bare scaled price' => ['El precio anda por 90 mil.', ['UNSUPPORTED_AMOUNT'], false],
            'spelled exact price' => ['Sale ochenta y cinco mil dólares.', [], false],
            'spelled knowledge amount' => ['Son treinta y seis cuotas de ciento cincuenta mil pesos.', [], false],
            'spelled invented' => ['El lote sale setenta mil dólares.', ['UNSUPPORTED_AMOUNT'], false],
            'spelled bare scaled price' => ['El precio anda por noventa mil.', ['UNSUPPORTED_AMOUNT'], false],
            'spelled millions' => ['Cuesta un millón doscientos mil pesos.', ['UNSUPPORTED_AMOUNT'], false],
            'spelled half million' => ['Vale medio millón de dólares.', ['UNSUPPORTED_AMOUNT'], false],
            'spelled currency swap' => ['Sale ochenta y cinco mil pesos.', ['UNSUPPORTED_AMOUNT'], false],
            'spelled counts, no money' => ['Hay dos o tres lotes, un depto de dos y tres ambientes y medio baño.', [], false],
            'confirmed visit' => ['Tu visita quedó confirmada.', ['CONFIRMATION_CLAIM'], false],
            'subjectless confirmation' => ['Perfecto, está confirmado para el jueves.', ['CONFIRMATION_CLAIM'], false],
            'programmed' => ['El jueves 10hs quedó programada tu visita.', ['CONFIRMATION_CLAIM'], false],
            'te espero' => ['Listo, te espero el jueves a las 10.', ['CONFIRMATION_CLAIM'], false],
            'reserved unit' => ['Te reservo el lote 12A.', ['CONFIRMATION_CLAIM'], false],
            'honest negation' => ['El precio no está confirmado y tu visita todavía no está confirmada: un asesor te confirma.', [], false],
            'negation in another clause' => ['No te preocupes, tu visita quedó confirmada.', ['CONFIRMATION_CLAIM'], false],
            'unrelated sin' => ['Sin problema la visita quedó confirmada.', ['CONFIRMATION_CLAIM'], false],
            'sin confirmar' => ['La visita queda sin confirmar hasta que hable un asesor que te confirma.', [], true],
            'requested visit ok' => ['Registré tu pedido; un asesor te confirma el horario.', [], true],
            'requested visit silent' => ['Genial, el jueves a las 10 entonces.', ['VISIT_NOT_MARKED_PENDING'], true],
        ];
    }

    /** @return list<array{string, string}> */
    public static function spelled(): array
    {
        return [
            ['ochenta y cinco mil dólares', '85 mil dólares'],
            ['un millón doscientos mil', '1200 mil'],
            ['un millón y medio', '1500 mil'],
            ['medio millón', '500 mil'],
            ['mil quinientos', '1500'],
            ['dieciséis cuotas', '16 cuotas'],
            ['entre dos y tres ambientes', 'entre 2 y 3 ambientes'],
            ['un lote y medio baño', 'un lote y medio baño'],
            ['85 mil y 1,2 millones', '85 mil y 1,2 millones'],
        ];
    }

    #[DataProvider('spelled')]
    public function test_words_to_digits(string $text, string $expected): void
    {
        $this->assertSame($expected, (new OutputGuard)->wordsToDigits($text));
    }

    /** @param list<string> $expected */
    #[DataProvider('replies')]
    public function test_reply(string $text, array $expected, bool $visitRequested): void
    {
        $this->assertSame($expected, (new OutputGuard)->check($text, self::PRICES, self::KNOWLEDGE, $visitRequested));
    }

    /** @return array<string, array{string, list<string>, list<string>}> */
    public static function terms(): array
    {
        $promo = ['Financiación: anticipo del 30 % y saldo en 36 cuotas fijas, plazo máximo 3 años, TNA 45 %. Contado: 10 % de descuento.'];
        $only12 = ['Promo: 12 cuotas sin interés.'];
        $withInterest = ['Financiación: 30 % de anticipo y 36 cuotas en pesos con interés.'];
        $unsupported = ['UNSUPPORTED_TERM'];

        return [
            'installments from a source' => ['Hay 36 cuotas fijas y un anticipo del 30%.', $promo, []],
            'spelled installments from a source' => ['Son treinta y seis cuotas con diez por ciento de descuento de contado.', $promo, []],
            'period in years equals months' => ['El plazo de financiación es de 36 meses.', $promo, []],
            'rate from a source' => ['La tasa es del 45 % TNA.', $promo, []],
            'term in the heading of a source' => ['Hay un plan en 48 cuotas.', ['Plan en 48 cuotas: Financiación propia en pesos.'], []],
            'interest free from a source' => ['Son 12 cuotas sin interés.', $only12, []],
            'invented installments' => ['Podés pagarlo en 60 cuotas.', $promo, $unsupported],
            'spelled invented installments' => ['Tenemos sesenta cuotas fijas.', $promo, $unsupported],
            'one of a list unsupported' => ['Hay planes de 12, 24 o 36 cuotas.', $promo, $unsupported],
            'invented discount' => ['Te hacemos un 15 % de descuento.', $promo, $unsupported],
            'spelled invented discount' => ['Te hacemos quince por ciento de descuento.', $promo, $unsupported],
            'spelled discount from a source' => ['De contado hay diez por ciento de descuento.', $promo, []],
            'invented down payment' => ['Con un anticipo del 20% lo reservás.', $promo, $unsupported],
            'invented rate' => ['La TNA es 30.', $promo, $unsupported],
            'invented interest free' => ['Son 36 cuotas sin interés.', $promo, $unsupported],
            'invented financing period' => ['Te financiamos el saldo a 5 años.', $promo, $unsupported],
            'visitor words are not evidence' => ['Sí, hay 12 cuotas.', [], $unsupported],
            'a term of another kind does not back it' => ['Se paga en 36 meses.', ['36 cuotas'], $unsupported],
            'a construction period does not back a financing one' => ['Te financiamos en 6 meses.', ['La obra se entrega en 6 meses.'], $unsupported],
            // EVP-113 review: the noun first, a period next to financing, hidden or spelled digits.
            'noun first' => ['Cuotas: 48.', $only12, $unsupported],
            'noun first after a label' => ['Cantidad de cuotas: 36.', $only12, $unsupported],
            'plan in months' => ['Plan de 60 meses.', $only12, $unsupported],
            'months interest free' => ['Hasta 60 meses sin interés.', $only12, $unsupported],
            'months with a down payment' => ['Te lo dejamos en 60 meses con el 30 % de entrega.', $only12, $unsupported],
            'months in the next sentence' => ['12 cuotas sin interés. Después, 60 meses más.', $only12, $unsupported],
            'second count after the noun' => ['En 12 cuotas sin interés o en 24, consultá.', $only12, $unsupported],
            'spelled copy in parentheses' => ['36 (treinta y seis) cuotas', $only12, $unsupported],
            'soft hyphen' => ["36 cuo\u{00AD}tas", $only12, $unsupported],
            'zero width space' => ["3\u{200B}6 cuotas", $only12, $unsupported],
            'full width digits' => ['３６ cuotas', $only12, $unsupported],
            // Percentages by kind: the same number of another kind backs nothing.
            'discount from a discount' => ['Hay un 10 % de descuento de contado.', $promo, []],
            'a down payment number is not a discount' => ['Te hacemos un 30 % de descuento.', $promo, $unsupported],
            'a rate number is not a discount' => ['Hay 45 % de descuento.', $promo, $unsupported],
            'rate as a percentage of interest' => ['Tiene 45 % de interés anual.', $promo, []],
            'progress of works backs nothing' => ['Hay un 70 % de descuento.', ['La obra tiene un 70 % de avance.'], $unsupported],
            'down payment keyword first' => ['Anticipo: 30.', $promo, []],
            'invented down payment keyword first' => ['Anticipo: 40.', $promo, $unsupported],
            'untyped percentage with the same untyped number' => ['El 30 % se abona al firmar.', ['El 30 % se abona al firmar.'], []],
            'untyped percentage is not backed by a typed one' => ['El 30 % se abona al firmar.', $promo, $unsupported],
            'untyped percentage with another number' => ['El 25 % se abona al firmar.', $promo, $unsupported],
            // Second review: common phrasings, against a source with interest and a 30 % down payment.
            'interests plural' => ['36 cuotas sin intereses.', $withInterest, $unsupported],
            'zero rate' => ['36 cuotas, tasa cero.', $withInterest, $unsupported],
            'no surcharge' => ['36 cuotas sin recargo.', $withInterest, $unsupported],
            'no down payment' => ['Sin anticipo y 36 cuotas.', $withInterest, $unsupported],
            'zero down payment' => ['Llevalo con 0 de anticipo.', $withInterest, $unsupported],
            'diminutive installments' => ['Pagalo en 36 cuotitas.', [], $unsupported],
            'adjective between' => ['Pagalo en 36 cómodas cuotas.', [], $unsupported],
            'times' => ['Pagalo en 36 veces.', [], $unsupported],
            'pay in months' => ['Lo podés abonar en 60 meses.', $withInterest, $unsupported],
            'we leave it in months' => ['Te lo dejamos en 60 meses.', $withInterest, $unsupported],
            'rest in years' => ['Abonás el 30 % y el resto en 4 años.', $withInterest, $unsupported],
            'rest in the next sentence' => ['Escriturás con el 30 %. Resto en 48 meses.', $withInterest, $unsupported],
            'balance with a bare number' => ['Anticipo 30 y saldo a 48.', $withInterest, $unsupported],
            'we finance a bare number' => ['Entregás el 30 % y financiamos 48.', $withInterest, $unsupported],
            'savings' => ['Tenés 30% de ahorro.', $withInterest, $unsupported],
            'we discount' => ['Te bonificamos el 30%.', $withInterest, $unsupported],
            'we lower' => ['Te rebajamos el 30%.', $withInterest, $unsupported],
            'promo' => ['Hay una promo del 30%.', $withInterest, $unsupported],
            'off' => ['30 % off', $withInterest, $unsupported],
            'arabic digits' => ['٣٦ cuotas', $only12, $unsupported],
            'arabic digits backed' => ['٣٦ cuotas', ['36 cuotas'], []],
            'source with interest still backs its own terms' => ['Son 36 cuotas en pesos y un anticipo del 30 %.', $withInterest, []],
            // Invisible and bidi characters are removed before the check (and from what is sent).
            'left-to-right mark' => ["Pagalo en 60\u{200E} cuotas.", $withInterest, $unsupported],
            'mark inside interest free' => ["36 cuotas sin\u{200E} interés.", $withInterest, $unsupported],
            'right-to-left override' => ["\u{202E}63\u{202C} cuotas", $withInterest, $unsupported],
            'invisible separator and grapheme joiner' => ["6\u{2063}0 cuo\u{034F}tas", $withInterest, $unsupported],
            'tag and hangul filler' => ["60\u{E0020}\u{3164}cuotas", $withInterest, $unsupported],
            // Third review: Markdown/WhatsApp formatting, symbols and tables do not split a term.
            'bold number' => ['Podés pagar en **36** cuotas.', [], $unsupported],
            'whatsapp bold' => ['*36* cuotas', [], $unsupported],
            'bold noun' => ['36 **cuotas**', [], $unsupported],
            'underscore italics' => ['_36_ cuotas', [], $unsupported],
            'code' => ['`36` cuotas', [], $unsupported],
            'strike' => ['~36~ cuotas', [], $unsupported],
            'bold label' => ['**Cuotas:** 36', [], $unsupported],
            'bold period' => ['Hasta *36* meses de financiación.', [], $unsupported],
            'bold balance' => ['Anticipo 30 y saldo a *48*.', $withInterest, $unsupported],
            'table' => ["| Plan | Cuotas |\n|---|---|\n| A | 36 |", [], $unsupported],
            'table backed by a source' => ["| Plan | Cuotas |\n|---|---|\n| A | 36 |", ['Financiación en 36 cuotas.'], []],
            'emoji between' => ['36 💳 cuotas', [], $unsupported],
            'hyphen' => ['36-cuotas', [], $unsupported],
            'formatted reply backed by a plain source' => ['Anticipo del *30 %* y saldo en *36* cuotas.', ['Anticipo del 30 % y saldo en 36 cuotas.'], []],
            // Keycaps, homoglyph percent signs and Roman numerals.
            'keycaps' => ['3️⃣6️⃣ cuotas', [], $unsupported],
            'keycaps backed' => ['3️⃣6️⃣ cuotas', ['36 cuotas'], []],
            'arabic percent' => ['30٪ de descuento', $withInterest, $unsupported],
            'roman numerals' => ['XXXVI cuotas', [], $unsupported],
            'roman numerals backed' => ['XXXVI cuotas', ['36 cuotas'], []],
            'roman numeral sign' => ['Ⅻ cuotas', $withInterest, $unsupported],
            // Common phrasings of zero interest or down payment, and other installment forms.
            'no financial cost' => ['36 cuotas sin costo financiero.', $withInterest, $unsupported],
            'they have no interest' => ['Las 36 cuotas no tienen interés.', $withInterest, $unsupported],
            'free of interest' => ['36 cuotas libres de interés.', $withInterest, $unsupported],
            'no down payment needed' => ['No hace falta anticipo: 36 cuotas.', $withInterest, $unsupported],
            'abbreviation backed' => ['Pagalo en 36 ctas.', $withInterest, []],
            'abbreviation invented' => ['Pagalo en 60 ctas.', $withInterest, $unsupported],
            'times sign' => ['Pagalo x60.', $withInterest, $unsupported],
            'times without en' => ['Pagalo 60 veces.', $withInterest, $unsupported],
            // Not terms (these used to hand off).
            'progress of works' => ['La obra tiene un 70 % de avance.', [], []],
            'share of units sold' => ['El 80 % de las unidades ya se vendieron.', [], []],
            'age of a company' => ['Financiación propia: la desarrolladora tiene 25 años de trayectoria.', [], []],
            'monthly is not financing' => ['Te mandamos novedades mensualmente durante 2 años.', [], []],
            'handover after installments' => ['Hay 36 cuotas. La obra se entrega en 24 meses.', ['36 cuotas'], []],
            'handover year' => ['Entrega 2027, 36 cuotas.', ['36 cuotas'], []],
            // Customer and turn data that is not a commercial term.
            'visitor phone' => ['Te llamamos al 388 555-0101 o al 0388 15 412-3456.', [], []],
            'unit codes' => ['Tenemos el 12, el 12A y el 12B disponibles.', [], []],
            'visit date' => ['Pediste la visita para el 12 de marzo a las 10; un asesor te confirma.', [], []],
            'surfaces' => ['El 12A tiene 300 m² y el 12B 450 m2, con 2 dormitorios.', [], []],
            'construction period' => ['La obra se entrega en 6 meses.', [], []],
            'age is not a payment period' => ['El barrio tiene 2 años y ya cuenta con 3 plazas.', [], []],
            'installments priced by a source' => ['Hay 36 cuotas fijas de $ 150.000.', ['36 cuotas fijas de $ 150.000'], []],
        ];
    }

    /**
     * @param  list<string>  $knowledge
     * @param  list<string>  $expected
     */
    #[DataProvider('terms')]
    public function test_commercial_terms_need_the_same_pair_in_approved_knowledge(string $reply, array $knowledge, array $expected): void
    {
        $visitor = ['¿Tienen 12 cuotas? Mi teléfono es 388 555-0101 y quiero ver el 12A el 12 de marzo.'];
        $this->assertSame($expected, (new OutputGuard)->check($reply, [], $knowledge, visitorMessages: $visitor));
    }

    public function test_the_visitors_request_backs_terms_only_when_passed_as_requested(): void
    {
        $guard = new OutputGuard;
        $visitor = ['Quiero pagar en 36 cuotas con USD 20.000 de anticipo.'];
        $summary = 'Consulta: "pagar en 36 cuotas con USD 20.000 de anticipo"';
        $this->assertSame([], $guard->check($summary, [], [], visitorMessages: $visitor, requested: $visitor));
        $this->assertSame(['UNSUPPORTED_AMOUNT', 'UNSUPPORTED_TERM'], $guard->check($summary, [], [], visitorMessages: $visitor));
        $this->assertSame(['UNSUPPORTED_TERM'], $guard->check('Consulta: "Te ofrecemos 60 cuotas"', [], [], visitorMessages: $visitor, requested: $visitor));
    }

    public function test_long_number_lists_cannot_make_the_guard_fail_open(): void
    {
        // Without possessive quantifiers PCRE gave up on these lists, preg_match_all returned false and nothing was checked.
        $guard = new OutputGuard;
        $this->assertSame(['UNSUPPORTED_TERM'], $guard->check(implode(',', range(1, 30)).', 60 cuotas', [], []));
        $this->assertSame(['UNSUPPORTED_TERM'], $guard->check(implode(', ', range(1, 30)).' y 60 cuotas', [], []));
        $terms = '36 cuotas, 30% de descuento, 48 meses de financiación, 45 % TEA';
        $this->assertSame([], $guard->check($terms, [], [$terms]));
        $this->assertSame(['UNSUPPORTED_TERM'], $guard->check(str_repeat('1,', 26).' '.$terms, [], [$terms]));
    }

    public function test_digit_tricks_and_homoglyphs_in_the_reply_fail_closed(): void
    {
        foreach (["3\u{0332}6\u{0332} cuotas", "3\u{0301}6 cuotas", "3\u{202F}6 cuotas", '36 cuоtas', '36 cuοtas'] as $text) {
            $this->assertContains('GUARD_ERROR', (new OutputGuard)->check($text, [], ['36 cuotas']), $text);
        }
        // Only the text to send is strict: evidence with a non-breaking space or a Greek letter does not block.
        $this->assertSame([], (new OutputGuard)->check('Hay 36 cuotas.', [], ["36 cuotas de USD 1\u{00A0}000, 5 μm"]));
    }

    public function test_a_failing_regex_fails_closed(): void
    {
        $this->assertContains('GUARD_ERROR', (new OutputGuard)->check("Hay 36 cuotas \xff", [], ['Hay 36 cuotas']));
        $limit = (string) ini_get('pcre.backtrack_limit');
        $jit = (string) ini_get('pcre.jit');
        ini_set('pcre.jit', '0');
        ini_set('pcre.backtrack_limit', '1');
        try {
            $this->assertContains('GUARD_ERROR', (new OutputGuard)->check('Hay 36 cuotas fijas, visitá https://x.example.com', [], ['Hay 36 cuotas fijas']));
        } finally {
            ini_set('pcre.backtrack_limit', $limit);
            ini_set('pcre.jit', $jit);
        }
    }

    /** @return array<string, array{string, string, list<string>, bool}> */
    public static function citations(): array
    {
        $a = '5f0c2b7e-0000-4000-8000-000000000001#0';
        $b = '5f0c2b7e-0000-4000-8000-000000000002#3';

        return [
            'alias' => ['Hay 36 cuotas [fuente: F1].', 'Hay 36 cuotas.', [$a], false],
            'several, lower case, spaced' => ['Hay promo [ Fuente :  f1, F2 ] y anticipo.', 'Hay promo y anticipo.', [$a, $b], false],
            'long id in upper case, plural, parentheses' => ['Ver condiciones (fuentes: '.strtoupper($b).')', 'Ver condiciones', [$b], false],
            'at the start and repeated' => ['[fuente: F1] Hay promo [fuente: F1].', 'Hay promo.', [$a], false],
            'nested' => ['Hay promo [fuente: [fuente: F1]].', 'Hay promo.', [$a], false],
            'bold leftovers' => ['Hay promo **[fuente: F1]**.', 'Hay promo.', [$a], false],
            'full width' => ['Hay promo ［ｆｕｅｎｔｅ： Ｆ１］.', 'Hay promo.', [$a], false],
            'cut open at the end' => ['Hay promo [fuente: F2', 'Hay promo', [$b], false],
            'alias not in this turn' => ['Hay promo [fuente: F3].', 'Hay promo.', [], true],
            'id of another source' => ['Hay promo [fuente: 5f0c2b7e-0000-4000-8000-000000000999#0].', 'Hay promo.', [], true],
            'no marks' => ['Hay promo (ver condiciones).', 'Hay promo (ver condiciones).', [], false],
            // Second review: other shapes of a mark, and the original characters are what is sent.
            'without colon' => ['Hay promo [fuente F1].', 'Hay promo.', [$a], false],
            'in english' => ['Hay promo [source: F1].', 'Hay promo.', [$a], false],
            'italics' => ['Hay promo *[fuente: F1]*.', 'Hay promo.', [$a], false],
            'bare alias' => ['Hay promo [F1].', 'Hay promo.', [$a], false],
            'emphasis inside a sentence stays' => ['**36 cuotas** [fuente: F1].', '**36 cuotas**.', [$a], false],
            'ordinary brackets stay' => ['La plaza [fuente de agua] y el SUM.', 'La plaza [fuente de agua] y el SUM.', [], false],
            'original characters are sent' => ['El lote tiene 300 m² y está en el 3º piso [fuente: F1].', 'El lote tiene 300 m² y está en el 3º piso.', [$a], false],
            'invisible characters go, emoji stay' => ["Pagalo en 60\u{200E} cuotas 👍🏽 👨\u{200D}👩\u{200D}👧", 'Pagalo en 60 cuotas 👍🏽 👨‍👩‍👧', [], false],
            'marker left in the text is not a mark' => ['Fuente: el reglamento.', 'Fuente: el reglamento.', [], false],
        ];
    }

    /** @return list<array{string}> */
    public static function dirty(): array
    {
        return [['Consulta (**[fuente: F1]**)'], ['[** **]'], ['[fuente[]: F1]'], ['Hay promo **[fuente: [F1]]** y más ( ).']];
    }

    #[DataProvider('dirty')]
    public function test_cleaning_a_clean_text_changes_nothing(string $text): void
    {
        $guard = new OutputGuard;
        $clean = $guard->citations($text)[0];
        $this->assertSame($clean, $guard->citations($clean)[0]);
        $this->assertStringNotContainsString('fuente', $clean);
    }

    public function test_leftover_marks_and_source_ids_fail_closed_but_ordinary_text_does_not(): void
    {
        $guard = new OutputGuard;
        $sources = ['5f0c2b7e-0000-4000-8000-000000000001#0'];
        foreach (['Fuente: F1', 'fuentes: 5f0c2b7e-0000-4000-8000-000000000999', 'Fuente: #3', 'Ver 5F0C2B7E-0000-4000-8000-000000000001.',
            'Ver ５f0c2b7e-0000-4000-8000-000000000001#0'] as $text) {
            $this->assertTrue($guard->leftover($text, $sources), $text);
        }
        foreach (['Fuente: Instagram', 'Residencia La Fuente: 2 amb', 'Hay promo.'] as $text) {
            $this->assertFalse($guard->leftover($text, $sources), $text);
        }
    }

    public function test_notes_that_read_as_an_offer_are_commitments(): void
    {
        $guard = new OutputGuard;
        foreach (['Acordamos 50 % de descuento', 'Te ofrecemos 36 cuotas', 'precio final USD 50.000', 'Te dejamos el lote reservado',
            'Le corresponden 36 cuotas sin interés, confirmadas', 'Condición vigente: 36 cuotas', 'Aplica 30 % de descuento', 'Incluye 36 cuotas sin interés'] as $text) {
            $this->assertTrue($guard->commits($text), $text);
        }
        $this->assertFalse($guard->commits('quiere pagar en 36 cuotas'));
        $this->assertTrue($guard->asks('Quiere pagar en 36 cuotas'));
        $this->assertTrue($guard->asks('¿Hay 36 cuotas?'));
        $this->assertFalse($guard->asks('pagar en 36 cuotas'));
    }

    /** @param list<string> $cited */
    #[DataProvider('citations')]
    public function test_citation_marks_are_removed_and_resolved_against_the_turn_sources(string $text, string $clean, array $cited, bool $unknown): void
    {
        $sources = ['5f0c2b7e-0000-4000-8000-000000000001#0', '5f0c2b7e-0000-4000-8000-000000000002#3'];
        $this->assertSame([$clean, $cited, $unknown], (new OutputGuard)->citations($text, $sources));
    }

    /** @return array<string, array{string, list<string>}> */
    public static function linksAndPayments(): array
    {
        return [
            'link from an approved source' => ['Mirá el masterplan en https://www.bellomo-sintetico.com.ar/huasi', []],
            'bare domain from a source' => ['Escribinos o entrá a bellomo-sintetico.com.ar', []],
            'invented link' => ['Para reservar entrá a https://pago-lote.xyz/seña', ['UNVERIFIED_LINK']],
            'invented bare domain' => ['Pagá en reservas-jujuy.site', ['UNVERIFIED_LINK']],
            'invented alias' => ['Transferí la seña al alias lote.jujuy.ok', ['PAYMENT_DATA']],
            'invented cbu' => ['CBU 0000003100012345678901 a nombre de Juan', ['PAYMENT_DATA']],
            'approved alias' => ['Podés transferir al alias bellomo.cobranzas.oficial', []],
            'approved cbu with spaces' => ['El CBU es 0170 0991 2000 0012 3456 78', []],
            'prices are not payment data' => ['La cuota es de $ 150.000.', []],
            'no links' => ['Te paso fotos por acá.', []],
        ];
    }

    /** @param list<string> $expected */
    #[DataProvider('linksAndPayments')]
    public function test_links_and_payment_data_only_repeat_approved_sources(string $reply, array $expected): void
    {
        $knowledge = [...self::KNOWLEDGE, 'Sitio: https://www.bellomo-sintetico.com.ar/huasi y bellomo-sintetico.com.ar. '
            .'Cobranzas: alias bellomo.cobranzas.oficial, CBU 0170099120000012345678.'];

        $this->assertSame($expected, (new OutputGuard)->check($reply, self::PRICES, $knowledge));
    }
}
