<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ExampleTest extends TestCase
{
    public function test_the_openapi_contract_is_present(): void
    {
        self::assertFileExists(__DIR__.'/../../openapi.yaml');
    }
}
