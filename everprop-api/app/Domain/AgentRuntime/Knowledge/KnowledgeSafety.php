<?php

namespace App\Domain\AgentRuntime\Knowledge;

use Normalizer;

final class KnowledgeSafety
{
    public static function hasInstructions(string $text): bool
    {
        $normalized = Normalizer::isNormalized($text, Normalizer::FORM_KC) ? $text : Normalizer::normalize($text, Normalizer::FORM_KC);
        if ($normalized === false) {
            return true;
        }
        $normalized = preg_replace('/[\p{Cf}\x{00AD}]/u', '', $normalized);

        return $normalized === null || self::evidence($text) !== trim($normalized);
    }

    /** Keep facts before an instruction; its following lines must not become independent evidence. */
    public static function evidence(string $text): string
    {
        $text = Normalizer::isNormalized($text, Normalizer::FORM_KC) ? $text : Normalizer::normalize($text, Normalizer::FORM_KC);
        if ($text === false) {
            return '';
        }
        $text = preg_replace('/[\p{Cf}\x{00AD}]/u', '', $text);
        if ($text === null) {
            return '';
        }
        // All signatures below contain these stems; plain facts avoid the expensive boundary scan.
        if (preg_match('/nota|system|assistant|developer|respond|inclu|ignor|ofrec|confirm|disregard|always|instruction/iu', $text) === 0) {
            return trim($text);
        }
        // shortcut: deterministic Spanish/English instruction signatures; not a semantic injection detector.
        $pattern = '/\b(?:nota\s+para\s+(?:(?:la|el)\s+)?(?:ia|asistente|bot)|(?:system|assistant|developer)\s*:|(?:respond[eé]|responde|respondan)\s+siempre|inclu[ií]\s+en\s+tu\s+respuesta|(?:ignore|disregard)\s+(?:all|previous|the)|always\s+(?:respond|include)|instructions?\s+for\s+(?:the\s+)?(?:ai|assistant))|(?:\A|(?<=[.!?:])\s+|\R)\s*(?:respond[eé]|responde|inclu[ií]|ignor[aá]|ignora|ofrecé|confirmá)\b/iu';
        $matched = preg_match($pattern, $text, $match, PREG_OFFSET_CAPTURE);
        if ($matched === false) {
            return '';
        }

        return trim($matched === 1 ? substr($text, 0, $match[0][1]) : $text);
    }
}
