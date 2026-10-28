import { formatUnits, parseUnits, zeroAddress, type Address } from "viem";

export enum Status {
  Active = 0,
  Successful = 1,
  Failed = 2,
  Withdrawn = 3,
  Cancelled = 4,
}

export const STATUS_LABEL: Record<Status, string> = {
  [Status.Active]: "Active",
  [Status.Successful]: "Successful",
  [Status.Failed]: "Failed",
  [Status.Withdrawn]: "Withdrawn",
  [Status.Cancelled]: "Cancelled",
};

export const CATEGORIES = [
  "Tooling",
  "Infra",
  "Education",
  "Public goods",
  "Hardware",
  "Security",
  "Community",
  "Research",
] as const;

/** Up to two initials for an avatar, from a display name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const chars = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[1]][0]];
  return chars.join("").toUpperCase();
}

export type AssetMeta = { address: Address; symbol: string; decimals: number };

export const ETH_META: AssetMeta = { address: zeroAddress, symbol: "ETH", decimals: 18 };

/** Formats base units for display, trimming to `maxFraction` digits without rounding up. */
export function formatAmount(value: bigint, decimals: number, maxFraction = 4): string {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Parses a user-entered decimal string into base units. Returns null for invalid or non-positive input. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const fraction = s.split(".")[1];
  if (fraction && fraction.length > decimals) return null;
  try {
    const v = parseUnits(s, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Progress in basis points (0-10000+), integer math only. */
export function progressBps(raised: bigint, goal: bigint): number {
  if (goal === 0n) return 0;
  return Number((raised * 10_000n) / goal);
}

/** Short relative time, e.g. "12s ago", "3m ago", "2h ago", "4d ago". */
export function timeAgo(then: bigint, now: bigint): string {
  const s = Number(now - then);
  if (s < 60) return `${Math.max(0, s)}s ago`;
  if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3_600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function formatDuration(seconds: bigint): string {
  if (seconds <= 0n) return "ended";
  const s = Number(seconds);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s % 60}s left`;
  return `${s}s left`;
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function explorerTxUrl(chainId: number | undefined, hash: string): string | undefined {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${hash}`;
  return undefined;
}

export type Eligibility =
  | { kind: "contribute" }
  | { kind: "withdraw" }
  | { kind: "refund"; amount: bigint }
  | { kind: "none"; reason: string };

/** What the connected account can do on a campaign. Mirrors the contract's rules; the contract stays authoritative. */
export function eligibility(args: {
  status: Status;
  owner: Address;
  account: Address | undefined;
  contribution: bigint;
}): Eligibility {
  const { status, owner, account, contribution } = args;
  if (status === Status.Active) return { kind: "contribute" };
  if (!account) return { kind: "none", reason: "Connect a wallet to see what you can do." };
  const isOwner = account.toLowerCase() === owner.toLowerCase();
  if (status === Status.Successful) {
    return isOwner
      ? { kind: "withdraw" }
      : { kind: "none", reason: "Goal reached. Only the campaign owner can withdraw; no refunds." };
  }
  if (status === Status.Withdrawn) return { kind: "none", reason: "Funds were withdrawn by the owner." };
  if (status === Status.Cancelled) {
    if (contribution > 0n) return { kind: "refund", amount: contribution };
    return {
      kind: "none",
      reason: isOwner
        ? "Campaign cancelled. Backers can reclaim their contributions; nothing can be withdrawn."
        : "Campaign cancelled. You have no contribution to refund (or already claimed it).",
    };
  }
  // Failed
  if (contribution > 0n) return { kind: "refund", amount: contribution };
  return {
    kind: "none",
    reason: isOwner
      ? "Goal not reached. Contributors can claim refunds; the owner cannot withdraw."
      : "Goal not reached. You have no contribution to refund (or already claimed it).",
  };
}
