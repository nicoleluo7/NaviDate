import { test, expect } from "@playwright/test";
test("browse restaurants, select a required stop and clear it when changing date type", async ({
  page,
}) => {
  await page.route("**/api/restaurants", (r) =>
    r.fulfill({
      json: {
        places: [
          {
            id: "fixture-restaurant",
            name: "Fictional Bistro",
            address: "Test address, Ithaca",
            estimatedCostForTwo: 60,
          },
        ],
      },
    }),
  );
  await page.route("**/api/plan", (r) =>
    r.fulfill({
      json: { plans: [], notices: ["Mocked restaurant request"], ai: false },
    }),
  );
  await page.goto("/?new=1");
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByRole("button", { name: "Browse restaurants" }).click();
  await expect(
    page.getByText("Fictional Bistro", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  const request = page.waitForRequest((r) => r.url().endsWith("/api/plan"));
  await page
    .getByRole("button", { name: "Find my date", exact: true })
    .click();
  expect((await request).postDataJSON().criteria.restaurantId).toBe(
    "fixture-restaurant",
  );
  await page.getByRole("button", { name: "Coffee", exact: true }).click();
  const next = page.waitForRequest((r) => r.url().endsWith("/api/plan"));
  await page
    .getByRole("button", { name: "Find my date", exact: true })
    .click();
  expect((await next).postDataJSON().criteria.restaurantId).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
