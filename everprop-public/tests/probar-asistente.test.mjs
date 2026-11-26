import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("navigation exposes Probar asistente only to admins", () => {
  const navSource = fs.readFileSync(path.join(root, "src/components/sidebar/navigation.ts"), "utf8");
  assert.match(navSource, /href:\s*"\/admin\/probar-asistente"/);
  assert.match(navSource, /canTestAssistant \?\? isTenantAdmin/);
});

test("probar-asistente page restricts access to admin roles and supports sessions, reviews and export", () => {
  const pageSource = fs.readFileSync(path.join(root, "src/app/admin/probar-asistente/page.tsx"), "utf8");
  assert.match(pageSource, /TENANT_ADMIN/);
  assert.match(pageSource, /SUPER_ADMIN/);
  assert.match(pageSource, /createAssistantTestSession/);
  assert.match(pageSource, /reviewAssistantTestMessage/);
  assert.match(pageSource, /finishAssistantTestSession/);
  assert.match(pageSource, /formatAssistantTestSessionMarkdown/);
  assert.doesNotMatch(pageSource, /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("EVP-212: the client's tester account is confined to the test page and its conversations", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  assert.match(read("src/lib/everprop-api.ts"), /role === "ASSISTANT_TESTER"\) return "TESTER"/);
  assert.match(read("src/components/admin/MainLayout.tsx"), /role === "TESTER" && !conversationsWorkspace/);
  assert.match(read("src/components/admin/MainLayout.tsx"), /router\.replace\("\/admin\/probar-asistente"\)/);
  assert.match(read("src/components/admin/conversations/ConversationInbox.tsx"), /readOnly = user\?\.apiRole === "READ_ONLY" \|\| tester/);
  assert.match(read("src/app/admin/probar-asistente/page.tsx"), /"ASSISTANT_TESTER"/);
});

test("EVP-212: the handoff verdict is written at the start of the review note, not in a new field", () => {
  const api = fs.readFileSync(path.join(root, "src/lib/assistant-api.ts"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/app/admin/probar-asistente/page.tsx"), "utf8");
  // Same rule as withHandoffVerdict/handoffVerdictOf, checked on real strings.
  const prefix = new RegExp(api.match(/const HANDOFF_PREFIX = \/(.+)\/;/)[1]);
  const compose = (note, verdict) => {
    const rest = note.replace(prefix, "").trim();
    return verdict === null ? rest : `Derivación: ${verdict}.${rest ? ` ${rest}` : ""}`;
  };
  assert.equal(compose("Podía seguir.", "muy temprana"), "Derivación: muy temprana. Podía seguir.");
  assert.equal(compose("Derivación: muy temprana. Podía seguir.", "correcta"), "Derivación: correcta. Podía seguir.");
  assert.equal(compose("Derivación: innecesaria. x", null), "x");
  assert.equal(compose("", "innecesaria"), "Derivación: innecesaria.");
  assert.match(api, /return verdict === null \? rest : `Derivación: \$\{verdict\}\.\$\{rest \? ` \$\{rest\}` : ""\}`;/);
  assert.match(page, /message\.handoff \? withHandoffVerdict\(note, verdict\)/);
  assert.match(page, /¿La derivación fue necesaria\?/);
});
