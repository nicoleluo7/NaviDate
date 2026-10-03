import { test, expect } from "@playwright/test";
test("location sharing is opt-in and produces coordinates only after a tap", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 42.4396,
    longitude: -76.4966,
    accuracy: 20,
  });
  await page.goto("/location");
  await expect(
    page.getByText("42.439600, -76.496600", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(
    page.getByText("42.439600, -76.496600", { exact: true }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Send location to Navi" });
  if (await link.count())
    expect(decodeURIComponent((await link.getAttribute("href"))!)).toContain(
      "Start from my location: 42.439600, -76.496600",
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("denied location offers a landmark fallback", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number }) => void,
        ) => error({ code: 1 }),
      },
    }),
  );
  await page.goto("/location");
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByRole("status")).toContainText("permission was denied");
  await expect(
    page.getByRole("link", { name: "Or choose a landmark on Navidate" }),
  ).toBeVisible();
});
