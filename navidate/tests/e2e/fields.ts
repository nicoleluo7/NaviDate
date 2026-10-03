import type { Page } from "@playwright/test";
export async function setDate(page: Page, date: string) {
  const [year, month, day] = date.split("-");
  const field = page.locator(".date-field");
  await field.getByRole("spinbutton", { name: /month/i }).fill(month);
  await field.getByRole("spinbutton", { name: /day/i }).fill(day);
  await field.getByRole("spinbutton", { name: /year/i }).fill(year);
  await field.getByRole("spinbutton", { name: /year/i }).press("Tab");
}
export async function selectOption(page: Page, label: string, option: string) {
  await page
    .getByRole("button", { name: new RegExp(label.replace(/[?]/g, "\\?")) })
    .click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
