<?php

namespace Tests\Unit\AgentRuntime;

use App\Domain\AgentRuntime\Coordinator\OutputGuard;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class OutputGuardTest extends TestCase
{
    private const PRICES = [['amount' => '85000.00', 'currency' => 'USD']];

    private const KNOWLEDGE = ['Financiación: 36 cuotas fijas de $ 150.000 durante la promoción.'];

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

    /** @return array<string, array{string, string}> */
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
}
