# EVP-81 — Gemini staging pilot

Branch `ticket/EVP-81-gemini-staging`, base `3688d74`, 2026-10-26. Jira: https://eversys.atlassian.net/browse/EVP-81. Provider calls and runtime acceptance remain pending.

## 1. Requested outcome

Allow three team members to test Gemini-backed conversations in staging without sharing the provider key or enabling Gemini in production. WhatsApp delivery, Gemini generation and human confirmation are distinct acceptance checks.

## 2. Implementation

`GeminiChatClient::environmentAllowed()` is shared by the provider binding and its request-time guard. Local behavior remains available when no Railway identity is present. A Railway deployment is allowed only when its injected `RAILWAY_ENVIRONMENT_NAME` is exactly `staging` and `GEMINI_STAGING_ENABLED=true`. Other deployment identities are refused, even with Laravel local mode. Keep `APP_ENV` unchanged: Railway staging currently uses Laravel production hardening.

The existing quota ledger and tenant authorization are reused. Staging requires positive input/output accounting rates, a key, a model and a positive budget. `GEMINI_BUDGET_USD` optionally overrides the existing `GEMINI_LOCAL_BUDGET_USD`; the smaller of this budget and each existing global/tenant/copilot ceiling is retained. Accounting rates are estimates, not a guarantee of Google's invoice or rate limits.

No schema, WhatsApp transport, recipient normalization, permissions, prompts or public APIs changed. Credentials remain server-side.

## 3. Deployment and test sequence

After code review and separately authorized deployment, configure API and worker consistently in **bellomito-staging only**:

| Variable | Required value |
| --- | --- |
| `AGENT_LLM_PROVIDER` | `gemini` |
| `AGENT_LLM_MODEL` | Explicit model available to the dedicated staging project; verify before deployment |
| `GEMINI_API_KEY` | Existing local key copied only to staging API/worker with the user's explicit approval on 2026-10-26; never exposed in Git or the panel |
| `GEMINI_STAGING_ENABLED` | `true` |
| `GEMINI_INPUT_MICROS_PER_TOKEN`, `GEMINI_OUTPUT_MICROS_PER_TOKEN` | Staged values 0.25 / 1.50 for gemini-3.1-flash-lite, verified against Google's published text pricing; supersedes older local accounting estimates |
| `GEMINI_BUDGET_USD` | Agreed shared monthly ceiling; existing lower caps still apply |
| `CONVERSATIONS_COPILOT_ENABLED` | `true` for the initial supervised test |
| `CONVERSATIONS_AI_ENABLED` | `false` initially; enable only for a separately confirmed automatic-response test |

Do not set or override `RAILWAY_ENVIRONMENT_NAME`; Railway supplies it. Rebuild configuration through the normal deployment. Review scheduler settings if it executes provider calls. Enable the corresponding tenant mode using the existing settings UI; global flags alone do not authorize a tenant.

Use the fictitious staging tenant and synthetic text. Google receives the prompt and conversation content; verify the selected API plan's current data terms before real customer data. A Gemini API key is not a consumer Gemini subscription or an unlimited quota.

For each of the three approved WhatsApp recipients: receive a new message, verify the correct separate conversation, take human control, request a Gemini draft, send it explicitly and confirm delivery on that person's phone. Record Meta acceptance/delivery separately from human receipt. EVP-80's sandbox exception covers one exact incoming recipient: do not strip the mobile `9` globally or assume it covers the other two numbers. Test those numbers first and record any Graph error before considering changes.

Then test automatic mode separately. No media or templates are claimed as tested. Existing attachment storage limitations are outside this text pilot.

Disable Gemini by setting `GEMINI_STAGING_ENABLED=false` and redeploying API/worker. For immediate tenant-level response shutdown use the existing AI-off setting; copilot has its own switch. Rotate the staging key in Google's project and Railway when needed; never record either key in the report or PR.

## 4. Verification

- RED: new staging-opt-in test failed against the original binding (DisabledLlmClient instead of GeminiChatClient).
- GREEN and provider regression: Docker PHP 8.4, network disabled, fake HTTP: Gemini + OpenAI, 14 tests / 72 assertions passed. Covers staging opt-in, both assistant modes, missing key/model/budget, positive staging rates, production/unknown environments, unchanged local behavior, provider error redaction and budget clamps.
- Pint on the four changed PHP files passed after normalization. Focused PHPStan on the adapter, binding and tests passed with no errors. `git diff --check` passed.
- Independent security/environment verifier: no blockers. Isolated run passed 14 tests / 72 assertions. Public-client baseline/current probes showed only intended staging enablement and denial of Railway production even with Laravel local mode. `config:cache` preserved the opt-in, deployment identity and budget override. No real provider or database calls were made. Full database-backed quota integration and real three-recipient delivery remain unverified.
- No database import, migration, real provider request or active application stack was needed for the adapter tests. Existing unrelated containers were left running.

## 5. Pending proof and risks

- User explicitly approved reuse of the local credential only in staging API/worker, sharing its quota. Sixteen variable changes (eight per service) are staged in Railway: key, provider, model gemini-3.1-flash-lite, staging opt-in, input/output accounting rates, USD 10 monthly application ceiling (same ceiling as local), and copilot flag. They are not yet applied to running deployments. The separate-key recommendation is deferred by the user's explicit instruction; rotate to a dedicated key when available.
- Reference for text accounting rates: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/ ($0.25 input / $1.50 output per million tokens). This application ceiling is not a hard Google billing cap.
- Additional native review was declined for this candidate by the user; functional checks and independent security verification remain valid. The Railway CLI OAuth request was cancelled without granting its additional workspace/SSH permissions; browser session remains the authorized access path.
- Three-person real WhatsApp/Gemini validation and automatic mode remain pending; do not close the ticket as fully delivered.
- A shared quota is consumed by the team. Provider-side billing/quotas and application accounting are different controls.
- Production stays out of scope. Any future production proposal must first verify forwards/schema_versions, final domains, tenant_domains/CORS/Sanctum/cookies, provider credentials/permissions, database and storage; staging tests do not validate production.
- Risk: item 2 (provider-access gate), item 5 (environment configuration).
