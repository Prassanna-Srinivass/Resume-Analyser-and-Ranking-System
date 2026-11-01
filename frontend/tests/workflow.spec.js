import { test, expect } from "@playwright/test";
test("complete prompt experiment lifecycle", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good ideas start with a prompt." }),
  ).toBeVisible();
  await page.getByLabel("Prompt title").fill("Browser lifecycle test");
  await page
    .getByLabel("Your prompt")
    .fill("Explain a REST API using a restaurant analogy.");
  await page
    .getByLabel("Context / input")
    .fill("Audience: first-year students.");
  await page.getByRole("button", { name: "Run prompt", exact: false }).click();
  await expect(page.getByRole("status")).toHaveText("Run saved to history.");
  await expect(page.locator(".response-text")).toContainText("DEMO SIMULATION");
  await page
    .getByLabel("Your prompt")
    .fill("Explain a REST API using three numbered steps.");
  await page.getByRole("button", { name: "Run prompt", exact: false }).click();
  await expect(page.getByRole("status")).toHaveText("Run saved to history.");
  await page.getByLabel(/relevance rating/).selectOption("5");
  await page
    .getByLabel("Feedback note")
    .fill("Clear enough for this audience.");
  await page.getByRole("button", { name: "Save evaluation" }).click();
  await expect(page.getByRole("status")).toHaveText("Evaluation saved.");
  await page.getByRole("button", { name: "History", exact: false }).click();
  const items = page
    .locator(".history-item")
    .filter({ hasText: "Browser lifecycle test" });
  await expect(items).toHaveCount(2);
  await items.nth(0).getByRole("checkbox").check();
  await items.nth(1).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Compare selected (2/2)" }).click();
  await expect(page.locator(".run-detail")).toHaveCount(2);
  await expect(page.locator(".run-detail").nth(0)).toContainText(
    "three numbered steps",
  );
  await expect(page.locator(".run-detail").nth(1)).toContainText(
    "restaurant analogy",
  );
  await page.getByRole("button", { name: "Templates", exact: false }).click();
  await page
    .getByRole("button", { name: "Create template", exact: false })
    .click();
  await page.getByLabel("Template title").fill("Browser template");
  await page
    .getByLabel("Template text")
    .fill("Act as an editor. Rewrite the provided text.");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Template saved.");
  await page.getByRole("button", { name: "Use template" }).click();
  await expect(page.getByLabel("Your prompt")).toHaveValue(
    "Act as an editor. Rewrite the provided text.",
  );
  await page.getByRole("button", { name: "Save prompt", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Prompt saved.");
  await page.reload();
  await page
    .getByRole("button", { name: "Saved prompts", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser template", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Templates", exact: false }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator(".cards .panel")
    .filter({
      has: page.getByRole("heading", { name: "Browser template", exact: true }),
    })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Deleted.");
  await expect(
    page.getByRole("heading", { name: "Browser template", exact: true }),
  ).toHaveCount(0);
  // Keep the development database clean after the test.
  for (const p of await (
    await request.get("http://127.0.0.1:8000/api/prompts")
  ).json())
    if (["Browser lifecycle test", "Browser template"].includes(p.title))
      await request.delete(`http://127.0.0.1:8000/api/prompts/${p.id}`);
  for (const r of await (
    await request.get("http://127.0.0.1:8000/api/runs")
  ).json())
    if (r.title === "Browser lifecycle test")
      await request.delete(`http://127.0.0.1:8000/api/runs/${r.id}`);
  expect(errors).toEqual([]);
});
test("desktop and mobile layouts have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run prompt", exact: false }),
  ).toBeEnabled();
  await page.screenshot({ path: "../docs/playground.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "Playground",
    "History",
    "Compare",
    "Templates",
    "Dashboard",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(name) })
      .first()
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
