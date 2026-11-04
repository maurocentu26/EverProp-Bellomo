# EVP-108 — Gemini inventory failures
Branch: `ticket/EVP-108-gemini-inventario`, baseline `5e19d6a`. Delivery: ask-on-risk; no publishing yet. Runner: PHP 8.4 Docker / PHPUnit.
Scope: diagnose and correct the existing Gemini adapter, preserve guards and billing. Estimated authored delta: 200 lines.

## Specs
- S1: "lo hagamos" — implement Jira EVP-108 acceptance criteria: safe provider diagnostics, function-call continuity, regression tests and report; do not claim an unknown 5xx root cause.
- S2: "en paralelo. recordar meter pull en develop" — update develop before an isolated ticket branch, preserve other work.
- S3: Ticket acceptance requires staging inventory/tool continuation/contact confirmation evidence; remote mutation and provider consumption require scoped authorization. Pending until available.

## Tasks
- T1 (S2): inline, complete — `git pull --ff-only origin develop`; isolated worktree from `5e19d6a`.
- T2 (S1): inline, complete locally — RED8 tests/2 failures; GREEN65 tests/159 assertions; Pint2 files; scoped PHPStan passes. Independent security/contract verifier: no blockers. Risk items2/3.
- T3 (S1,S3): inline, pending external validation — report written; staging needs authorized publication before testing corrected code. No provider consumption, merge or deploy performed.

## Log
- L1: User request: "lo hagamos". Follow-up: "en paralelo. recordar meter pull en develop".
- L2: Jira EVP-108 verified En curso, assigned Mauro. Known staging observations show PROVIDER_ERROR on initial and post-tool calls, exact HTTP unknown. Missing functionResponse ID found; causal relation to 5xx unproven.
- L3: Existing local Docker stack belongs to ongoing work and remains untouched. Tests use an ephemeral PHP container with isolated configuration, no provider credentials.
- L4: Mirror pending: host hook refuses Engram writes because runtime session is not registered; do not fabricate a session ID. Local document remains recovery source.
- L5: Independent verifier tested baseline/candidate no-provider-ID payload equivalence, exact output identical. External scratch retained under system Temp. No new dependency, migration or configuration variable.
- L6: User granted additional native review: risk/reliability no findings, approval acknowledged and authority consumed. User then explicitly authorized commit, push and PR; merge/deployment remain unauthorized.
