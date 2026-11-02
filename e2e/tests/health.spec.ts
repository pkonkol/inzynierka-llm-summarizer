import { expect, test } from "./fixtures";

test("api reports healthy @smoke", async ({ request, apiUrl }) => {
  const response = await request.get(`${apiUrl}/health`);

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
