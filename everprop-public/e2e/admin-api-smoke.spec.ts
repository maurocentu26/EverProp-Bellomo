import { expect, test } from "@playwright/test";

const apiMode = process.env.PLAYWRIGHT_API_MODE === "true";
const email = process.env.PLAYWRIGHT_API_EMAIL;
const password = process.env.PLAYWRIGHT_API_PASSWORD;

test.describe("EverProp admin API integration @api", () => {
  test.skip(!apiMode || !email || !password, "Requires the isolated local API fixture.");

  test("tenant admin can log in, persist a lead, reload it, and log out", async ({ page }) => {
    const leadName = `QA API ${test.info().project.name} ${Date.now()}`;

    await page.goto("/login");
    await expect(page.getByText("Sesión real EverProp")).toBeVisible();
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);

    const loginResponse = page.waitForResponse(
      (response) => response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Ingresar con EverProp API" }).click();
    expect((await loginResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/admin/leads/new");
    await expect(page.getByText("Alta de nuevo lead", { exact: true })).toBeVisible();
    await page.getByLabel(/Nombre completo/).fill(leadName);
    await page.getByLabel("Email").fill(`qa-${Date.now()}@example.test`);

    const createResponse = page.waitForResponse(
      (response) => response.url().includes("/api/v1/admin/leads") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Guardar lead" }).click();
    const created = await createResponse;
    expect(created.status()).toBe(201);
    await expect(page).toHaveURL(/\/admin\/leads$/);
    const visibleLead = page.getByText(leadName, { exact: true }).filter({ visible: true }).first();
    await expect(visibleLead).toBeVisible();

    await page.reload();
    await expect(visibleLead).toBeVisible();

    const logoutResponse = page.waitForResponse(
      (response) => response.url().includes("/api/v1/auth/logout") && response.request().method() === "POST",
    );
    const logoutButton = page.getByRole("button", { name: "Cerrar sesión" });
    if (!(await logoutButton.isVisible())) {
      await page.getByRole("button", { name: "Abrir menú principal" }).click();
    }
    await logoutButton.click();
    expect((await logoutResponse).status()).toBe(204);
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
  });
});
