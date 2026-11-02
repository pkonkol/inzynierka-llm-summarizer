import { ARTICLE_TEXT, E2E_OLLAMA_MODEL, expect, test } from "./fixtures";

test("login with password opens the console", async ({ page, adminPassword }) => {
  await page.goto("/login");
  await page.getByLabel("Hasło").fill(adminPassword);
  await page.getByRole("button", { name: "Wejdź" }).click();

  await expect(page.getByText("[✓] Zalogowano")).toBeVisible();
});

test("jobs list opens a job @smoke", async ({ adminPage: page, seededJobId }) => {
  await page.goto("/admin/jobs");
  const jobLinks = page.getByRole("main").getByRole("listitem").getByRole("link");
  // Production is read-only, so there the newest completed job stands in for the seeded one.
  const jobToOpen = seededJobId
    ? page.locator(`a[href="/admin/jobs/${seededJobId}"]`)
    : jobLinks.filter({ hasText: "gotowe" }).first();
  await jobToOpen.click();

  await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]{36}$/);
  const details = page.getByRole("complementary");
  await expect(details.getByRole("heading", { name: "Podsumowanie", level: 4 })).toBeVisible();
  await expect(details.getByRole("article").getByRole("paragraph").first()).not.toBeEmpty();
});

test("evaluation sets list loads @smoke", async ({ adminPage: page }) => {
  await page.goto("/admin/research");

  await expect(page.getByRole("heading", { name: "Zbiory ewaluacyjne", level: 1 })).toBeVisible();
});

test("new admin job from pasted text completes", async ({ adminPage: page }) => {
  test.setTimeout(120_000);
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "Adres artykułu albo jego treść" }).fill(ARTICLE_TEXT);
  await page
    .getByRole("combobox", { name: "Model" })
    .selectOption({ label: `ollama – ${E2E_OLLAMA_MODEL}` });
  const created = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/jobs/summarize"),
  );
  await page.getByRole("button", { name: "Podsumuj" }).click();
  const { job_id: jobId } = (await (await created).json()) as { job_id: string };

  const ownJob = page.locator(`a[href="/admin/jobs/${jobId}"]`).first();
  await expect(ownJob).toContainText("gotowe", { timeout: 90_000 });
  await expect(ownJob).toContainText(`ollama:${E2E_OLLAMA_MODEL}`);
});
