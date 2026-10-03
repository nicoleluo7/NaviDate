import { test, expect } from "@playwright/test";
test("GPS selects a private Ithaca start", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 42.4396,
    longitude: -76.4966,
    accuracy: 20,
  });
  await page.goto("/?new=1");
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(page.locator("#location-status")).toContainText(
    "Current location selected",
  );
  const response = page.waitForRequest(
    (r) => r.url().endsWith("/api/plan") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Find our date", exact: true })
    .click();
  const request = await response;
  expect(request.postDataJSON().criteria.start).toMatchObject({
    lat: 42.4396,
    lng: -76.4966,
    private: true,
  });
});
test("out-of-area GPS keeps the existing start", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 40.7,
    longitude: -74,
    accuracy: 20,
  });
  await page.goto("/?new=1");
  const start = page.getByRole("button", { name: /Where are we starting/ });
  const before = await start.textContent();
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(page.locator("#location-status")).toContainText("outside");
  await expect(start).toHaveText(before!);
});
test("permission denial offers a usable fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number }) => void,
        ) => error({ code: 1 }),
      },
    });
  });
  await page.goto("/?new=1");
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(page.locator("#location-status")).toContainText(
    "permission was denied",
  );
  await expect(
    page.getByRole("button", { name: "Choose on map", exact: true }),
  ).toBeEnabled();
});
