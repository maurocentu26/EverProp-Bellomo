# EVP-81 — Gemini staging pilot

Branch: `ticket/EVP-81-gemini-staging` from `3688d74`. Delivery: ask-on-risk; forecast below 400 authored lines. Runner: Docker PHP 8.4 / PHPUnit with fake HTTP.
Implementation: inline; one shared provider gate. Risk: item 2 (provider access), item 5 (environment configuration). Independent verification follows functional checks.

## Specs

- S1: "Dale, lo preparemos. Con este acceso, vamos a poder mandar mensajes los 3 y ver si llegan bien?" Prepare Gemini for staging, preserve local behavior and refuse production, with shared consumption limits and no exposed credentials.
- S2: "Vamos" Authorizes implementation of EVP-81, not remote credential transfer, deployment, merge or real messages to unspecified recipients.
- S3: "si" Confirms EVP-80 was reviewed before starting this ticket. Three-person WhatsApp delivery remains a separate real-environment acceptance check.

## Tasks

- T1 [S1,S2] inline — in progress: explicit staging provider gate, regression tests, deployment guide; commit pending authorization.
- T2 [S1,S2] inline — pending: staging-only credential and runtime configuration; requires destination-specific approval and credential supplied through the secret manager.
- T3 [S1,S3] inline — pending: verify three approved sandbox recipients, incoming messages, Gemini draft and outgoing delivery with human confirmation.

## Log

- L1 2026-10-26: "Dale, lo preparemos. Con este acceso, vamos a poder mandar mensajes los 3 y ver si llegan bien?"
- L2 2026-10-26: "Vamos"
- L3 2026-10-26: "si"
- Existing local Gemini adapter and provider binding both reject non-local environments. Railway staging uses Laravel production mode, so preserve APP_ENV and use explicit opt-in plus Railway environment identity. Existing quota ledger remains authoritative; zero-priced staging calls must not bypass consumption accounting.
- Jira EVP-81 is En curso and assigned to Mauro. No tracked local changes before branch creation; pre-existing untracked files preserved. Engram reads previously returned unknown_project for the correctly resolved repository; mirror pending.
- RED observed against original binding; GREEN Gemini/OpenAI regression: 14 tests, 72 assertions. Pint and focused PHPStan passed. Docker test container used network none and fake HTTP; no local service stack started, no real database/provider calls. Independent verifier evp81_verify checks risk items 2 and 5; remote T2/T3 remain unstarted.
- Independent verifier returned no blockers, 14 tests/72 assertions in isolated scratch, cached-config probe and baseline/current differential. Runtime credentials, full database-backed quota integration and three-person real delivery are not verified. Native review mode is on by default; candidate-specific review consent remains pending. No commit/push/deploy authorized or performed.
- 2026-10-26 user: "Avancemos con el despliegue para que lo pruebe mi equipo"; "omitir esta vez"; "Hacelo, te autorizo"; "si" (explicitly approves copying local GEMINI_API_KEY only to staging API/worker). Native decline_this_candidate validated for target 9337ce4d; reviews remain enabled globally. Railway has sixteen staged variables across API/worker; no key printed or committed. Keep the USD 10 application ceiling and use verified model accounting rates 0.25/1.50. CLI login was cancelled at its broader OAuth consent; browser deployment path only. Remote real-message acceptance still pending.
