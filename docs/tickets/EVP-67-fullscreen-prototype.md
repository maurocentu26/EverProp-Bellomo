# EVP-67 — Fullscreen Conversations integration

Branch: `ticket/EVP-67-rediseno-vista-conversaciones`; base `d87d2d7`; isolated worktree `EverProp-EVP-67`. Date: 2026-10-30.

Update: user requested proceeding with this implementation directly. Local ticket branch now includes current `origin/develop` fc8bb32, including EVP102 sidebar fixes. No separate EVP65 branch incorporated; latest fetch did not confirm that branch as an ancestor of develop. Implementation commit eb4d5d9; 22 focused tests pass after synchronization. No protected branch was merged or pushed. Native review remains pending; the earlier consent target is stale for any newly selected candidate.

## 1. Requested outcome
The user selected two columns with an on-demand client drawer after comparing prototypes. Use the viewport while retaining large controls. Preserve messaging, permissions, conversation state and visit actions. No push, merge, staging or production deployment authorized.

## 2. Implementation
- `MainLayout.tsx`: only exact `/admin/conversaciones` omits sidebar/navbar and surrounding padding. Providers/session checks unchanged; sibling routes keep existing shell.
- `ConversationInbox.tsx`: visible return-to-panel link, existing text-size control, existing two-column inbox/chat, client content in existing Sheet/Base UI modal primitives. Keep portal mounted to preserve visit edit state. Escape/backdrop close and focus return handled by the primitive. Draft and message handlers unchanged.
- `admin-design.css`: remove wide-screen third column and chat-hiding client overlay. Desktop drawer480px maximum, full-width on mobile, above keyboard chat z-index. Retain17/20.4px conversation typography and52px mobile controls. Constrain suggestion height to preserve composer space.
- New shell regression tests plus drawer/draft regression in composer tests.

## 3. Why
Recover chrome space instead of shrinking content. Reuse existing components and visualViewport keyboard/history logic. No dependencies, credentials, API or schema changes. Prototype artifacts from the earlier comparison remain in the original checkout and are not part of this application integration commit.

## 4. Observed verification
- Shell test RED before implementation; drawer test fails on baseline (`section` instead of `Sheet`) and passes on candidate.
- Focused Node suite:22 passed,0 failed.
- TypeScript noEmit:exit0. Focused ESLint:0errors,2existingwarnings (unused ShieldAlert and existing setState effect).
- Independent verifier in fresh temp scratch:21 initial tests, typecheck and8 normalized sibling-shell/auth baseline comparisons pass. No new code blockers.
- Production build in verifier scratch with explicit local mock mode:exit0,37/37pages generated. This does not validate production/API environment configuration.
- Browser1440x1000: two columns400/1000px; drawer480px, chat remains visible; Escape restores trigger focus; reply draft survives drawer open/close. Return-to-panel link exercised.
- Browser320x568 with Grande: send button bottom490.5px, history189.8px;390x844:send bottom766.5px. No horizontal page overflow. Drawer uses20.4px text and full mobile viewport. No physical iOS keyboard test.
- Local preview `http://127.0.0.1:3217/admin/conversaciones` uses existing mock-profile login and synthetic data only. No real messages sent. Existing local port3000 server untouched.
- Native review pending; independent verification is not a native receipt or deployment approval.

## 5. Pending / rollback
Native review consent/outcome, user acceptance, push/PR and deployment are separate. Real backend integration and physical mobile keyboard not tested. No production readiness claim. Removing this unit restores previous shell/client presentation without data rollback. Earlier prototype320px correction was not rechecked; real integrated320px geometry was checked independently of that prototype.

Risk: item3 (shared MainLayout; sibling routes and session gate verified against baseline).

## Typography QA correction
User reported disproportionate sizes. Browser reproduced Grande tab label15/count20.4, editor16.8/body20.4 and title38.016px. Root cause: blanket span sizing plus later global Grande compatibility overrides. Added a scoped stylesheet loaded after compatibility, semantic roles and conditional dialog scope. Body17/20.4, controls15/18, metadata13/15.6, section20/24 and title24/28.8; touch targets44/52 preserved.

Six live DOM samples (1440,768,320px × Actual/Grande) passed `node tests/ui-conversation-typography.mjs --snapshot <captured-json>`. The same harness can drive a local mock browser with an existing Playwright installation; that runner branch was not executed here. Parent used CUA for actual measurements. Actions menu labels15/help14 verified at320px; client drawer and confirmation text verified. Found and fixed confirmation behind drawer (z50vs71); popup now81, optional overlay80. Opened/cancelled confirmation without scheduling a visit. No messaging or data logic changed.

Independent scratch verifier:22tests, typecheck and production webpack mock build37pages passed; standalone VisitRequestsBoard render unchanged after class-whitespace normalization. Focused lint:0errors,3preexisting effect warnings in inspected components. Physical iOS keyboard, live API and admin trace dialog rendering were not tested. Native review still pending; no push/deploy.
