import { test, expect } from "@playwright/test";
import { setDate, selectOption } from "./fields";
test("plans, maps, saves, shares and protects editing", async ({
  page,
  browser,
}) => {
  // Tiles are deliberately mocked; live external services are never needed by CI.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Navigate your next date, for more butterflies",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
  await setDate(page, "2026-10-02");
  const planResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/plan") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Find my date", exact: true })
    .click();
  const draft = await (await planResponse).json();
  await expect(
    page.getByRole("heading", { name: "Your date ✨" }),
  ).toBeVisible();
  await page.locator(".plan-card").first().click();
  await expect(
    page.getByRole("region", { name: "Selected itinerary" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Itinerary map" }),
  ).toBeVisible();
  await expect(page.locator("[data-stop-index]").first()).toBeVisible();
  await page.locator("[data-stop-index='1']").click();
  await expect(page.locator(".map-stop")).toContainText("STOP 2");
  await expect(page.locator(".pin-selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Show all stops on the map" }).click();
  await expect(page.locator(".map-stop")).toContainText("Every stop");
  await expect(page.locator(".pin-selected")).toHaveCount(0);

  await page.screenshot({
    path: `test-results/itinerary-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save & Share", exact: true })
    .click();
  await expect(page.getByText(/Your date is saved\./)).toBeVisible();
  const share = await page
    .getByRole("link", { name: "Open read-only share page" })
    .getAttribute("href");
  expect(share).toBeTruthy();
  await page.goto(share!);
  await expect(page.getByText("Read-only shared itinerary.")).toBeVisible();
  const id = new URL(share!).pathname.split("/").at(-1);
  const other = await browser.newContext();
  const denied = await other.request.patch(`/api/date/${id}`, {
    data: { title: "changed" },
  });
  expect(denied.status()).toBe(403);
  const saveDenied = await other.request.post("/api/save", {
    data: { draftId: draft.draftId, planId: draft.plans[0].id, id },
  });
  expect(saveDenied.status()).toBe(403);
  await other.close();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("preserves inputs after an impossible budget and duration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Find my date", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Total budget for two").fill("0");
  await expect(page.getByLabel("Total budget for two")).toHaveValue("0");
  await selectOption(page, "Time together", "60 minutes");
  await selectOption(page, "Indoor or outdoor?", "Indoor activities");
  await page
    .getByRole("button", { name: "Find my date", exact: true })
    .click();
  await expect(page.getByText(/No two-stop plan fits/)).toBeVisible();
  await expect(page.getByLabel("Total budget for two")).toHaveValue("0");
});
