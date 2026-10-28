import { describe, expect, it } from "vitest";
import { zeroAddress, type Address } from "viem";
import { campaignStats, type ActivityItem, type CampaignView } from "./hooks";
import { reconcile } from "@/app/activity/dashboard";
import { Status } from "./format";

const A = "0x00000000000000000000000000000000000000aa" as Address;
const B = "0x00000000000000000000000000000000000000bb" as Address;
let n = 0;
const ev = (kind: ActivityItem["kind"], campaignId: bigint, actor: Address, amount?: bigint, ts = 0n): ActivityItem => ({
  kind,
  campaignId,
  actor,
  amount,
  txHash: `0x${(++n).toString(16).padStart(64, "0")}`,
  blockNumber: BigInt(n),
  logIndex: 0,
  timestamp: ts,
});

// useEvents returns newest first
const newestFirst = (xs: ActivityItem[]) => [...xs].reverse();

describe("campaignStats", () => {
  it("aggregates unique backers, totals and refunds per campaign", () => {
    const events = newestFirst([
      ev("CampaignCreated", 1n, A),
      ev("Contributed", 1n, A, 3n, 10n),
      ev("Contributed", 1n, B, 2n, 20n),
      ev("Contributed", 1n, A.toUpperCase().replace("0X", "0x") as Address, 4n, 30n),
      ev("Contributed", 2n, B, 100n),
      ev("Refunded", 1n, B, 2n),
    ]);
    const s = campaignStats(events, 1n);
    expect(s.backers).toBe(2);
    expect(s.contributions).toBe(3);
    expect(s.createdBlock).toBeDefined();
    const [top, second] = s.backerRows;
    expect(top.total).toBe(7n);
    expect(top.txs).toBe(2);
    expect(top.last).toBe(30n);
    expect(top.refunded).toBe(false);
    expect(second.total).toBe(2n);
    expect(second.refunded).toBe(true);
  });
});

describe("reconcile", () => {
  const campaign = (over: Partial<CampaignView>): CampaignView => ({
    id: 1n,
    owner: A,
    asset: zeroAddress,
    goal: 10n,
    deadline: 0n,
    raised: 5n,
    refunded: 0n,
    status: Status.Failed,
    title: "t",
    description: "",
    creatorName: "n",
    category: "c",
    imageURI: "",
    hidden: false,
    imageLocked: false,
    ...over,
  });

  it("passes when event totals match contract state", () => {
    const events = [ev("Contributed", 1n, A, 5n), ev("Refunded", 1n, A, 5n)];
    expect(reconcile([campaign({ refunded: 5n })], events)).toEqual([]);
  });

  it("checks cancellation events against the Cancelled status", () => {
    const events = [ev("Contributed", 1n, A, 5n), ev("CampaignCancelled", 1n, A)];
    expect(reconcile([campaign({ status: Status.Cancelled })], events)).toEqual([]);
    expect(reconcile([campaign({ status: Status.Active })], events).map((m) => m.reason)).toEqual([
      "CampaignCancelled event ≠ status",
    ]);
  });

  it("flags raised, refunded and withdrawal mismatches", () => {
    const events = [ev("Contributed", 1n, A, 4n), ev("Withdrawn", 1n, A, 4n)];
    const reasons = reconcile([campaign({ refunded: 1n })], events).map((m) => m.reason);
    expect(reasons).toEqual(["raised ≠ Σ Contributed", "refunded ≠ Σ Refunded", "Withdrawn event ≠ status"]);
  });
});
