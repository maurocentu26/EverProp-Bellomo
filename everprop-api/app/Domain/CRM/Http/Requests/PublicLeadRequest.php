<?php

namespace App\Domain\CRM\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class PublicLeadRequest extends FormRequest
{
    private const TOP_LEVEL_KEYS = [
        'contact',
        'identity',
        'consent',
        'lead',
        'property_public_id',
        'touchpoint',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            '_idempotency_key' => ['required', 'string', 'min:16', 'max:191', 'regex:/\A[A-Za-z0-9._:-]+\z/'],
            'contact' => ['required', 'array:display_name,first_name,last_name,email,phone_e164,locale'],
            'contact.display_name' => ['nullable', 'string', 'max:200'],
            'contact.first_name' => ['nullable', 'string', 'max:120'],
            'contact.last_name' => ['nullable', 'string', 'max:120'],
            'contact.email' => ['nullable', 'string', 'email:rfc', 'max:320'],
            'contact.phone_e164' => ['nullable', 'string', 'regex:/\A\+[1-9][0-9]{7,14}\z/', 'max:32'],
            'contact.locale' => ['nullable', 'string', 'regex:/\A[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*\z/', 'max:20'],
            'identity' => ['required', 'array:channel_type,provider_user_id,username,display_name'],
            'identity.channel_type' => ['required', Rule::in(['EMAIL', 'PHONE', 'WEB_VISITOR', 'WEB_CHAT', 'WEB_FORM'])],
            'identity.provider_user_id' => ['required', 'string', 'max:191'],
            'identity.username' => ['nullable', 'string', 'max:191'],
            'identity.display_name' => ['nullable', 'string', 'max:200'],
            'consent' => ['sometimes', 'array:purpose_code,status,legal_text_version'],
            'consent.purpose_code' => ['required_with:consent', 'string', 'regex:/\A[A-Z][A-Z0-9_]{0,63}\z/', 'max:64'],
            'consent.status' => ['required_with:consent', Rule::in(['GRANTED', 'DENIED'])],
            'consent.legal_text_version' => ['nullable', 'string', 'max:64'],
            'lead' => ['required', 'array:source_channel,source_kind,title,priority,occurred_at'],
            'lead.source_channel' => ['required', Rule::in(['WEB_FORM', 'WEB_CHAT', 'WEB_TRACKING'])],
            'lead.source_kind' => ['required', 'string', 'regex:/\A[A-Z][A-Z0-9_]{0,63}\z/', 'max:64'],
            'lead.title' => ['nullable', 'string', 'max:255'],
            'lead.priority' => ['sometimes', Rule::in(['LOW', 'NORMAL', 'HIGH', 'URGENT'])],
            'lead.occurred_at' => ['nullable', 'date'],
            'property_public_id' => ['nullable', 'uuid'],
            'touchpoint' => ['required', 'array:type,summary'],
            'touchpoint.type' => ['required', Rule::in(['WEB_FORM', 'WEB_CHAT', 'WEB_VISIT'])],
            'touchpoint.summary' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, mixed> */
    public function validationData(): array
    {
        return [
            ...parent::validationData(),
            '_idempotency_key' => $this->header('Idempotency-Key'),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $unexpected = array_diff(array_keys($this->all()), self::TOP_LEVEL_KEYS);

            if ($unexpected !== []) {
                $validator->errors()->add('payload', 'The request contains unexpected fields.');
            }

            $channel = $this->input('identity.channel_type');
            $providerId = trim((string) $this->input('identity.provider_user_id'));

            if ($channel === 'EMAIL') {
                $email = $this->input('contact.email');

                if (filter_var($providerId, FILTER_VALIDATE_EMAIL) === false || ($email !== null && strcasecmp($providerId, (string) $email) !== 0)) {
                    $validator->errors()->add('identity.provider_user_id', 'The email identity must match contact.email.');
                }
            }

            if ($channel === 'PHONE') {
                $phone = $this->input('contact.phone_e164');

                if (preg_match('/\A\+[1-9][0-9]{7,14}\z/', $providerId) !== 1 || ($phone !== null && $providerId !== $phone)) {
                    $validator->errors()->add('identity.provider_user_id', 'The phone identity must match contact.phone_e164.');
                }
            }

            $expectedTouchpoint = match ($this->input('lead.source_channel')) {
                'WEB_FORM' => 'WEB_FORM',
                'WEB_CHAT' => 'WEB_CHAT',
                'WEB_TRACKING' => 'WEB_VISIT',
                default => null,
            };

            if ($expectedTouchpoint !== null && $this->input('touchpoint.type') !== $expectedTouchpoint) {
                $validator->errors()->add('touchpoint.type', 'The touchpoint type does not match the source channel.');
            }

            if ($this->input('consent.status') === 'GRANTED' && blank($this->input('consent.legal_text_version'))) {
                $validator->errors()->add('consent.legal_text_version', 'A legal text version is required for granted consent.');
            }
        });
    }

    /** @return array<string, mixed> */
    public function payload(): array
    {
        return $this->safe()->only(self::TOP_LEVEL_KEYS);
    }

    public function idempotencyKey(): string
    {
        return (string) $this->validated('_idempotency_key');
    }
}
