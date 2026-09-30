<?php

namespace App\Domain\AgentRuntime\Tools;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Minimal validator for the closed JSON-Schema subset our tool contracts use (tool-contract skill):
 * object with additionalProperties:false + required, string (maxLength, enum, format uuid|date-time|
 * decimal|timezone|phone|email), integer (minimum/maximum), array (minItems/maxItems/items). Anything else in a
 * schema is a programming error. Returns the first violation as a path, never echoing the value.
 */
final class SchemaValidator
{
    /** @param array<string, mixed> $schema */
    public function validate(array $schema, mixed $value, string $path = '$'): ?string
    {
        return match ($schema['type'] ?? null) {
            'object' => $this->object($schema, $value, $path),
            'string' => $this->string($schema, $value, $path),
            'integer' => $this->integer($schema, $value, $path),
            'array' => $this->array($schema, $value, $path),
            default => throw new \LogicException("Unsupported schema at {$path}"),
        };
    }

    /** @param array<string, mixed> $schema */
    private function object(array $schema, mixed $value, string $path): ?string
    {
        if (! is_array($value) || (array_is_list($value) && $value !== [])) {
            return "{$path}: se esperaba un objeto";
        }
        if (($schema['additionalProperties'] ?? true) !== false) {
            throw new \LogicException("Tool schemas must be closed at {$path}");
        }
        $properties = $schema['properties'] ?? [];
        foreach (array_keys($value) as $key) {
            if (! array_key_exists($key, $properties)) {
                return "{$path}.{$key}: campo no permitido";
            }
        }
        foreach ($schema['required'] ?? [] as $key) {
            if (! array_key_exists($key, $value)) {
                return "{$path}.{$key}: requerido";
            }
        }
        foreach ($value as $key => $item) {
            if (($error = $this->validate($properties[$key], $item, "{$path}.{$key}")) !== null) {
                return $error;
            }
        }

        return null;
    }

    /** @param array<string, mixed> $schema */
    private function string(array $schema, mixed $value, string $path): ?string
    {
        if (! is_string($value)) {
            return "{$path}: se esperaba texto";
        }
        if (isset($schema['maxLength']) && mb_strlen($value) > $schema['maxLength']) {
            return "{$path}: demasiado largo";
        }
        if (isset($schema['minLength']) && mb_strlen(trim($value)) < $schema['minLength']) {
            return "{$path}: demasiado corto";
        }
        if (isset($schema['enum']) && ! in_array($value, $schema['enum'], true)) {
            return "{$path}: valor no permitido";
        }

        $ok = match ($schema['format'] ?? null) {
            null => true,
            'uuid' => preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value) === 1,
            'decimal' => preg_match('/^\d{1,15}(\.\d{1,2})?$/', $value) === 1,
            'date-time' => preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/', $value) === 1
                && DateTimeImmutable::createFromFormat('!Y-m-d', substr($value, 0, 10)) !== false,
            'timezone' => in_array($value, DateTimeZone::listIdentifiers(), true),
            'phone' => preg_match('/^\+?[0-9][0-9 ()-]{6,24}$/', $value) === 1 && strlen((string) preg_replace('/\D/', '', $value)) >= 7,
            'email' => filter_var($value, FILTER_VALIDATE_EMAIL) !== false,
            default => throw new \LogicException("Unsupported format at {$path}"),
        };

        return $ok ? null : "{$path}: formato inválido";
    }

    /** @param array<string, mixed> $schema */
    private function integer(array $schema, mixed $value, string $path): ?string
    {
        if (! is_int($value)) {
            return "{$path}: se esperaba un entero";
        }
        if ((isset($schema['minimum']) && $value < $schema['minimum']) || (isset($schema['maximum']) && $value > $schema['maximum'])) {
            return "{$path}: fuera de rango";
        }

        return null;
    }

    /** @param array<string, mixed> $schema */
    private function array(array $schema, mixed $value, string $path): ?string
    {
        if (! is_array($value) || ! array_is_list($value)) {
            return "{$path}: se esperaba una lista";
        }
        if (count($value) < ($schema['minItems'] ?? 0) || (isset($schema['maxItems']) && count($value) > $schema['maxItems'])) {
            return "{$path}: cantidad de elementos inválida";
        }
        foreach ($value as $i => $item) {
            if (($error = $this->validate($schema['items'], $item, "{$path}[{$i}]")) !== null) {
                return $error;
            }
        }

        return null;
    }
}
