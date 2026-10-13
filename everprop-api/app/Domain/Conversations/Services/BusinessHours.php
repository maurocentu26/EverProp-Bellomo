<?php

namespace App\Domain\Conversations\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Tenant business hours (EVP-L02): when the team answers, in the tenant's own timezone. Stored in
 * tenants.settings_json.conversations.business_hours as {"mon": [["09:00","18:00"]], ...}, up to two ranges per
 * day, same-day only (ADR 0005 exception, like the AI switches). No schedule configured = always open, so a tenant
 * that never sets hours behaves exactly as before. Holidays (EVP-14) are closed dates in the tenant's timezone,
 * stored next to it as "holidays": ["2026-12-25", ...]; they only apply when a schedule exists.
 */
final class BusinessHours
{
    public const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    public const MAX_HOLIDAYS = 60;

    private const NAMES = ['mon' => 'lunes', 'tue' => 'martes', 'wed' => 'miércoles', 'thu' => 'jueves', 'fri' => 'viernes', 'sat' => 'sábado', 'sun' => 'domingo'];

    /** @var array<int, array{schedule: array<string, list<array{0: string, 1: string}>>|null, holidays: list<string>, away_message: string|null, timezone: string}> */
    private array $memo = [];

    /**
     * Read once per instance (the container builds a new one per resolve), so a report over many rows does not
     * query the tenant every time and a later request always sees fresh settings.
     *
     * @return array{schedule: array<string, list<array{0: string, 1: string}>>|null, holidays: list<string>, away_message: string|null, timezone: string}
     */
    public function settings(int $tenantId): array
    {
        return $this->memo[$tenantId] ??= $this->load($tenantId);
    }

    /** @return array{schedule: array<string, list<array{0: string, 1: string}>>|null, holidays: list<string>, away_message: string|null, timezone: string} */
    private function load(int $tenantId): array
    {
        $tenant = DB::table('tenants')->where('id', $tenantId)->first(['settings_json', 'timezone']);
        $conversations = json_decode((string) $tenant?->settings_json, true)['conversations'] ?? [];
        $conversations = is_array($conversations) ? $conversations : [];
        $message = $conversations['away_message'] ?? null;

        return [
            'schedule' => self::normalize($conversations['business_hours'] ?? null),
            'holidays' => self::normalizeHolidays($conversations['holidays'] ?? []) ?? [],
            'away_message' => is_string($message) && trim($message) !== '' ? $message : null,
            // A mistyped zone must not break alerts or the inbox: fall back to the platform default (baseline).
            'timezone' => in_array($tenant?->timezone, \DateTimeZone::listIdentifiers(), true) ? (string) $tenant->timezone : 'America/Argentina/Salta',
        ];
    }

    public function isOpen(int $tenantId, ?CarbonImmutable $at = null): bool
    {
        ['schedule' => $schedule, 'holidays' => $holidays, 'timezone' => $tz] = $this->settings($tenantId);
        $local = ($at ?? CarbonImmutable::now())->setTimezone($tz);

        return $schedule === null || (! in_array($local->toDateString(), $holidays, true) && self::openAt($schedule, $local));
    }

    /** Next moment the team opens, in the tenant's timezone; null when always open or no day has hours. */
    public function nextOpening(int $tenantId, ?CarbonImmutable $at = null): ?CarbonImmutable
    {
        ['schedule' => $schedule, 'holidays' => $holidays, 'timezone' => $tz] = $this->settings($tenantId);
        if ($schedule === null) {
            return null;
        }
        $local = ($at ?? CarbonImmutable::now())->setTimezone($tz);
        // A week, plus one day per holiday that could fall in the way.
        for ($offset = 0; $offset <= 7 + count($holidays); $offset++) {
            $day = $local->addDays($offset);
            if (in_array($day->toDateString(), $holidays, true)) {
                continue;
            }
            foreach ($schedule[self::DAYS[$day->dayOfWeekIso - 1]] as [$start]) {
                $opens = $day->setTimeFromTimeString($start);
                if ($opens->greaterThan($local)) {
                    return $opens;
                }
            }
        }

        return null;
    }

    /** "lunes a viernes de 9:00 a 18:00 y sábado de 9:00 a 13:00"; null when always open. */
    public function describe(int $tenantId): ?string
    {
        $schedule = $this->settings($tenantId)['schedule'];
        if ($schedule === null) {
            return null;
        }
        $groups = [];
        foreach (self::DAYS as $day) {
            $key = json_encode($schedule[$day]);
            $last = array_key_last($groups);
            if ($last !== null && $groups[$last]['key'] === $key && $schedule[$day] !== []) {
                $groups[$last]['to'] = $day;
            } else {
                $groups[] = ['key' => $key, 'from' => $day, 'to' => $day, 'ranges' => $schedule[$day]];
            }
        }
        $parts = [];
        foreach ($groups as $g) {
            if ($g['ranges'] === []) {
                continue;
            }
            $days = $g['from'] === $g['to'] ? self::NAMES[$g['from']] : self::NAMES[$g['from']].' a '.self::NAMES[$g['to']];
            $ranges = array_map(fn ($r) => 'de '.self::short($r[0]).' a '.self::short($r[1]), $g['ranges']);
            $parts[] = $days.' '.implode(' y ', $ranges);
        }

        return $parts === [] ? null : implode(', ', array_slice($parts, 0, -1)).(count($parts) > 1 ? ' y ' : '').end($parts);
    }

    /**
     * Fixed text (never model-written) for a visitor who writes while the team is away. The tenant's own message
     * wins; otherwise it states the hours and when the team is back, without promising a reply time.
     */
    public function awayMessage(int $tenantId, ?CarbonImmutable $at = null): string
    {
        $custom = $this->settings($tenantId)['away_message'];
        if ($custom !== null) {
            return $custom;
        }
        $hours = $this->describe($tenantId);

        return 'Gracias por escribirnos. Ahora estamos fuera del horario de atención'.($hours !== null ? " ({$hours})" : '').'. '
            .'Un asesor te responde por este chat '.($this->backPhrase($tenantId, $at) ?? 'apenas vuelva el equipo').'.';
    }

    /**
     * When the team is back, for fixed texts: "a partir de hoy / de mañana / del lunes a las 9:00", or
     * "apenas vuelva el equipo" if no day has hours. Null while open or with no schedule (nothing to announce).
     */
    public function backPhrase(int $tenantId, ?CarbonImmutable $at = null): ?string
    {
        if ($this->isOpen($tenantId, $at)) {
            return null;
        }
        $next = $this->nextOpening($tenantId, $at);
        if ($next === null) {
            return 'apenas vuelva el equipo';
        }
        $today = ($at ?? CarbonImmutable::now())->setTimezone($next->timezone)->startOfDay();
        $days = (int) $today->diffInDays($next->startOfDay());
        $from = match (true) {
            $days === 0 => 'de hoy',
            $days === 1 => 'de mañana',
            // Past a week (only with holidays) the weekday alone is ambiguous: add the date.
            $days >= 7 => 'del '.self::NAMES[self::DAYS[$next->dayOfWeekIso - 1]].' '.$next->format('j/n'),
            default => 'del '.self::NAMES[self::DAYS[$next->dayOfWeekIso - 1]],
        };

        return 'a partir '.$from.' a las '.$next->format('G:i');
    }

    /**
     * Validated, canonical schedule or null. Rejects anything malformed instead of guessing: a wrong schedule
     * would silently mute alerts or tell visitors the wrong hours.
     *
     * @return array<string, list<array{0: string, 1: string}>>|null
     */
    public static function normalize(mixed $raw): ?array
    {
        if (! is_array($raw) || array_diff(array_keys($raw), self::DAYS) !== []) {
            return null;
        }
        $schedule = [];
        foreach (self::DAYS as $day) {
            $ranges = $raw[$day] ?? [];
            if (! is_array($ranges) || count($ranges) > 2) {
                return null;
            }
            $previousEnd = null;
            foreach ($ranges as $range) {
                if (! is_array($range) || count($range) !== 2 || ! self::isTime($range[0] ?? null) || ! self::isTime($range[1] ?? null)
                    || $range[0] >= $range[1] || ($previousEnd !== null && $range[0] < $previousEnd)) {
                    return null;
                }
                $previousEnd = $range[1];
            }
            $schedule[$day] = array_values(array_map(fn ($r) => [$r[0], $r[1]], $ranges));
        }

        return $schedule;
    }

    /**
     * Validated holiday list (unique, sorted "YYYY-MM-DD" real dates, at most MAX_HOLIDAYS) or null when malformed.
     *
     * @return list<string>|null
     */
    public static function normalizeHolidays(mixed $raw): ?array
    {
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) > self::MAX_HOLIDAYS) {
            return null;
        }
        foreach ($raw as $date) {
            if (! is_string($date) || preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $date, $m) !== 1 || ! checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
                return null;
            }
        }
        $dates = array_values(array_unique($raw));
        sort($dates);

        return $dates;
    }

    /** @param array<string, list<array{0: string, 1: string}>> $schedule */
    private static function openAt(array $schedule, CarbonImmutable $local): bool
    {
        $now = $local->format('H:i');
        foreach ($schedule[self::DAYS[$local->dayOfWeekIso - 1]] as [$start, $end]) {
            if ($now >= $start && $now < $end) {
                return true;
            }
        }

        return false;
    }

    private static function isTime(mixed $value): bool
    {
        return is_string($value) && preg_match('/\A([01]\d|2[0-3]):[0-5]\d\z/', $value) === 1;
    }

    private static function short(string $time): string
    {
        return (int) substr($time, 0, 2).substr($time, 2);
    }
}
