<?php

namespace Tests\Unit\AgentRuntime;

use App\Domain\AgentRuntime\Tools\UnitSelection;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class UnitSelectionTest extends TestCase
{
    #[DataProvider('references')]
    public function test_suffixes_preserve_the_explicit_reference(string $message, string $code, bool $conflict): void
    {
        $this->assertSame($conflict, UnitSelection::conflicts($message, $code));
    }

    /** @return list<array{string, string, bool}> */
    public static function references(): array
    {
        return [
            ['el 17 a nombre mío', '17A', true],
            ['precio de la unidad 17 a pagar en dólares', '17A', true],
            ['el 17 b sería otra unidad', '17B', true],
            ['el 17', '17', false],
            ['el 17A', '17', true],
            ['el 17A', '17B', true],
            ['el 17a', '17A', false],
            ['el L-17 a pagar en cuotas', 'L-17A', true],
            ['el L-17A', 'L-17A', false],
            ['no el 17A, quiero el 17', '17A', true],
            ['no el 17A, quiero el 17', '17', false],
            ['compará el 17 y el 17A', '17A', false],
            ['compará el 17 y el 17A', '17', false],
            ['la unidad 117', '17A', false],
            ['12 cuotas para el 17A', '17A', false],
            ['¿y cuánto sale?', '17A', false],
            ['el 17A', '17A ', false],
            ['Compará el 17 y 17A', '17A', false],
            ['No quiero la 17A, mostrame otras opciones', '17A', true],
            ['No quiero la 17A, mostrame otras opciones', '17', false],
            ['Busco para el 2027', '17A', false],
        ];
    }
}
