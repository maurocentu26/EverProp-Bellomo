<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** S04 inbox search: contact name/email/phone or thread text, inside what the user may already list. */
final class ConversationSearchTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false]);
    }

    private function customer(Tenant $tenant, string $phoneNumberId, string $from, string $name, string $text): string
    {
        $this->postWebhook($this->waPayload($phoneNumberId, [$this->waText('wamid.'.Str::random(8), $text, $from)]))->assertOk();
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->where('provider_thread_id', 'wa:'.$from)->first(['public_id', 'contact_id']);
        DB::table('contacts')->where('id', $row->contact_id)->update(['display_name' => $name]);

        return (string) $row->public_id;
    }

    /** @return list<string> */
    private function search(User $user, Tenant $tenant, string $q): array
    {
        return $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/admin/conversations?'.http_build_query(['q' => $q]))->assertOk()->json('data.*.id');
    }

    public function test_finds_by_name_phone_email_and_thread_text_inside_the_tenant(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-SEARCH');
        $lote = $this->customer($tenant, 'PN-SEARCH', '5493811234567', 'Ana Gómez', 'Busco el lote 12B');
        $martinez = $this->customer($tenant, 'PN-SEARCH', '5493817654321', 'Julián Martínez', 'Hola');
        DB::table('contacts')->where('display_name', 'Julián Martínez')->update(['email' => 'julian@example.test']);
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        app(ConversationControl::class)->addNote($tenant->id, (int) DB::table('conversations')->where('public_id', $martinez)->value('id'),
            $manager, 'Quiere financiación en pesos', 'note-key-search-001');

        // Another tenant with the same words, name and phone stays invisible.
        ['tenant' => $other, 'integration' => $otherIntegration] = $this->tenantWithIntegration();
        $this->whatsappChannel($other->id, $otherIntegration, 'PN-SEARCH-OTHER');
        $twin = $this->customer($other, 'PN-SEARCH-OTHER', '5493811234567', 'Ana Gómez', 'Busco el lote 12B');
        DB::table('contacts')->where('tenant_id', $other->id)->update(['email' => 'julian@example.test']);
        app(ConversationControl::class)->addNote($other->id, (int) DB::table('conversations')->where('public_id', $twin)->value('id'),
            $this->user($other, RoleCode::SALES_MANAGER), 'Quiere financiación en pesos', 'note-key-search-002');

        $this->assertSame([$lote], $this->search($manager, $tenant, 'LOTE 12b'), 'case insensitive thread text');
        $this->assertSame([$martinez], $this->search($manager, $tenant, 'martinez'), 'accent insensitive name');
        $this->assertSame([$lote], $this->search($manager, $tenant, '381 123-4567'), 'phone digits in any format');
        $this->assertSame([$martinez], $this->search($manager, $tenant, 'julian@'), 'email');
        $this->assertSame([$martinez], $this->search($manager, $tenant, 'financiación'), 'team note');
        $this->assertSame([], $this->search($manager, $tenant, '%%'), 'LIKE wildcards are literal');
        $this->assertSame([], $this->search($manager, $tenant, 'lote_12B'), 'underscore is literal too');
        $this->assertSame([], $this->search($manager, $tenant, 'lote\\'), 'a trailing backslash neither breaks nor widens');
        $this->assertSame([], $this->search($manager, $tenant, 'lote 4567'), 'digits inside words are not a phone search');
        $this->assertSame([$martinez], $this->search($this->user($tenant, RoleCode::READ_ONLY), $tenant, 'financiación'), 'read-only lists what it can read');
        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/conversations?q=a')->assertUnprocessable();
    }

    public function test_an_advisor_only_finds_what_the_inbox_already_shows_them(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-ADV');
        $mine = $this->customer($tenant, 'PN-ADV', '5493810000011', 'Cliente Uno', 'Consulta por el lote 7');
        $theirs = $this->customer($tenant, 'PN-ADV', '5493810000022', 'Cliente Dos', 'Consulta por el lote 8');
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        DB::table('conversations')->where('public_id', $mine)->update(['control_state' => 'HUMAN_ACTIVE', 'assigned_user_id' => $advisor->id]);
        DB::table('conversations')->where('public_id', $theirs)->update(['control_state' => 'HUMAN_ACTIVE', 'assigned_user_id' => $this->user($tenant, RoleCode::SALES_ADVISOR)->id]);

        app(ConversationControl::class)->addNote($tenant->id, (int) DB::table('conversations')->where('public_id', $theirs)->value('id'),
            $this->user($tenant, RoleCode::SALES_MANAGER), 'Cliente Dos pidió descuento', 'note-key-search-003');

        $this->assertSame([$mine], $this->search($advisor, $tenant, 'consulta por el lote'));
        $this->assertSame([], $this->search($advisor, $tenant, 'pidió descuento'), "another advisor's note stays out of reach");
    }
}
