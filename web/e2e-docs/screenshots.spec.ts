// Generates the screenshots in docs/images/. Run with `make screenshots` (see playwright.screenshots.config.ts).
// Builds a realistic demo state on a fresh chain, then captures every page as the relevant role.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseEther, zeroAddress, type Address } from "viem";
import { foundry } from "viem/chains";
import { deployments, mockErc20Abi, openRaiseAbi } from "../src/generated/contracts";

const RPC = "http://127.0.0.1:8600";
const OUT = join(__dirname, "..", "..", "docs", "images");
const COVERS = join(__dirname, "covers");
const RAISE = deployments[31337].openRaise;
const TOKEN = deployments[31337].mockToken;
const [OWNER, BACKER_A, BACKER_B] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
] as const satisfies readonly Address[];

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
// Anvil's dev accounts are unlocked, so the node signs; no keys involved.
const wallet = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });

async function send(from: Address, functionName: string, args: readonly unknown[], value = 0n) {
  const hash = await wallet(from).writeContract({ address: RAISE, abi: openRaiseAbi, functionName, args, value } as never);
  await pub.waitForTransactionReceipt({ hash });
}
async function token(from: Address, functionName: "faucet" | "approve", args: readonly unknown[] = []) {
  const hash = await wallet(from).writeContract({ address: TOKEN, abi: mockErc20Abi, functionName, args } as never);
  await pub.waitForTransactionReceipt({ hash });
}
async function advance(seconds: number) {
  await pub.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
  await pub.request({ method: "evm_mine" as never, params: [] as never });
}
const now = async () => (await pub.getBlock()).timestamp;
const cover = (name: string) => `ipfs://bafkdocs${name}`;

/** Demo story: one success awaiting withdrawal, one failure with a partial refund, a cancelled and a hidden campaign. */
async function buildDemoState() {
  execSync(`${process.env.HOME}/.foundry/bin/forge script script/Seed.s.sol --rpc-url ${RPC} --broadcast --silent`, {
    cwd: join(__dirname, "..", "..", "contracts"),
    stdio: "ignore",
  });
  for (const [id, art] of [[1n, "garden"], [2n, "zine"], [3n, "lab"], [4n, "node"], [5n, "explorer"]] as const) {
    await send(OWNER, "updateImage", [id, cover(art)]);
  }
  // A contribution history over several hours, for the owner's chart.
  await advance(2 * 3600);
  await send(BACKER_A, "contribute", [4n, parseEther("1.2")], parseEther("1.2"));
  await advance(3 * 3600);
  await send(BACKER_B, "contribute", [4n, parseEther("0.8")], parseEther("0.8"));
  await advance(4 * 3600);
  await send(BACKER_A, "contribute", [4n, parseEther("0.5")], parseEther("0.5"));
  // Second token contribution.
  await token(BACKER_B, "faucet");
  await token(BACKER_B, "approve", [RAISE, 400_000_000n]);
  await send(BACKER_B, "contribute", [3n, 400_000_000n]);
  // #2 failed: one of two backers claims a refund.
  await send(BACKER_A, "refund", [2n]);
  // #6 cancelled by its owner after a contribution; #7 hidden by the admin.
  const t = await now();
  const base = { asset: zeroAddress, goal: parseEther("3"), deadline: t + 14n * 86_400n, description: "" };
  await send(BACKER_B, "createCampaign", [
    { ...base, title: "Neighbourhood Repair Café", description: "Tools and a monthly venue for fixing things instead of binning them.", creatorName: "Fix-It Friends", category: "Community", imageURI: cover("repair") },
  ]);
  await send(BACKER_A, "contribute", [6n, parseEther("0.5")], parseEther("0.5"));
  await send(BACKER_B, "cancelCampaign", [6n]);
  await send(BACKER_B, "createCampaign", [
    { ...base, title: "Night Market Lighting", description: "Example of a campaign hidden by moderation.", creatorName: "Market Crew", category: "Public goods", imageURI: "" },
  ]);
  await send(OWNER, "setHidden", [7n, true]);
}

const visible = (l: Locator) => l.filter({ visible: true });

async function connectAs(page: Page, index: 0 | 1 | 2) {
  const header = page.locator("header");
  const account = header.getByTitle("Account");
  if (await account.isVisible()) {
    await account.click();
    await page.getByRole("menuitem", { name: "Disconnect" }).click();
  }
  await header.getByRole("button", { name: /Connect/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Anvil #${index}`) }).click();
  await expect(header.getByTitle("Account")).toBeVisible();
}

async function shot(page: Page, name: string, opts: { full?: boolean; ready?: Locator } = {}) {
  if (opts.ready) await expect(opts.ready).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600); // let countdowns and images settle
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: opts.full ?? true });
}

test("capture docs screenshots", async ({ page }) => {
  await buildDemoState();
  await page.route("https://gw.docs.local/ipfs/**", (route) => {
    const art = new URL(route.request().url()).pathname.split("bafkdocs")[1];
    route.fulfill({ contentType: "image/svg+xml", body: readFileSync(join(COVERS, `${art}.svg`)) });
  });
  const h1 = (name: string | RegExp) => visible(page.getByRole("heading", { level: 1, name }));
  await page.setViewportSize({ width: 1440, height: 900 });

  // Public pages (a backer is connected so the header looks like a real session).
  await page.goto("/");
  await connectAs(page, 2);
  await shot(page, "home", { full: false, ready: page.getByText("Fund Open Builders, Together") });
  await shot(page, "home-full", { ready: page.getByText("Frequently Asked Questions") });
  await page.goto("/campaigns");
  await shot(page, "explore", { ready: visible(page.getByText("Community RPC Node for Dev Meetups")).first() });
  await page.goto("/campaigns/4");
  await shot(page, "campaign", { ready: h1("Community RPC Node for Dev Meetups") });
  await page.goto("/campaigns/2");
  await shot(page, "campaign-refund", { ready: visible(page.getByRole("button", { name: /Claim refund/ })) });
  await page.goto("/activity");
  await shot(page, "activity", { ready: visible(page.getByTestId("event-table")).locator("tr").first() });
  await page.goto("/rules");
  await shot(page, "rules", { ready: h1("One deadline, two ways out") });

  // Backer dashboard.
  await connectAs(page, 1);
  await page.goto("/dashboard/backed");
  await shot(page, "dashboard-backed", { ready: visible(page.getByTestId("backed-campaigns")) });

  // Owner: create, overview, manage, edit.
  await connectAs(page, 0);
  await page.goto("/create");
  await visible(page.getByLabel("Campaign title")).fill("Open Hardware Weather Stations");
  await visible(page.getByLabel("Team or DAO name")).fill("Sky Sensors");
  await visible(page.getByRole("radio", { name: "Hardware" })).click();
  await visible(page.getByLabel("Description")).fill("Ten solar-powered weather stations for local schools, with open data and open schematics.");
  await visible(page.getByLabel("Funding goal")).fill("6");
  await shot(page, "create", { ready: page.getByText(/Est. gas/) });
  await page.goto("/dashboard");
  await shot(page, "dashboard-overview", { ready: visible(page.getByTestId("needs-action")) });
  await page.goto("/dashboard/campaigns");
  await shot(page, "dashboard-campaigns", { ready: visible(page.getByTestId("owned-campaigns")) });
  await page.goto("/dashboard/campaigns/4");
  const chart = visible(page.locator('svg[role="img"][aria-label^="Total contributed"]'));
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await shot(page, "dashboard-manage", { ready: chart });
  await page.goto("/dashboard/campaigns/4/edit");
  await shot(page, "dashboard-edit", { ready: visible(page.getByText("Locked terms")) });

  // Admin (account #0 deployed the registry).
  await page.goto("/dashboard/admin");
  await shot(page, "admin-moderation", { ready: visible(page.getByTestId("admin-campaigns")) });
  await page.goto("/dashboard/admin/contributions");
  await shot(page, "admin-contributions", { ready: visible(page.getByTestId("ledger")) });
  await page.goto("/dashboard/admin/contracts");
  await shot(page, "admin-contracts", { ready: visible(page.getByRole("heading", { name: "Accepted tokens" })) });

  // Mobile.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await shot(page, "mobile-home", { full: false, ready: page.getByText("Fund Open Builders, Together") });
  await page.goto("/campaigns/4");
  await shot(page, "mobile-campaign", { full: false, ready: h1("Community RPC Node for Dev Meetups") });
  await page.getByRole("button", { name: "Open menu" }).click();
  await shot(page, "mobile-menu", { full: false, ready: page.getByRole("navigation", { name: "Mobile" }) });
});
