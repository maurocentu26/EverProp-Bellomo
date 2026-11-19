<?php

namespace App\Domain\AgentRuntime\Knowledge;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Normalizer;

/**
 * S09. Tenant knowledge (FAQs, promotions, financing, process) for the lexical RAG of the pilot
 * (ADR D06: lexical over MySQL, no vector store; ranking in PHP, see search()). Only APPROVED, non-revoked, non-expired
 * documents of the run's tenant and audience are retrievable. Promotions are documents with valid_until.
 * Live inventory (prices, availability) never comes from here: it comes from the tools.
 */
final class KnowledgeService
{
    private const CHUNK_CHARS = 900;

    /** Distinct query terms per search, newest message first: bounds the CPU a visitor can spend. */
    private const MAX_TERMS = 12;

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

    /**
     * Approving (re)chunks the current version inside one transaction, within the tenant's chunk quota
     * (agent.knowledge_max_chunks, the same cap search() reads): over it, a 422 with a clear message.
     */
    public function approve(int $tenantId, string $publicId, int $userId): bool
    {
        return DB::transaction(function () use ($tenantId, $publicId, $userId): bool {
            // Tenant row first: two concurrent approvals of one tenant cannot both pass the quota check.
            DB::table('tenants')->where('id', $tenantId)->lockForUpdate()->first();
            $doc = DB::table('knowledge_documents')->where('tenant_id', $tenantId)->where('public_id', $publicId)->lockForUpdate()->first();
            if ($doc === null || $doc->status === 'REVOKED') {
                return false;
            }
            $chunks = $this->chunks((string) $doc->body);
            $max = (int) config('agent.knowledge_max_chunks');
            $approved = DB::table('knowledge_chunks as c')
                ->join('knowledge_documents as d', fn ($j) => $j->on('d.id', '=', 'c.document_id')->on('d.tenant_id', '=', 'c.tenant_id')
                    ->on('d.version', '=', 'c.document_version'))
                ->where('c.tenant_id', $tenantId)->where('d.status', 'APPROVED')->whereNull('d.revoked_at')->where('d.id', '!=', $doc->id)->count();
            if ($approved + count($chunks) > $max) {
                throw ValidationException::withMessages(['document' => "El conocimiento aprobado superaría el máximo de $max fragmentos: revocá documentos que ya no se usen o acortá este."]);
            }
            DB::table('knowledge_chunks')->where('tenant_id', $tenantId)->where('document_id', $doc->id)->where('document_version', $doc->version)->delete();
            foreach ($chunks as $i => [$heading, $text]) {
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
     * $query is the client's newest message; $previous the one before (follow-ups like "¿y en cuotas?"). Both share
     * 300 characters, newest first. Terms of the new message weigh in full, the previous one's at half, and the new
     * message's hits break ties. If the new message names a project of the tenant, the previous message is dropped and
     * that name counts double: a new topic is never displaced by the old one ("¿y el Pinar?" after "Arenales").
     *
     * @param  list<string>  $audiences
     * @return list<array{source_id: string, title: string, excerpt: string, valid_until: ?string}>
     */
    public function search(int $tenantId, string $query, array $audiences = ['PUBLIC'], int $limit = 4, string $previous = ''): array
    {
        $query = mb_substr($query, 0, 300);
        $new = $this->terms($query);
        $old = array_values(array_diff($this->terms(mb_substr($previous, 0, max(0, 300 - mb_strlen($query)))), $new));
        // Words naming exactly one project of the tenant ("Huasi Sintético" and "Torre Sintética" share "sintetico").
        $names = array_count_values(array_merge([], ...DB::table('projects')->where('tenant_id', $tenantId)->whereNull('deleted_at')->pluck('name')
            ->map(fn ($n): array => array_keys($this->words((string) $n)))->all()));
        $topics = array_map('strval', array_keys(array_filter($names, fn (int $n): bool => $n === 1)));
        if (array_intersect($new, $topics) !== []) {
            $old = [];
        }
        $terms = array_slice([...$new, ...$old], 0, self::MAX_TERMS);
        if ($terms === []) {
            return [];
        }
        $boost = array_map(fn (string $t): float => match (true) {
            ! in_array($t, $new, true) => 0.5,
            in_array($t, $topics, true) => 2.0,
            default => 1.0,
        }, $terms);
        $forms = array_map($this->forms(...), $terms);

        // EVERY approved, current chunk of the tenant and audience is ranked before anything is cut. No MATCH: InnoDB's
        // relevance is IDF over all tenants' rows (a word common elsewhere sinks this tenant's right chunk) and, measured
        // over 2,000 chunks with common terms (EVP-114 report), MATCH itself costs more than reading the tenant's rows
        // and ranking them here. ponytail: linear in the tenant's corpus, hard-capped at the approval quota
        // (agent.knowledge_max_chunks); past it, a FULLTEXT prefilter on rare terms or cached per-term frequencies.
        $max = (int) config('agent.knowledge_max_chunks');
        $rows = DB::table('knowledge_chunks as c')
            ->join('knowledge_documents as d', fn ($j) => $j->on('d.id', '=', 'c.document_id')->on('d.tenant_id', '=', 'c.tenant_id')
                ->on('d.version', '=', 'c.document_version'))
            ->where('c.tenant_id', $tenantId)
            ->where('d.status', 'APPROVED')->whereNull('d.revoked_at')->whereIn('d.audience', $audiences)
            ->where(fn ($q) => $q->whereNull('d.valid_until')->orWhere('d.valid_until', '>', now()))
            ->orderBy('c.id')->limit($max)
            ->get(['d.public_id', 'c.ordinal', 'c.heading', 'c.body', 'd.valid_until'])->all();
        if (count($rows) >= $max) {
            Log::warning('knowledge.search.cap_reached', ['tenant_id' => $tenantId, 'cap' => $max]);
        }
        $total = count($rows);
        // Whole words only ("casa" is not "casamientos"), any simple plural form, case and accents ignored: one literal
        // regex per term (at most MAX_TERMS) on the NFKC text. Measured over 2,000 chunks, 12 terms: 11 ms, against
        // 38 ms to fold and split every chunk into a word set (EVP-114 report).
        $accents = ['a' => '[aá]', 'e' => '[eé]', 'i' => '[ií]', 'o' => '[oó]', 'u' => '[uúü]', 'n' => '[nñ]'];
        $patterns = array_map(fn (array $f): string => '/(?<![\p{L}\p{N}])(?:'.strtr(implode('|', array_map(fn (string $w): string => preg_quote($w, '/'), $f)), $accents)
            .')(?![\p{L}\p{N}])/iu', $forms);
        $rows = array_values(array_filter($rows, function ($r) use ($patterns): bool {
            $r->has = $this->has($patterns, $this->nfkc($r->heading.' '.$r->body));
            $r->inHeading = count(array_filter($this->has($patterns, $this->nfkc((string) $r->heading))));

            return in_array(true, $r->has, true);
        }));
        // Rare terms in THIS tenant's knowledge weigh more: idf = ln(1 + chunks / chunks with the term).
        $weights = array_map(fn (int $i): float => $boost[$i] * log(1 + $total / max(1, count(array_filter(array_column($rows, 'has'), fn (array $h): bool => $h[$i])))), array_keys($terms));
        foreach ($rows as $r) {
            $r->score = round(array_sum(array_map(fn (bool $has, float $w): float => $has ? $w : 0.0, $r->has, $weights)), 6);
            $r->fresh = round(array_sum(array_map(fn (bool $has, float $w, float $b): float => $has && $b >= 1.0 ? $w : 0.0, $r->has, $weights, $boost)), 6);
        }
        // Score, then the new message's hits, then heading hits; deterministic tie-break by document and position.
        array_multisort(array_column($rows, 'score'), SORT_DESC, array_column($rows, 'fresh'), SORT_DESC, array_column($rows, 'inHeading'), SORT_DESC,
            array_column($rows, 'public_id'), array_column($rows, 'ordinal'), $rows);

        return array_map(fn ($r) => [
            'source_id' => $r->public_id.'#'.$r->ordinal,
            'title' => (string) $r->heading,
            'excerpt' => (string) $r->body,
            'valid_until' => $r->valid_until === null ? null : CarbonImmutable::parse($r->valid_until, 'UTC')->toDateString(),
        ], array_slice($rows, 0, $limit));
    }

    /** @return list<string> folded query terms (>= 4 chars, deduplicated, in order of appearance) */
    private function terms(string $text): array
    {
        $stop = ['para', 'como', 'tiene', 'tienen', 'tenes', 'alguna', 'algun', 'esta', 'este', 'donde', 'cuando', 'sobre', 'hola', 'quiero', 'saber'];

        return array_values(array_filter(array_map('strval', array_keys($this->words($text))), fn (string $w): bool => mb_strlen($w) >= 4 && ! in_array($w, $stop, true)));
    }

    /** @return list<string> a folded term and its simple plural or singular (cuota/cuotas, financiacion/financiaciones) */
    private function forms(string $word): array
    {
        $forms = [$word, $word.(in_array(substr($word, -1), ['a', 'e', 'i', 'o', 'u'], true) ? 's' : 'es')];
        if (in_array(substr($word, -2), ['as', 'es', 'is', 'os', 'us'], true)) {
            $forms[] = substr($word, 0, -1);
        }
        if (strlen($word) > 3 && str_ends_with($word, 'es') && in_array($word[-3], ['d', 'l', 'n', 'r', 's', 'j', 'y', 'z'], true)) {
            $forms[] = substr($word, 0, -2);
        }

        return $forms;
    }

    /**
     * Set of words of a text, folded: lower case, compatibility forms (NFKD: "ﬁ" -> "fi", full-width -> ASCII) and no
     * accents ("Financiación" -> "financiacion", "ñ" -> "n"). Keys keep first-seen order.
     *
     * @return array<string, int>
     */
    private function words(string $text): array
    {
        $plain = $this->checked(preg_replace('/\p{Mn}+/u', '', (string) $this->checked(Normalizer::normalize(mb_strtolower($text), Normalizer::FORM_KD), '')), '');
        $words = $this->checked(preg_split('/[^\p{L}\p{N}]+/u', (string) $plain, -1, PREG_SPLIT_NO_EMPTY), []);

        return array_flip(array_map('strval', (array) $words));
    }

    /**
     * @param  list<string>  $patterns  one whole-word regex per query term
     * @return list<bool> whether the text has each term
     */
    private function has(array $patterns, string $text): array
    {
        return array_map(fn (string $p): bool => (bool) $this->checked(preg_match($p, $text), 0), $patterns);
    }

    /** Compatibility forms folded ("ﬁ" -> "fi", full-width -> ASCII, decomposed accents composed); cheap check first. */
    private function nfkc(string $text): string
    {
        return Normalizer::isNormalized($text, Normalizer::FORM_KC) ? $text : (string) $this->checked(Normalizer::normalize($text, Normalizer::FORM_KC), '');
    }

    /** A failed normalization or regex (invalid UTF-8, PCRE limits) is logged, never silent; the text then counts as empty. */
    private function checked(mixed $result, mixed $fallback): mixed
    {
        if ($result === null || $result === false) {
            Log::warning('knowledge.search.text_failed', ['error' => preg_last_error_msg()]);

            return $fallback;
        }

        return $result;
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
