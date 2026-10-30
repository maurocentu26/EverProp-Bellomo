# EVP-67 — Fullscreen Conversations integration

Branch: `ticket/EVP-67-rediseno-vista-conversaciones`; base `d87d2d7`; isolated worktree `EverProp-EVP-67`. Date: 2026-10-30.

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