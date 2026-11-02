import { test } from "./fixtures";

// Starting point for the Playwright planner agent: the public page and the admin console, logged in.
test("seed", async ({ adminPage: page }) => {
  await page.goto("/");
});
