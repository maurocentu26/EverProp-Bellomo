import { expect, test, type Page } from "@playwright/test";

const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

async function loginAsAdmin(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Marcos Bellomo/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "EverProp · Bellomo" })).toBeVisible();
});

test("admin can load every static backoffice route and log out", async ({ page }) => {
  const errors = consoleErrors(page);
  await loginAsAdmin(page);

  const routes = [
    "/admin",
    "/admin/desarrollos",
    "/admin/inventory-matrix",
    "/admin/properties",
    "/admin/properties/new",
    "/admin/leads",
    "/admin/leads/new",
    "/admin/agenda",
    "/admin/comercial",
    "/admin/settings",
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.locator('main[data-admin-scroll-container="true"]')).toBeVisible();
    await expect(page.getByText("QA visual mock · datos no reales")).toBeVisible();
  }

  const logoutButton = page.getByRole("button", { name: "Cerrar sesión" });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole("button", { name: "Abrir menú principal" }).click();
  }
  await logoutButton.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("primary creation forms expose validation instead of false success", async ({ page }) => {
  const errors = consoleErrors(page);
  await loginAsAdmin(page);

  await page.goto("/admin/properties/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Inmobiliaria Tradicional/i }).click();
  await page.getByRole("button", { name: /Guardar Casa/i }).click();
  await expect(page.getByText(/título|ubicación|precio|requerid/i).first()).toBeVisible();

  await page.goto("/admin/leads/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Guardar lead/i }).click();
  await expect(page.getByText(/nombre debe tener|medio de contacto/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});
