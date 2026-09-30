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

    /** @param list<string> $expected */
    #[DataProvider('replies')]
    public function test_reply(string $text, array $expected, bool $visitRequested): void
    {
        $this->assertSame($expected, (new OutputGuard)->check($text, self::PRICES, self::KNOWLEDGE, $visitRequested));
    }
}
