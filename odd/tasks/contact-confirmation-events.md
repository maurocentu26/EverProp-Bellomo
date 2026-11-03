# EVP-103 — Contact confirmation and provider events
Branch: `ticket/EVP-103-confirmacion-contacto`; base: `fc8bb32`. Delivery: exception-ok (single PR explicitly authorized); forecast 350 authored lines, subject to evidence.
Checks: PHP PHPUnit unit/isolated MySQL feature tests, Node conversation tests, eval dataset validation; no live-provider calls without scoped authorization.

## Specs
- S1: "Solucionemos, también cuando se manda wpp se genera la tarjeta que te digo. Pero tampoco la IA me solicitó confirmación para los datos." Restore the existing summary/explicit confirmation flow without trusting arbitrary links; verify corrections and no premature persistence.
- S2: "Si, avancemos con el ticket y su solución." Investigate provider event types without assuming that Instagram and WhatsApp carry equivalent cards; render verified types honestly and unknown events clearly. Preserve text and privacy.
- S3: "no, aún no, sigue en curso y posiblemente no se implementé aún. continuemos con este" Work independently of pending EVP-67. No production, push, merge or deploy authorization for this source change.

## Tasks
- T1 / S1 / inline / commit 00b1500; implemented, native review declined by user: exact declared email exception, automatic/copilot scoped history. RED unknown visitorMessages parameter; GREEN 48 tests/59 assertions; independent security check passed after one delimiter correction. Risk: item 2 (output security guard).
- T2 / S1 / delegated / commit 00b1500; implemented; independent verification passed: verify confirmation/correction/no-consent flow and address demonstrated defects using existing helpers; writer reason: independent consent behavior, disjoint from T3 event surfaces, launched in parallel. Risk: item 1 and 2 (CRM mutation authorization).
- T3 / S2 / delegated / commit fcf3a9a; implemented; independent verification passed: classify and display provider nontext events with minimal metadata and tests; writer reason: independent provider-event behavior, disjoint from T2 consent surfaces, launched in parallel. Real card subtype pending controlled evidence; do not guess it.
- T4 / S1-S3 / delegated verification / functional and static checks complete; native review declined by user: independent security verification, functional checks and report. Independent verifier covers CRM persistence authorization, session ordering and tenant-scoped DTOs.

## Log
- L1: "Si, avancemos con el ticket y su solución."
- 2026-11-02: User authorized parallel work despite pending EVP-67 and then explicitly authorized fetch of origin/develop. Fetched fc8bb32; created isolated worktree EverProp-EVP-103. Jira assigned to Mauro and En curso.
- Mapping: EVP-40 confirmation is prompt/tool-description based; no deterministic backend consent gate found. OutputGuard matches bare domains inside email. Social parser drops attachments; processed receipts redact payloads, preventing historical subtype proof. New worktree has no dependencies; reuse existing installed packages only, never copy real .env or run feature tests against real DB.
- Engram mirror pending: project resolver returns everprop-bellomo but writes fail unknown_project. Do not fall back to another project.
- T1 evidence: dependencies reused through an external bootstrap explicitly loading candidate OutputGuard (original Composer class map otherwise loads original worktree). Pint passed. Independent verifier found query-suffix bypass; fixed token delimiters and added regressions. 38 default-argument baseline differentials unchanged. In-memory query-isolation probes are not MySQL feature/persistence proof. T2/T3 and live-provider evidence remain pending.
- User answered `declined`: exact native candidate invocation returned action=declined, consent=declined_this_candidate, matching target22da5dfad35b1fe9cca78dc690b7b891644f21e48c5605fdb9716c969deb50a4. Future reviews remain enabled.
- Environment: Docker was stopped. Original documented PC shortcut missing; resolved current user's Start Menu shortcut to C:/Program Files/Docker/Docker/frontend/Docker Desktop.exe and launched it. docker info verified29.3.1. No stack/container started for this task yet; existing containers must be inventoried before test setup.
- Open product evidence: user phrase "cuando se manda wpp" may mean literal text inside Instagram rather than WhatsApp channel. Clarify before expanding card reproduction across channels. No provider-specific subtype is established.
- 2026-11-03 user: "Completá evp-103". Continue implementation using conservative unknown labels where provider subtype remains unverified; no unsupported contact-card inference. Delivery remains local pending explicit remote publication/deploy approval.

- 2026-11-03: T2 server-owned immutable proposal uses existing session state (no migration); only next actual contact TEXT exactly 'Confirmo mis datos' after delivered summary authorizes exact stored args. Corrections/nontext/stale epoch fail closed. Writer reports78 tests/368 assertions. T3 Node14/14 parent rerun; webhook21/183 and11/92 writer checks; parent admin DTO HTTP1/20 passed with real isolated MySQL+Redis. Synthetic fixtures do not prove historical IG card subtype.
- Isolated test infrastructure: everprop-evp103-mysql loopback13373 tmpfs synthetic DB; everprop-evp103-redis loopback13379. PHP Docker existing image includes missing Windows Redis extension. No real env or data used. Stop both task containers after verification; preserve unrelated services.
- Native T1 review declined only for prior candidate. Whole-feature independent verification in progress; no commit/push/deploy.


- Independent verification PASS S1-S3:100 tests/571 assertions,11 probes/120 assertions; rejected CRM mutation preserved hash. No real parallel stress/liveprovider proof. Static15 diagnostics corrected in one batch; bounded PHPStan4files/Pint4files passed, pure49/72. Global PHPStan not repeated. Lint0errors127warnings, eval202cases; standardTurbopack blocked externaljunction, explicitWebpackbuildpassed37pages. Both taskcontainers stopped; no source publication. Report docs/tickets/EVP-103-confirmacion-contacto-eventos.md. Nativefinalconsent pending; previousT1decline not reused.


- User authorized 'declined y push para pr', then explicitly 'Un unico pr'. Final native invocation returned declined_this_candidate for target69de33e056cd025fb0ce5d8c1c8b090dce2cbdcc67f5d15dad06e24773b2f93b. Delivery size:exception accepted; no merge/deploy. Commit units: consent+emailguard, provider events+UI, delivery documentation.


- Delivery boundaries:00b1500 (contact consent+scoped email guard, rollback together); fcf3a9a (provider classification+DTO+UI, rollback together). Documentation-only closing unit records verification and explicit size exception. No new native review for unchanged declined source; no PASS receipt fabricated.

