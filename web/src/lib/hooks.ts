"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address, zeroAddress } from "viem";
import { useBlock, useChainId, useConnection, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { getDeployment, mockErc20Abi, openRaiseAbi } from "./contracts";
import { ETH_META, type AssetMeta, Status } from "./format";

export type CampaignView = {
  id: bigint;
  owner: Address;
  asset: Address;
  goal: bigint;
  deadline: bigint;
  raised: bigint;
  refunded: bigint;
  status: Status;
  title: string;
  description: string;
  creatorName: string;
  category: string;
  imageURI: string;
  hidden: boolean;
  imageLocked: boolean;
};

/** The chain the app reads from: the wallet's chain if it has a deployment, else local Anvil. */
export function useAppChain() {
  const walletChainId = useChainId();
  const deployment = getDeployment(walletChainId);
  return { chainId: walletChainId, deployment, supported: Boolean(deployment) };
}

export function useCampaigns(limit: number) {
  const { chainId, deployment } = useAppChain();
  const q = useReadContract({
    chainId,
    address: deployment?.openRaise,
    abi: openRaiseAbi,
    functionName: "getCampaigns",
    args: [0n, BigInt(limit)],
    query: { enabled: Boolean(deployment), refetchInterval: 5_000 },
  });
  const count = useReadContract({
    chainId,
    address: deployment?.openRaise,
    abi: openRaiseAbi,
    functionName: "campaignCount",
    query: { enabled: Boolean(deployment), refetchInterval: 5_000 },
  });
  return { ...q, data: q.data as readonly CampaignView[] | undefined, total: count.data };
}

export function useCampaign(id: bigint) {
  const { chainId, deployment } = useAppChain();
  const q = useReadContract({
    chainId,
    address: deployment?.openRaise,
    abi: openRaiseAbi,
    functionName: "getCampaign",
    args: [id],
    query: { enabled: Boolean(deployment), refetchInterval: 5_000, retry: false },
  });
  return { ...q, data: q.data as CampaignView | undefined };
}

export function useContribution(id: bigint, account: Address | undefined) {
  const { chainId, deployment } = useAppChain();
  return useReadContract({
    chainId,
    address: deployment?.openRaise,
    abi: openRaiseAbi,
    functionName: "contributionOf",
    args: [id, account ?? zeroAddress],
    query: { enabled: Boolean(deployment && account), refetchInterval: 5_000 },
  });
}

/** Symbol/decimals for ETH or an ERC-20. Never assume decimals — read them. */
export function useAssetMeta(asset: Address | undefined): AssetMeta | undefined {
  const { chainId } = useAppChain();
  const isToken = Boolean(asset && asset !== zeroAddress);
  const { data } = useReadContracts({
    contracts: [
      { chainId, address: asset, abi: mockErc20Abi, functionName: "symbol" },
      { chainId, address: asset, abi: mockErc20Abi, functionName: "decimals" },
    ],
    query: { enabled: isToken, staleTime: Infinity },
  });
  return useMemo(() => {
    if (!asset) return undefined;
    if (!isToken) return ETH_META;
    const symbol = data?.[0]?.result;
    const decimals = data?.[1]?.result;
    return symbol !== undefined && decimals !== undefined ? { address: asset, symbol, decimals } : undefined;
  }, [asset, isToken, data]);
}

export function useTokenState(token: Address | undefined, spender: Address | undefined) {
  const { chainId } = useAppChain();
  const { address } = useConnection();
  return useReadContracts({
    contracts: [
      { chainId, address: token, abi: mockErc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress] },
      {
        chainId,
        address: token,
        abi: mockErc20Abi,
        functionName: "allowance",
        args: [address ?? zeroAddress, spender ?? zeroAddress],
      },
    ],
    query: { enabled: Boolean(token && spender && address), refetchInterval: 5_000 },
  });
}

/**
 * Estimated current chain time. Uses the latest block timestamp plus wall-clock time elapsed since it
 * was observed, so countdowns tick between blocks and follow Anvil time travel.
 */
export function useChainNow(): bigint | undefined {
  const { chainId } = useAppChain();
  const { data: block } = useBlock({ chainId, watch: true, query: { refetchInterval: 4_000 } });
  // Wall clock is read only in the browser (tick = 0 during prerender).
  const [tick, setTick] = useState(0);
  const [observed, setObserved] = useState<{ timestamp: bigint; at: number }>();

  // Record when a new block timestamp was first seen (state adjusted during render, not in an effect).
  if (block && tick !== 0 && observed?.timestamp !== block.timestamp) {
    setObserved({ timestamp: block.timestamp, at: tick });
  }

  useEffect(() => {
    const update = () => setTick(Date.now());
    const first = setTimeout(update, 0);
    const t = setInterval(update, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  if (!block) return undefined;
  if (observed?.timestamp !== block.timestamp) return block.timestamp;
  return block.timestamp + BigInt(Math.max(0, Math.floor((tick - observed.at) / 1_000)));
}

export type EventKind =
  | "CampaignCreated"
  | "Contributed"
  | "Withdrawn"
  | "Refunded"
  | "CampaignUpdated"
  | "CampaignCancelled"
  | "CampaignHiddenSet"
  | "CampaignImageLocked"
  | "CampaignImageUpdated";

export type ActivityItem = {
  kind: EventKind;
  campaignId: bigint;
  actor: Address;
  amount?: bigint;
  /** CampaignCancelled: cancelled by the platform admin rather than the owner. CampaignHiddenSet: new flag. */
  flag?: boolean;
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: bigint;
};

/**
 * Every OpenRaise event since deployment, newest first, with block timestamps.
 * One query feeds the timelines, backer counts, homepage totals and the Dashboard.
 * Rebuilt from chain logs on each load, so it survives refreshes; contract state stays authoritative.
 */
export function useEvents() {
  const { chainId, deployment } = useAppChain();
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["events", chainId, deployment?.openRaise],
    enabled: Boolean(client && deployment),
    refetchInterval: 5_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!client || !deployment) return [];
      // A restarted Anvil starts again at block 0 while the synced config may still point at a later block;
      // asking for logs from a future block is an RPC error, so treat that as "not deployed here".
      const head = await client.getBlockNumber();
      if (deployment.startBlock > head) return [];
      const base = { address: deployment.openRaise, abi: openRaiseAbi, fromBlock: deployment.startBlock } as const;
      const [created, contributed, withdrawn, refunded, updated, cancelled, hidden, imageLocks, imageUpdates] = await Promise.all([
        client.getContractEvents({ ...base, eventName: "CampaignCreated" }),
        client.getContractEvents({ ...base, eventName: "Contributed" }),
        client.getContractEvents({ ...base, eventName: "Withdrawn" }),
        client.getContractEvents({ ...base, eventName: "Refunded" }),
        client.getContractEvents({ ...base, eventName: "CampaignUpdated" }),
        client.getContractEvents({ ...base, eventName: "CampaignCancelled" }),
        client.getContractEvents({ ...base, eventName: "CampaignHiddenSet" }),
        client.getContractEvents({ ...base, eventName: "CampaignImageLocked" }),
        client.getContractEvents({ ...base, eventName: "CampaignImageUpdated" }),
      ]);
      // Edits and moderation events don't carry the caller; the tx sender is the owner/admin.
      const sender = async (hash: `0x${string}`) => (await client.getTransaction({ hash })).from;

      const items: ActivityItem[] = [
        ...created.map((l) => ({ kind: "CampaignCreated" as const, campaignId: l.args.id!, actor: l.args.owner!, log: l })),
        ...contributed.map((l) => ({ kind: "Contributed" as const, campaignId: l.args.id!, actor: l.args.contributor!, amount: l.args.amount, log: l })),
        ...withdrawn.map((l) => ({ kind: "Withdrawn" as const, campaignId: l.args.id!, actor: l.args.owner!, amount: l.args.amount, log: l })),
        ...refunded.map((l) => ({ kind: "Refunded" as const, campaignId: l.args.id!, actor: l.args.contributor!, amount: l.args.amount, log: l })),
        ...cancelled.map((l) => ({ kind: "CampaignCancelled" as const, campaignId: l.args.id!, actor: l.args.by!, flag: l.args.byAdmin, log: l })),
        ...(await Promise.all(
          updated.map(async (l) => ({ kind: "CampaignUpdated" as const, campaignId: l.args.id!, actor: await sender(l.transactionHash), log: l })),
        )),
        ...(await Promise.all(
          hidden.map(async (l) => ({ kind: "CampaignHiddenSet" as const, campaignId: l.args.id!, actor: await sender(l.transactionHash), flag: l.args.hidden, log: l })),
        )),
        ...(await Promise.all(
          imageLocks.map(async (l) => ({ kind: "CampaignImageLocked" as const, campaignId: l.args.id!, actor: await sender(l.transactionHash), flag: l.args.locked, log: l })),
        )),
        ...(await Promise.all(
          imageUpdates.map(async (l) => ({ kind: "CampaignImageUpdated" as const, campaignId: l.args.id!, actor: await sender(l.transactionHash), flag: Boolean(l.args.imageURI), log: l })),
        )),
      ].map(({ log, ...rest }) => ({
        ...rest,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      }));

      const blocks = [...new Set(items.map((i) => i.blockNumber))];
      const stamps = new Map(
        await Promise.all(
          blocks.map(async (n) => [n, (await client.getBlock({ blockNumber: n })).timestamp] as const),
        ),
      );
      return items
        .map((i) => ({ ...i, timestamp: stamps.get(i.blockNumber) }))
        .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber)));
    },
  });
}

export type BackerRow = { address: Address; total: bigint; txs: number; last?: bigint; refunded: boolean };

export type CampaignStats = { backers: number; contributions: number; createdBlock?: bigint; backerRows: BackerRow[] };

/** Per-campaign aggregates derived from events (no onchain loops). */
export function campaignStats(events: readonly ActivityItem[], id: bigint): CampaignStats {
  const rows = new Map<string, BackerRow>();
  let contributions = 0;
  let createdBlock: bigint | undefined;
  // events are newest first; walk oldest first so `last` ends as the latest
  for (const e of [...events].reverse()) {
    if (e.campaignId !== id) continue;
    if (e.kind === "CampaignCreated") createdBlock = e.blockNumber;
    if (e.kind === "Contributed") {
      contributions++;
      const key = e.actor.toLowerCase();
      const row = rows.get(key) ?? { address: e.actor, total: 0n, txs: 0, refunded: false };
      row.total += e.amount ?? 0n;
      row.txs++;
      row.last = e.timestamp;
      rows.set(key, row);
    }
    if (e.kind === "Refunded") {
      const row = rows.get(e.actor.toLowerCase());
      if (row) row.refunded = true;
    }
  }
  const backerRows = [...rows.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
  return { backers: rows.size, contributions, createdBlock, backerRows };
}

export function useCampaignStats(id: bigint): CampaignStats & { isPending: boolean } {
  const { data, isPending } = useEvents();
  const stats = useMemo(() => campaignStats(data ?? [], id), [data, id]);
  return { ...stats, isPending };
}

/** Platform-wide counts for the homepage and Explore header. Raised totals come from `raisedByAsset`. */
export function usePlatformStats() {
  const { data, isPending } = useEvents();
  return useMemo(() => {
    const backers = new Set<string>();
    let contributions = 0;
    for (const e of data ?? []) {
      if (e.kind !== "Contributed") continue;
      contributions++;
      backers.add(e.actor.toLowerCase());
    }
    return { isPending, contributions, backers: backers.size };
  }, [data, isPending]);
}

/** Total currently-recorded raised amount per asset, from the contract's campaign views. */
export function raisedByAsset(campaigns: readonly CampaignView[]): { eth: bigint; token: bigint } {
  let eth = 0n;
  let token = 0n;
  for (const c of campaigns) {
    if (c.asset === zeroAddress) eth += c.raised;
    else token += c.raised;
  }
  return { eth, token };
}

/**
 * True/false once known: whether the configured OpenRaise address has contract code on the current chain.
 * False on a local chain usually means Anvil was restarted (it keeps state in memory) and needs a redeploy.
 */
export function useIsDeployed(): boolean | undefined {
  const { chainId, deployment } = useAppChain();
  const client = usePublicClient({ chainId });
  const { data } = useQuery({
    queryKey: ["deployed", chainId, deployment?.openRaise],
    enabled: Boolean(client && deployment),
    refetchInterval: 10_000,
    retry: false,
    queryFn: async () => {
      const code = await client!.getCode({ address: deployment!.openRaise });
      return Boolean(code && code !== "0x");
    },
  });
  return data;
}

/** The registry admin (Ownable owner). Only this address can hide campaigns or cancel others' campaigns. */
export function useIsAdmin(): { isAdmin: boolean; admin: Address | undefined } {
  const { chainId, deployment } = useAppChain();
  const { address } = useConnection();
  const { data: admin } = useReadContract({
    chainId,
    address: deployment?.openRaise,
    abi: openRaiseAbi,
    functionName: "owner",
    query: { enabled: Boolean(deployment), staleTime: 60_000 },
  });
  return { admin, isAdmin: Boolean(admin && address && admin.toLowerCase() === address.toLowerCase()) };
}
