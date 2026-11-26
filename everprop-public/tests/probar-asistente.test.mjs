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
