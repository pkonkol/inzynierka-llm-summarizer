import { expect, type Page, test } from "@playwright/test";
import { ARTICLE_TEXT, STABLE_ARTICLE_URL } from "./fixtures";

async function summarizeOnPublicPage(page: Page, source: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Adres artykułu albo jego treść" }).fill(source);
  await page.getByRole("button", { name: "Podsumuj" }).click();

  const summary = page.getByRole("article");
  await expect(summary.getByRole("heading", { level: 2 })).not.toBeEmpty({ timeout: 120_000 });
  await expect(summary.getByRole("paragraph").first()).not.toBeEmpty();
}

test("pasted text gets a summary", async ({ page }) => {
  await summarizeOnPublicPage(page, ARTICLE_TEXT);
});

test("url gets a summary @smoke @long", async ({ page }) => {
  test.setTimeout(180_000);
  await summarizeOnPublicPage(page, STABLE_ARTICLE_URL);
});
