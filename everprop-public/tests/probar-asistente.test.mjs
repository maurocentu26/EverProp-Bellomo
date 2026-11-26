import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("navigation exposes Probar asistente only to tenant admins", () => {
  const navSource = fs.readFileSync(path.join(root, "src/components/sidebar/navigation.ts"), "utf8");
  assert.match(navSource, /href:\s*"\/admin\/probar-asistente"/);
  assert.match(navSource, /group\.label === "Comercializadora" && isTenantAdmin/);
});

test("probar-asistente page restricts access to admin roles and loads widget from API", () => {
  const pageSource = fs.readFileSync(path.join(root, "src/app/admin/probar-asistente/page.tsx"), "utf8");
  assert.match(pageSource, /TENANT_ADMIN/);
  assert.match(pageSource, /SUPER_ADMIN/);
  assert.match(pageSource, /loadAssistantWidget/);
  assert.match(pageSource, /<ChatWidget/);
  // Never hardcode a widget UUID in the page source.
  assert.doesNotMatch(pageSource, /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});
