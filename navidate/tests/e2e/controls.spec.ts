import { test, expect } from "@playwright/test";
import { setDate, selectOption } from "./fields";

test("themed controls support calendar selection, time choices and keyboard dismissal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?new=1");
  await expect(
    page.getByRole("button", { name: "Find our date", exact: true }),
  ).toBeEnabled();
  await setDate(page, "2026-10-02");
  await page.getByRole("button", { name: /^Choose date/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose your date" }),
  ).toBeVisible();
  await expect(page.locator(".calendar-header")).toContainText("October 2026");
  await page.screenshot({
    path: `test-results/calendar-${test.info().project.name}.png`,
  });
  await page.locator(".calendar-day").filter({ hasText: /^3$/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose your date" }),
  ).not.toBeVisible();
  await expect(
    page.locator(".date-field").getByRole("spinbutton", { name: /day/i }),
  ).toHaveAttribute("aria-valuenow", "3");
  await page
    .getByRole("button", { name: "Choose start time", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Choose a start time" }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: "1:45 PM", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/time-${test.info().project.name}.png`,
  });
  await page.getByRole("option", { name: "1:45 PM", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose a start time" }),
  ).not.toBeVisible();
  await selectOption(page, "Where are we starting?", "Ithaca Commons");
  const location = page.getByRole("button", { name: /Where are we starting/ });
  await location.click();
  await page.screenshot({
    path: `test-results/dropdown-${test.info().project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(location).toBeFocused();
  await expect(page.getByRole("listbox")).not.toBeVisible();
  const request = page.waitForRequest((r) => r.url().endsWith("/api/plan"));
  await page
    .getByRole("button", { name: "Find our date", exact: true })
    .click();
  expect((await request).postDataJSON().criteria).toMatchObject({
    date: "2026-10-03",
    time: "13:45",
    start: { id: "commons" },
  });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("time picker preserves midnight, noon and exact typed minutes", async ({
  page,
}) => {
  await page.route("**/api/plan", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plans: [],
        notices: [],
        ai: false,
        draftId: "control-test",
      }),
    }),
  );
  await page.goto("/?new=1");
  await expect(
    page.getByRole("button", { name: "Find our date", exact: true }),
  ).toBeEnabled();
  for (const [choice, expected] of [
    ["12:00 AM", "00:00"],
    ["12:00 PM", "12:00"],
  ]) {
    await page
      .getByRole("button", { name: "Choose start time", exact: true })
      .click();
    await page.getByRole("option", { name: choice, exact: true }).click();
    const submitted = page.waitForRequest((r) => r.url().endsWith("/api/plan"));
    await page
      .getByRole("button", { name: "Find our date", exact: true })
      .click();
    expect((await submitted).postDataJSON().criteria.time).toBe(expected);
    await expect(
      page.getByRole("button", { name: "Find our date", exact: true }),
    ).toBeEnabled();
  }
  await page.getByRole("spinbutton", { name: /minute, Start time/ }).fill("07");
  await page
    .getByRole("spinbutton", { name: /minute, Start time/ })
    .press("Tab");
  const submitted = page.waitForRequest((r) => r.url().endsWith("/api/plan"));
  await page
    .getByRole("button", { name: "Find our date", exact: true })
    .click();
  expect((await submitted).postDataJSON().criteria.time).toBe("12:07");
});
