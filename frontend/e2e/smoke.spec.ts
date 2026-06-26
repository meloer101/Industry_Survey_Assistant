import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("renders brand and hero content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".l-brand-name").first()).toContainText("Veris");
    await expect(page.locator("h1.l-display")).toBeVisible();
  });

  test("example chip navigates to /app", async ({ page }) => {
    await page.goto("/");
    const chip = page.locator(".l-chip").first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).toHaveURL(/\/app/);
  });

  test("free-start button navigates to /app", async ({ page }) => {
    await page.goto("/");
    const ctaButton = page.locator("button", { hasText: "免费开始" }).first();
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();
    await expect(page).toHaveURL(/\/app/);
  });
});

test.describe("App route", () => {
  test("loads the app when backend is healthy", async ({ page }) => {
    // Mock /api/health so the frontend doesn't stall on BackendLoadingScreen.
    // In CI there is no real backend; Clerk is also disabled (no publishable key).
    await page.route("**/api/health", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) }),
    );
    await page.goto("/app");
    await expect(page.locator("text=AI 投资研究平台").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
