import { expect, test, type Locator, type Page } from "@playwright/test";
import { createPublicClient, http, type Address } from "viem";
import { foundry } from "viem/chains";
import { deployments, openRaiseAbi } from "../src/generated/contracts";

const RPC = "http://127.0.0.1:8555";
const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const RAISE = deployments[31337].openRaise;
const ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
] as const satisfies readonly Address[];

// Next (Cache Components) keeps recently visited routes mounted but hidden, so the same form can exist twice in the
// DOM. Users only ever see one; tests must target the visible one.
const visible = (l: Locator) => l.filter({ visible: true });

async function connectAs(page: Page, index: 0 | 1 | 2) {
  const header = page.locator("header");
  const account = header.getByTitle("Account");
  if (await account.isVisible()) {
    await account.click();
    await page.getByRole("menuitem", { name: "Disconnect" }).click();
  }
  await header.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Anvil #${index}`) }).click();
  await expect(header.getByTitle("Account")).toBeVisible();
}

async function createCampaign(
  page: Page,
  opts: { title: string; goal: string; asset?: "eth" | "token"; as?: 0 | 1 | 2 },
) {
  await page.goto("/create");
  await connectAs(page, opts.as ?? 0);
  await visible(page.getByLabel("Campaign title")).fill(opts.title);
  await visible(page.getByLabel("Team or DAO name")).fill("E2E Team");
  await visible(page.getByRole("radio", { name: "Infra" })).click();
  await visible(page.getByLabel("Description")).fill(`E2E: ${opts.title}`);
  if (opts.asset === "token") await visible(page.getByRole("radio", { name: /mUSD/ })).click();
  await visible(page.getByLabel("Funding goal")).fill(opts.goal);
  // Default duration preset: 10 minutes
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.waitForURL(/\/campaigns\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(opts.title);
  await expect(page.getByText("E2E Team").first()).toBeVisible();
  return BigInt(page.url().split("/").pop()!);
}

async function contribute(page: Page, amount: string) {
  await visible(page.getByLabel(/^Amount/)).fill(amount);
  const approve = page.getByRole("button", { name: /Approve/ });
  if (await approve.isVisible()) {
    await approve.click();
    await expect(page.getByRole("button", { name: /Step 2 of 2: Contribute/ })).toBeVisible();
  }
  await page.getByRole("button", { name: /^(Step 2 of 2: )?Contribute \d/ }).click();
  await expect(page.getByRole("heading", { name: /^You backed #\d+/ })).toBeVisible();
}

async function openAccountMenuItem(page: Page, name: string) {
  await page.locator("header").getByTitle("Account").click();
  await page.getByRole("menuitem", { name }).click();
}

async function advanceTime(page: Page, label: string) {
  const tools = page.locator("details", { hasText: "Local dev tools" });
  await tools.locator("summary").click();
  await tools.getByRole("button", { name: label }).click();
}

const statusOf = (id: bigint) => chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "statusOf", args: [id] });
const badge = (page: Page, text: string) => page.locator("main").getByText(new RegExp(`^${text}`)).first();

test("successful campaign: contribute → deadline → owner withdraws once", async ({ page }) => {
  const id = await createCampaign(page, { title: "E2E success", goal: "1" });
  await expect(badge(page, "Active")).toBeVisible();

  await connectAs(page, 1);
  await contribute(page, "1");
  await expect(page.getByTestId("activity")).toContainText("backed with 1 ETH");

  await advanceTime(page, "+1 hour");
  await expect(badge(page, "Successful")).toBeVisible();
  expect(await statusOf(id)).toBe(1);
  await expect(page.getByTestId("eligibility")).toContainText("Only the campaign owner can withdraw");

  await connectAs(page, 0);
  // Owner path: account menu → My dashboard → "Needs your action" → manage page → Withdraw.
  await openAccountMenuItem(page, "My dashboard");
  await page.waitForURL("**/dashboard");
  const todo = page.getByTestId("needs-action").locator("li", { hasText: "E2E success" });
  await expect(todo).toContainText("Withdraw");
  await todo.getByRole("link", { name: /^Withdraw 1 ETH/ }).click();
  await page.waitForURL(`**/dashboard/campaigns/${id}`);
  await expect(page.getByText("Total contributed over time")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Backers · 1/ })).toBeVisible();

  const before = await chain.getBalance({ address: ACCOUNTS[0] });
  await page.getByRole("button", { name: /^Withdraw 1 ETH/ }).click();
  await expect(page.getByText(/Funds withdrawn to your wallet/)).toBeVisible();

  // UI matches contract state.
  expect(await statusOf(id)).toBe(3);
  expect((await chain.getBalance({ address: ACCOUNTS[0] })) > before).toBe(true);
  await expect(page.getByRole("button", { name: /^Withdraw 1 ETH/ })).toHaveCount(0);

  await page.goto(`/campaigns/${id}`);
  await expect(badge(page, "Withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Already withdrawn" })).toBeDisabled();
  await expect(page.getByTestId("activity")).toContainText("Owner withdrew 1 ETH");

  await page.goto("/dashboard/campaigns");
  await expect(page.getByTestId("owned-campaigns").locator("li", { hasText: "E2E success" })).toContainText(
    "Withdrawn to your wallet",
  );
});

test("failed campaign: backer claims refund exactly once; owner cannot withdraw", async ({ page }) => {
  const id = await createCampaign(page, { title: "E2E failure", goal: "5" });

  await connectAs(page, 1);
  await contribute(page, "1.25");

  // Refresh recovery: state and history are rebuilt from the chain.
  await page.reload();
  await expect(page.getByTestId("activity")).toContainText("backed with 1.25 ETH");
  await expect(page.locator("header").getByTitle("Account")).toBeVisible();

  await advanceTime(page, "+1 hour");
  await expect(badge(page, "Failed")).toBeVisible();
  expect(await statusOf(id)).toBe(2);

  await connectAs(page, 0);
  await expect(page.getByTestId("eligibility")).toContainText("owner cannot withdraw");

  await connectAs(page, 1);
  // Backer path: account menu → My dashboard → Backed → "Claim refund" → campaign page.
  await openAccountMenuItem(page, "My dashboard");
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Backed" }).click();
  await page.waitForURL("**/dashboard/backed");
  const backedRow = page.getByTestId("backed-campaigns").locator("li", { hasText: "E2E failure" });
  await expect(backedRow).toContainText("refund available");
  await backedRow.getByRole("link", { name: "Claim refund" }).click();
  await page.waitForURL(new RegExp(`/campaigns/${id}`));
  await page.getByRole("button", { name: /^Claim refund · 1.25 ETH/ }).click();
  await expect(page.getByRole("heading", { name: "1.25 ETH refunded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Already refunded" })).toBeDisabled();
  await expect(page.getByTestId("activity")).toContainText("reclaimed 1.25 ETH");
  await expect(page.getByTestId("eligibility")).toContainText("no contribution to refund");

  const refunded = await chain.readContract({
    address: RAISE,
    abi: openRaiseAbi,
    functionName: "contributionOf",
    args: [id, ACCOUNTS[1]],
  });
  expect(refunded).toBe(0n);

  await page.goto("/dashboard/backed");
  await expect(page.getByTestId("backed-campaigns").locator("li", { hasText: "E2E failure" })).toContainText(
    "Refunded 1.25 ETH to you",
  );
});

test("mock ERC-20 campaign: faucet → approve → contribute", async ({ page }) => {
  await createCampaign(page, { title: "E2E token", goal: "100", asset: "token" });
  await connectAs(page, 2);
  const tools = page.locator("details", { hasText: "Local dev tools" });
  await tools.locator("summary").click();
  await tools.getByRole("button", { name: "Get 10,000 mUSD" }).click();
  await expect(page.getByText("mUSD faucet: Confirmed").first()).toBeVisible();

  await contribute(page, "40");
  await expect(page.getByTestId("activity")).toContainText("backed with 40 mUSD");
});

test("dashboard: events reconcile with contract state and filter by type", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByTestId("event-table")).toContainText("Contributed");
  await page.getByRole("button", { name: "Reconcile with chain" }).click();
  await expect(page.getByRole("status").filter({ hasText: "In sync" })).toBeVisible();
  await page.getByRole("tab", { name: "Refunds", exact: true }).click();
  const rows = page.getByTestId("event-table").locator("tr");
  await expect(rows.first()).toContainText("Refunded");
  for (const text of await rows.allInnerTexts()) expect(text).toContain("Refunded");
});

test("explore shows the new campaign with category and team name", async ({ page }) => {
  await page.goto("/campaigns");
  await page.getByLabel("Search campaigns").fill("E2E success");
  const card = page.getByRole("link", { name: /E2E success/ });
  await expect(card).toContainText("Infra");
  await expect(card).toContainText("by E2E Team");
  await expect(card).toContainText("Withdrawn");
});

test("owner edits details; goal and deadline stay locked; others can't manage", async ({ page }) => {
  const id = await createCampaign(page, { title: "E2E edit me", goal: "3" });
  const before = await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "getCampaign", args: [id] });

  // Public page → "Manage campaign" banner (owner only) → Edit details.
  await page.getByRole("link", { name: "Manage campaign" }).click();
  await page.waitForURL(`**/dashboard/campaigns/${id}`);
  await page.getByRole("link", { name: "Edit details" }).first().click();
  await page.waitForURL(`**/dashboard/campaigns/${id}/edit`);
  await expect(page.getByText("Locked terms")).toBeVisible();
  await expect(page.getByRole("button", { name: "No changes" })).toBeDisabled();

  await page.getByLabel("Campaign title").filter({ visible: true }).fill("E2E edited title");
  await page.getByLabel("Team or DAO name").filter({ visible: true }).fill("Renamed Team");
  await page.getByRole("radio", { name: "Research" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`**/dashboard/campaigns/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E edited title");
  await expect(page.getByText("Owner edited the campaign details").first()).toBeVisible();

  const after = await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "getCampaign", args: [id] });
  expect(after.title).toBe("E2E edited title");
  expect(after.creatorName).toBe("Renamed Team");
  expect(after.category).toBe("Research");
  expect(after.goal).toBe(before.goal);
  expect(after.deadline).toBe(before.deadline);

  // A different wallet can't manage or edit it.
  await connectAs(page, 2);
  await page.goto(`/dashboard/campaigns/${id}/edit`);
  await expect(page.getByRole("heading", { name: "Not your campaign" })).toBeVisible();
  await page.goto(`/campaigns/${id}`);
  await expect(page.getByRole("link", { name: "Manage campaign" })).toHaveCount(0);
});

test("owner cancels a backed campaign; backer is refunded in full before the deadline", async ({ page }) => {
  const id = await createCampaign(page, { title: "E2E cancel me", goal: "10" });
  await connectAs(page, 1);
  await contribute(page, "0.75");

  await connectAs(page, 0);
  await page.goto(`/dashboard/campaigns/${id}`);
  await page.getByRole("button", { name: "Cancel campaign" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("All 1 backer can reclaim their full contribution");
  await dialog.getByRole("button", { name: "Yes, cancel campaign" }).click();
  await expect(page.getByText(/^Cancelled on /)).toBeVisible();
  expect(await statusOf(id)).toBe(4);
  await expect(page.getByRole("link", { name: "Edit details" })).toHaveCount(0);

  // Backer reclaims right away — no need to wait for the deadline.
  await connectAs(page, 1);
  await page.goto(`/campaigns/${id}`);
  await expect(badge(page, "Cancelled")).toBeVisible();
  await page.getByRole("button", { name: /^Claim refund · 0.75 ETH/ }).click();
  await expect(page.getByRole("heading", { name: "0.75 ETH refunded" })).toBeVisible();
  expect(await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "contributionOf", args: [id, ACCOUNTS[1]] })).toBe(0n);

  // Cancelled campaigns leave the homepage.
  await page.goto("/");
  await expect(page.getByText("E2E cancel me")).toHaveCount(0);
});

test("admin hides and cancels another user's campaign; non-admins can't open admin", async ({ page }) => {
  // Campaign owned by account #2; account #0 deployed the registry and is its admin.
  const id = await createCampaign(page, { title: "E2E moderated", goal: "2", as: 2 });

  await page.goto("/dashboard/admin");
  await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();

  await connectAs(page, 0);
  await openAccountMenuItem(page, "Admin");
  await page.waitForURL("**/dashboard/admin");
  const row = page.getByTestId("admin-campaigns").locator("li", { hasText: "E2E moderated" });

  await row.getByRole("button", { name: "Hide" }).click();
  await expect(row.getByRole("button", { name: "Unhide" })).toBeVisible();
  expect((await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "getCampaign", args: [id] })).hidden).toBe(true);

  await page.goto("/campaigns");
  await page.getByLabel("Search campaigns").fill("E2E moderated");
  await expect(page.getByRole("link", { name: /E2E moderated/ })).toHaveCount(0);
  await page.goto(`/campaigns/${id}`);
  await expect(page.getByText("Hidden by the platform admin.")).toBeVisible();

  await page.goto("/dashboard/admin");
  const row2 = page.getByTestId("admin-campaigns").locator("li", { hasText: "E2E moderated" });
  await row2.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, cancel campaign" }).click();
  // Wait for the status badge, not the dialog copy (which also mentions "Cancelled").
  await expect(row2.getByText("Cancelled · refunds open")).toBeVisible();
  expect(await statusOf(id)).toBe(4);

  await page.goto("/activity");
  await page.getByRole("tab", { name: "Cancelled" }).click();
  await expect(page.getByTestId("event-table")).toContainText("CampaignCancelled");
});

test("owner adds a cover image by link; admin removes and locks it", async ({ page }) => {
  const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  // 1×1 PNG served for the fake gateway, so the test never touches real IPFS.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("https://gw.e2e.test/ipfs/**", (r) => r.fulfill({ contentType: "image/png", body: png }));

  const id = await createCampaign(page, { title: "E2E image", goal: "2", as: 2 });

  // Owner: My campaigns → Edit → paste link (upload is off without PINATA_JWT).
  // Next keeps recently visited pages mounted but hidden (React <Activity>), so target visible elements only.
  await openAccountMenuItem(page, "My dashboard");
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "My campaigns" }).click();
  await page.getByTestId("owned-campaigns").locator("li", { hasText: "E2E image" }).getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(`**/dashboard/campaigns/${id}/edit`);
  await expect(page.getByText(/File upload is off/).first()).toBeVisible();

  await page.getByLabel("Image link").filter({ visible: true }).fill("http://insecure.example/x.png");
  await page.getByRole("button", { name: "Use link" }).filter({ visible: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ipfs:// link or an https://" })).toBeVisible();

  await page.getByLabel("Image link").filter({ visible: true }).fill(`ipfs://${CID}`);
  await page.getByRole("button", { name: "Use link" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`**/dashboard/campaigns/${id}`);
  const stored = await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "getCampaign", args: [id] });
  expect(stored.imageURI).toBe(`ipfs://${CID}`);

  await page.goto(`/campaigns/${id}`);
  const img = page.locator(`main img[src="https://gw.e2e.test/ipfs/${CID}"]`).first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

  // Admin removes and locks the image.
  await connectAs(page, 0);
  await openAccountMenuItem(page, "Admin");
  const row = page.getByTestId("admin-campaigns").locator("li", { hasText: "E2E image" });
  await row.getByRole("button", { name: "Remove image" }).click();
  await expect(row.getByText("Image locked")).toBeVisible();
  const after = await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "getCampaign", args: [id] });
  expect(after.imageURI).toBe("");
  expect(after.imageLocked).toBe(true);

  // Owner sees the lock and can't re-add an image.
  await connectAs(page, 2);
  await page.goto(`/dashboard/campaigns/${id}/edit`);
  await expect(page.getByText("Image locked by the platform admin.")).toBeVisible();
  await expect(page.getByLabel("Image link").filter({ visible: true })).toHaveCount(0);
});

test("owner changes the cover image of a failed campaign; text stays frozen", async ({ page }) => {
  const CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("https://gw.e2e.test/ipfs/**", (r) => r.fulfill({ contentType: "image/png", body: png }));

  const id = await createCampaign(page, { title: "E2E failed image", goal: "50" });
  await advanceTime(page, "+1 hour");
  await expect(badge(page, "Failed")).toBeVisible();

  // My campaigns → "Image" (ended campaigns have no Edit, only the image) → manage page cover card.
  await openAccountMenuItem(page, "My dashboard");
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "My campaigns" }).click();
  const row = page.getByTestId("owned-campaigns").locator("li", { hasText: "E2E failed image" });
  await expect(row.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await row.getByRole("link", { name: "Image" }).click();
  await page.waitForURL(`**/dashboard/campaigns/${id}*`);

  const card = visible(page.locator("div", { has: page.getByRole("heading", { name: "Cover image" }) })).last();
  await expect(card).toContainText("title, story and terms are frozen");
  await visible(page.getByLabel("Image link")).fill(`ipfs://${CID}`);
  await visible(page.getByRole("button", { name: "Use link" })).click();
  await visible(page.getByRole("button", { name: "Save image" })).click();
  await expect(visible(page.getByRole("button", { name: "No changes" }))).toBeVisible();

  const c = await chain.readContract({ address: RAISE, abi: openRaiseAbi, functionName: "getCampaign", args: [id] });
  expect(c.imageURI).toBe(`ipfs://${CID}`);
  expect(c.status).toBe(2); // still Failed
  expect(c.title).toBe("E2E failed image");

  await page.goto(`/campaigns/${id}`);
  await expect(page.locator(`main img[src="https://gw.e2e.test/ipfs/${CID}"]`).first()).toBeVisible();
  await expect(page.getByTestId("activity")).toContainText("Owner updated the cover image");
});

test("admin ops: contributions ledger, refunds & withdrawals filter, indexer health, contracts", async ({ page }) => {
  // A non-admin sees no Admin section and can't open the ops pages.
  await page.goto("/dashboard");
  await connectAs(page, 1);
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  await page.goto("/dashboard/admin/contributions");
  await expect(visible(page.getByRole("heading", { name: "Admins only" }))).toBeVisible();

  await connectAs(page, 0);
  const adminNav = page.getByRole("navigation", { name: "Admin" });
  await expect(adminNav).toBeVisible();

  // Contributions: same event data as /activity, plus ledger reconciliation and indexer health.
  await adminNav.getByRole("link", { name: "Contributions" }).click();
  await page.waitForURL("**/dashboard/admin/contributions");
  await expect(visible(page.getByRole("heading", { name: "Contributions", level: 1 }))).toBeVisible();
  const ledger = visible(page.getByTestId("ledger"));
  await expect(ledger.locator("tbody tr").first()).toBeVisible();
  const statuses = await ledger.locator("tbody tr td:last-child").allInnerTexts();
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every((s) => s === "Match")).toBe(true);
  await expect(visible(page.getByRole("heading", { name: "Indexer health" }))).toBeVisible();

  // Refunds & withdrawals preset: only payout events in the table.
  await adminNav.getByRole("link", { name: "Refunds & withdrawals" }).click();
  await page.waitForURL("**/dashboard/admin/contributions?type=payouts");
  await expect(visible(page.getByRole("tab", { name: "Refunds & withdrawals" }))).toHaveAttribute("aria-selected", "true");
  const kinds = await visible(page.getByTestId("event-table")).locator("tr td:nth-child(2)").allInnerTexts();
  expect(kinds.length).toBeGreaterThan(0);
  expect(kinds.every((k) => k === "Refunded" || k === "Withdrawn")).toBe(true);

  // Contracts: live registry address and admin.
  await adminNav.getByRole("link", { name: "Contracts" }).click();
  await page.waitForURL("**/dashboard/admin/contracts");
  await expect(visible(page.getByText(RAISE, { exact: true }))).toBeVisible();
  await expect(visible(page.getByText(ACCOUNTS[0], { exact: true }))).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: "Accepted tokens" }))).toBeVisible();
});
