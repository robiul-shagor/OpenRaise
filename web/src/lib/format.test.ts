import { describe, expect, it } from "vitest";
import { eligibility, formatAmount, formatDuration, initials, parseAmount, progressBps, Status, timeAgo } from "./format";

const OWNER = "0x00000000000000000000000000000000000000aa" as const;
const ALICE = "0x00000000000000000000000000000000000000bb" as const;

describe("formatAmount", () => {
  it("formats base units without floating point", () => {
    expect(formatAmount(1_500_000_000_000_000_000n, 18)).toBe("1.5");
    expect(formatAmount(2_500_000_000n, 6)).toBe("2,500");
    expect(formatAmount(1n, 18)).toBe("0");
    expect(formatAmount(1n, 18, 18)).toBe("0.000000000000000001");
    expect(formatAmount(123_456_789n, 6, 2)).toBe("123.45");
  });
});

describe("parseAmount", () => {
  it("parses decimal strings to base units", () => {
    expect(parseAmount("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseAmount("600", 6)).toBe(600_000_000n);
    expect(parseAmount("0.000001", 6)).toBe(1n);
  });
  it("rejects invalid, zero, negative and over-precise input", () => {
    for (const bad of ["", "abc", "0", "0.0", "-1", "1e18", "1.", ".5", "0.0000001"]) {
      expect(parseAmount(bad, 6)).toBeNull();
    }
  });
});

describe("progressBps", () => {
  it("uses integer math and can exceed 100%", () => {
    expect(progressBps(5n, 10n)).toBe(5_000);
    expect(progressBps(10n, 10n)).toBe(10_000);
    expect(progressBps(15n, 10n)).toBe(15_000);
    expect(progressBps(1n, 3n)).toBe(3_333);
    expect(progressBps(1n, 0n)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats remaining time", () => {
    expect(formatDuration(0n)).toBe("ended");
    expect(formatDuration(-5n)).toBe("ended");
    expect(formatDuration(45n)).toBe("45s left");
    expect(formatDuration(125n)).toBe("2m 5s left");
    expect(formatDuration(3_660n)).toBe("1h 1m left");
    expect(formatDuration(90_000n)).toBe("1d 1h left");
  });
});

describe("eligibility", () => {
  const base = { owner: OWNER, contribution: 0n };
  it("allows contributing while active", () => {
    expect(eligibility({ ...base, status: Status.Active, account: ALICE }).kind).toBe("contribute");
  });
  it("lets only the owner withdraw a successful campaign", () => {
    expect(eligibility({ ...base, status: Status.Successful, account: OWNER }).kind).toBe("withdraw");
    expect(eligibility({ ...base, status: Status.Successful, account: ALICE }).kind).toBe("none");
  });
  it("matches owner address case-insensitively", () => {
    const upper = OWNER.toUpperCase().replace("0X", "0x") as `0x${string}`;
    expect(eligibility({ ...base, status: Status.Successful, account: upper }).kind).toBe("withdraw");
  });
  it("offers refunds only to contributors of failed campaigns", () => {
    expect(eligibility({ ...base, status: Status.Failed, account: ALICE, contribution: 7n })).toEqual({
      kind: "refund",
      amount: 7n,
    });
    expect(eligibility({ ...base, status: Status.Failed, account: ALICE }).kind).toBe("none");
    expect(eligibility({ ...base, status: Status.Failed, account: OWNER }).kind).toBe("none");
  });
  it("offers refunds to backers of cancelled campaigns, even with the goal met", () => {
    expect(eligibility({ ...base, status: Status.Cancelled, account: ALICE, contribution: 9n })).toEqual({
      kind: "refund",
      amount: 9n,
    });
    const owner = eligibility({ ...base, status: Status.Cancelled, account: OWNER });
    expect(owner.kind).toBe("none");
    expect(owner.kind === "none" && owner.reason).toMatch(/nothing can be withdrawn/);
  });
  it("offers nothing after withdrawal", () => {
    expect(eligibility({ ...base, status: Status.Withdrawn, account: OWNER, contribution: 1n }).kind).toBe("none");
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Green Corner Collective")).toBe("GC");
    expect(initials("maker")).toBe("MA");
    expect(initials("  ")).toBe("?");
  });
});

describe("timeAgo", () => {
  it("formats relative time", () => {
    expect(timeAgo(100n, 112n)).toBe("12s ago");
    expect(timeAgo(0n, 180n)).toBe("3m ago");
    expect(timeAgo(0n, 7_200n)).toBe("2h ago");
    expect(timeAgo(0n, 172_800n)).toBe("2d ago");
  });
});
