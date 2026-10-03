import { test, expect } from "@playwright/test";
import { setDate, selectOption } from "./fields";
test("coffee dates restore and failed automatic saves retry the same share link", async ({
  page,
  browser,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/?new=1");
  await selectOption(page, "Where are we starting?", "Ithaca Commons");
  await setDate(page, "2026-10-02");
  await page.getByRole("button", { name: "Coffee", exact: true }).click();
  const generated = page.waitForResponse((r) => r.url().endsWith("/api/plan"));
  await page
    .getByRole("button", { name: "Find our date", exact: true })
    .click();
  const draft = await (await generated).json();
  expect(draft.plans.length).toBeGreaterThan(0);
  expect(
    draft.plans.every((p: { stops: { place: { category: string } }[] }) =>
      p.stops.some((s) => s.place.category === "café"),
    ),
  ).toBe(true);
  await page.locator(".plan-card").first().click();
  await page
    .getByRole("button", { name: "Save this date", exact: true })
    .click();
  await expect(page.getByText(/Your date is saved\./)).toBeVisible();
  const link = page.getByRole("link", { name: "Open read-only share page" });
  const share = (await link.getAttribute("href"))!;
  const id = new URL(share).pathname.split("/").at(-1)!;
  let failed = false;
  await page.route("**/api/save", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary save failure" }),
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Try another place" }).last().click();
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  await expect(link).toHaveAttribute("href", share);
  await expect(
    page.getByRole("button", { name: "Copy share link" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByText(/Your date is saved\./)).toBeVisible();
  await expect(link).toHaveAttribute("href", share);
  const names = await page.locator(".stop-card h3").allTextContents();
  await page.reload();
  await expect(
    page.getByText(/Your saved date is ready to edit/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Coffee", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".stop-card h3").allTextContents()).toEqual(names);
  await page.goto("/");
  await expect(link).toHaveAttribute("href", share);
  const other = await browser.newContext();
  const denied = await other.request.post("/api/resume", {
    data: { shareId: id },
  });
  expect(denied.status()).toBe(403);
  await other.close();
});
