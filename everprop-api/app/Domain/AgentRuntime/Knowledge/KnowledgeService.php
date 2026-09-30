<?php

namespace App\Domain\AgentRuntime\Knowledge;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * S09. Tenant knowledge (FAQs, promotions, financing, process) for the lexical RAG of the pilot
 * (ADR D05: MySQL FULLTEXT, no vector store). Only APPROVED, non-revoked, non-expired documents of
 * the run's tenant and audience are retrievable. Promotions are documents with valid_until.
 * Live inventory (prices, availability) never comes from here: it comes from the tools.
 */
final class KnowledgeService
{
    private const CHUNK_CHARS = 900;

    /** @param array{title: string, body: string, audience?: string, valid_until?: ?string} $data */
    public function create(int $tenantId, int $userId, array $data): string
    {
        $publicId = (string) Str::uuid();
        DB::table('knowledge_documents')->insert([
            'tenant_id' => $tenantId, 'public_id' => $publicId, 'title' => $data['title'], 'body' => $data['body'],
            'audience' => $data['audience'] ?? 'PUBLIC', 'status' => 'DRAFT', 'created_by_user_id' => $userId,
            'valid_until' => isset($data['valid_until']) ? CarbonImmutable::parse($data['valid_until'])->utc()->format('Y-m-d H:i:s.v') : null,
        ]);

        return $publicId;
    }

    /** Approving (re)chunks the current version inside one transaction. */
    public function approve(int $tenantId, string $publicId, int $userId): bool
    {
        return DB::transaction(function () use ($tenantId, $publicId, $userId): bool {
            $doc = DB::table('knowledge_documents')->where('tenant_id', $tenantId)->where('public_id', $publicId)->lockForUpdate()->first();
            if ($doc === null || $doc->status === 'REVOKED') {
                return false;
            }
            DB::table('knowledge_chunks')->where('tenant_id', $tenantId)->where('document_id', $doc->id)->where('document_version', $doc->version)->delete();
            foreach ($this->chunks((string) $doc->body) as $i => [$heading, $text]) {
                DB::table('knowledge_chunks')->insert([
                    'tenant_id' => $tenantId, 'document_id' => $doc->id, 'document_version' => $doc->version, 'ordinal' => $i,
                    'heading' => $heading === null ? $doc->title : mb_substr($doc->title.' — '.$heading, 0, 255), 'body' => $text,
                ]);
            }
            DB::table('knowledge_documents')->where('tenant_id', $tenantId)->where('id', $doc->id)->update([
                'status' => 'APPROVED', 'approved_by_user_id' => $userId, 'approved_at' => now(),
            ]);

            return true;
        });
    }

    public function revoke(int $tenantId, string $publicId): bool
    {
        return DB::table('knowledge_documents')->where('tenant_id', $tenantId)->where('public_id', $publicId)
            ->update(['status' => 'REVOKED', 'revoked_at' => now()]) > 0;
    }

    /**
     * @param  list<string>  $audiences
     * @return list<array{source_id: string, title: string, excerpt: string, valid_until: ?string}>
     */
    public function search(int $tenantId, string $query, array $audiences = ['PUBLIC'], int $limit = 4): array
    {
        // Natural-language mode: no boolean operators from user text reach the parser.
        $terms = trim((string) preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', mb_substr($query, 0, 300)));
        if (mb_strlen($terms) < 3) {
            return [];
        }

        $rows = DB::table('knowledge_chunks as c')
            ->join('knowledge_documents as d', fn ($j) => $j->on('d.id', '=', 'c.document_id')->on('d.tenant_id', '=', 'c.tenant_id')
                ->on('d.version', '=', 'c.document_version'))
            ->where('c.tenant_id', $tenantId)
            ->where('d.status', 'APPROVED')->whereNull('d.revoked_at')->whereIn('d.audience', $audiences)
            ->where(fn ($q) => $q->whereNull('d.valid_until')->orWhere('d.valid_until', '>', now()))
            ->whereRaw('MATCH(c.heading, c.body) AGAINST (? IN NATURAL LANGUAGE MODE) > 0', [$terms])
            ->orderByRaw('MATCH(c.heading, c.body) AGAINST (? IN NATURAL LANGUAGE MODE) DESC', [$terms])
            ->limit($limit)
            ->get(['d.public_id', 'c.ordinal', 'c.heading', 'c.body', 'd.valid_until']);

        return $rows->map(fn ($r) => [
            'source_id' => $r->public_id.'#'.$r->ordinal,
            'title' => (string) $r->heading,
            'excerpt' => (string) $r->body,
            'valid_until' => $r->valid_until === null ? null : CarbonImmutable::parse($r->valid_until, 'UTC')->toDateString(),
        ])->values()->all();
    }

    /** @return list<array{0: ?string, 1: string}> [heading, text] by markdown headings and paragraphs */
    public function chunks(string $body): array
    {
        $chunks = [];
        $heading = null;
        $buffer = '';
        $flush = function () use (&$chunks, &$heading, &$buffer): void {
            if (trim($buffer) !== '') {
                $chunks[] = [$heading, trim($buffer)];
            }
            $buffer = '';
        };
        foreach (preg_split('/\R{2,}/', str_replace("\r\n", "\n", $body)) ?: [] as $block) {
            $block = trim($block);
            if (preg_match('/^#{1,6}\s+(.+)$/m', $block, $m) === 1 && str_starts_with($block, '#')) {
                $flush();
                $heading = mb_substr(trim($m[1]), 0, 200);
                $block = trim((string) preg_replace('/^#{1,6}\s+.+$/m', '', $block, 1));
            }
            if ($block === '') {
                continue;
            }
            if (mb_strlen($buffer) + mb_strlen($block) > self::CHUNK_CHARS) {
                $flush();
            }
            foreach (mb_str_split($block, self::CHUNK_CHARS) as $piece) {
                if (mb_strlen($buffer) + mb_strlen($piece) > self::CHUNK_CHARS) {
                    $flush();
                }
                $buffer .= ($buffer === '' ? '' : "\n\n").$piece;
            }
        }
        $flush();

        return $chunks;
    }
}
