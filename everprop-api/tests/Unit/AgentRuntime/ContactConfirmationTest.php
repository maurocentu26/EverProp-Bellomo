<?php

namespace Tests\Unit\AgentRuntime;

use App\Domain\AgentRuntime\Tools\ContactConfirmation;
use PHPUnit\Framework\TestCase;

final class ContactConfirmationTest extends TestCase
{
    public function test_only_the_exact_next_customer_text_confirms_a_sent_summary(): void
    {
        $proposal = ['epoch' => 3, 'message_id' => 10, 'sequence' => 4];
        $summary = (object) ['id' => 10, 'sequence' => 4, 'control_epoch' => 3, 'direction' => 'OUTBOUND', 'sender_type' => 'BOT', 'delivery_status' => 'SENT'];
        $input = (object) ['sequence' => 5, 'direction' => 'INBOUND', 'sender_type' => 'CONTACT', 'message_type' => 'TEXT', 'text_body' => '  CONFIRMO MIS DATOS  '];
        $this->assertTrue(ContactConfirmation::matches($proposal, $summary, $input, 3, 5));
        foreach (['sí', 'Confirmo mis datos, pero cambia mi teléfono', 'No confirmo mis datos', ''] as $text) {
            $this->assertFalse(ContactConfirmation::matches($proposal, $summary, (object) array_replace((array) $input, ['text_body' => $text]), 3, 5));
        }
        foreach (['sender_type' => 'BOT', 'direction' => 'OUTBOUND', 'message_type' => 'UNKNOWN', 'sequence' => 6] as $key => $value) {
            $this->assertFalse(ContactConfirmation::matches($proposal, $summary, (object) array_replace((array) $input, [$key => $value]), 3, 5));
        }
        $this->assertFalse(ContactConfirmation::matches($proposal, $summary, $input, 4, 5));
        foreach (['QUEUED', 'FAILED', 'CANCELLED'] as $status) {
            $this->assertFalse(ContactConfirmation::matches($proposal, (object) array_replace((array) $summary, ['delivery_status' => $status]), $input, 3, 5));
        }
    }
}
