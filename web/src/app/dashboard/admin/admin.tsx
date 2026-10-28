"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { Gate } from "@/app/dashboard/shell";
import { Tile } from "@/app/dashboard/my-dashboard";
import { useAssetResolver } from "@/components/EventFeed";
import { CancelCampaign } from "@/components/CancelCampaign";
import { TxNotice } from "@/components/TxNotice";
import { Button, Card, StatusBadge } from "@/components/ui";
import { openRaiseAbi } from "@/lib/contracts";
import { formatAmount, shortAddress, Status } from "@/lib/format";
import { campaignStats, useAppChain, useAssetMeta, useCampaigns, useEvents, useIsAdmin, type CampaignView } from "@/lib/hooks";
import { useSendTx } from "@/lib/tx";
import { useMounted } from "@/lib/useMounted";

/** Platform admin: moderation (hide/unhide), cancel-to-refund, and the token allowlist. Never custody. */
/** Renders children only for the registry admin; waits for wallet + admin address so admins never see a flash. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const { isAdmin, admin } = useIsAdmin();
  if (!mounted || admin === undefined) return <p className="text-muted">Loading…</p>;
  if (!isAdmin) return <Gate title="Admins only">This page is only available to the OpenRaise registry admin.</Gate>;
  return <>{children}</>;
}

export function AdminPanel() {
  return (
    <AdminOnly>
      <Moderation />
    </AdminOnly>
  );
}

function Moderation() {
  const { data: campaigns, isPending } = useCampaigns(200);
  const { data: events } = useEvents();
  const resolve = useAssetResolver(campaigns);
  const [filter, setFilter] = useState<"all" | "active" | "hidden" | "cancelled">("all");

  if (isPending) return <p className="text-muted">Loading…</p>;

  const all = campaigns ?? [];
  const shown = all.filter((c) =>
    filter === "all"
      ? true
      : filter === "active"
        ? c.status === Status.Active
        : filter === "hidden"
          ? c.hidden
          : c.status === Status.Cancelled,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[30px] font-black tracking-[-0.01em] sm:text-[36px]">Moderation</h1>
        <p className="mt-1 max-w-[680px] text-muted">
          Moderate campaigns. The admin can hide a campaign from listings, remove its image, or cancel it so backers are
          refunded — the admin can never withdraw or redirect funds.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <Tile label="Campaigns" value={String(all.length)} />
        <Tile label="Active" value={String(all.filter((c) => c.status === Status.Active).length)} />
        <Tile label="Hidden" value={String(all.filter((c) => c.hidden).length)} />
        <Tile label="Cancelled" value={String(all.filter((c) => c.status === Status.Cancelled).length)} />
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Campaigns</h2>
          <div role="tablist" aria-label="Filter campaigns" className="flex flex-wrap gap-1.5">
            {(["all", "active", "hidden", "cancelled"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`h-9 rounded-full px-3.5 text-[13px] font-semibold capitalize ${filter === f ? "bg-forest text-white" : "bg-wash text-ink hover:bg-mint-3"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {shown.length ? (
          <ul className="divide-y divide-line" data-testid="admin-campaigns">
            {shown.map((c) => {
              const meta = resolve(c.id);
              return (
                <li key={c.id.toString()} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={c.status} />
                      {c.hidden && <span className="rounded-full bg-rust-bg px-2.5 py-1 text-xs font-bold text-ember">Hidden</span>}
                      {c.imageLocked && <span className="rounded-full bg-rust-bg px-2.5 py-1 text-xs font-bold text-ember">Image locked</span>}
                      <span className="font-mono text-xs text-muted">#{c.id.toString()}</span>
                    </div>
                    <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate font-semibold text-ink no-underline hover:text-forest">
                      {c.title}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {c.creatorName} · <span className="font-mono">{shortAddress(c.owner)}</span> ·{" "}
                      {meta ? `${formatAmount(c.raised, meta.decimals)} / ${formatAmount(c.goal, meta.decimals)} ${meta.symbol}` : "…"} ·{" "}
                      {(() => {
                        const n = campaignStats(events ?? [], c.id).backers;
                        return `${n} ${n === 1 ? "backer" : "backers"}`;
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <HideToggle c={c} />
                    {(c.imageURI || c.imageLocked) && <ImageLockToggle c={c} />}
                    {c.status === Status.Active && (
                      <CancelCampaign id={c.id} backers={campaignStats(events ?? [], c.id).backers} asAdmin compact />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No campaigns match.</p>
        )}
      </Card>


      <Card className="p-6 text-sm text-ink-2">
        <h2 className="font-display text-lg font-bold text-ink">What the admin can and can&apos;t do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Remove image</strong> — clears an inappropriate cover and locks it so the owner can&apos;t re-add one (unlock to allow again).</li>
          <li><strong>Hide / unhide</strong> — removes a campaign from listings. Its page still works and refunds stay available.</li>
          <li><strong>Cancel</strong> an Active campaign — stops contributions and lets every backer reclaim their full contribution.</li>
          <li><strong>Allow / disallow tokens</strong> for new campaigns. Existing campaigns are unaffected.</li>
          <li><strong>Cannot</strong> withdraw, refund to itself, edit campaigns, or change any goal, deadline or asset.</li>
        </ul>
      </Card>
    </div>
  );
}

function HideToggle({ c }: { c: CampaignView }) {
  const { deployment } = useAppChain();
  const tx = useSendTx();
  const run = () =>
    deployment &&
    tx.send(`${c.hidden ? "Unhide" : "Hide"} #${c.id}`, {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "setHidden",
      args: [c.id, !c.hidden],
    });
  return (
    <div>
      <Button variant={c.hidden ? "soft" : "outline"} className="h-9 px-3.5 text-[13px]" onClick={run} disabled={tx.busy}>
        {tx.busy ? "…" : c.hidden ? "Unhide" : "Hide"}
      </Button>
      <TxNotice tx={tx.current?.phase === "success" ? null : tx.current} onRetry={run} />
    </div>
  );
}

function ImageLockToggle({ c }: { c: CampaignView }) {
  const { deployment } = useAppChain();
  const tx = useSendTx();
  const run = () =>
    deployment &&
    tx.send(`${c.imageLocked ? "Unlock image" : "Remove image"} #${c.id}`, {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "setImageLocked",
      args: [c.id, !c.imageLocked],
    });
  return (
    <div>
      <Button variant="outline" className={`h-9 px-3.5 text-[13px] ${c.imageLocked ? "" : "text-rust"}`} onClick={run} disabled={tx.busy}>
        {tx.busy ? "…" : c.imageLocked ? "Unlock image" : "Remove image"}
      </Button>
      <TxNotice tx={tx.current?.phase === "success" ? null : tx.current} onRetry={run} />
    </div>
  );
}

export function TokenAllowlist() {
  // Unique per instance: Next keeps visited pages mounted (hidden), so fixed ids would collide across pages.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const { deployment, chainId } = useAppChain();
  const mock = useAssetMeta(deployment?.mockToken);
  const [input, setInput] = useState("");
  const target = (isAddress(input) ? input : deployment?.mockToken) as Address | undefined;
  const { data: allowed, refetch } = useReadContract({
    chainId,
    address: deployment?.openRaise,
    abi: openRaiseAbi,
    functionName: "isAssetAllowed",
    args: [target ?? "0x0000000000000000000000000000000000000001"],
    query: { enabled: Boolean(deployment && target) },
  });
  const tx = useSendTx();
  const toggle = async () => {
    if (!deployment || !target) return;
    await tx.send(`${allowed ? "Disallow" : "Allow"} token`, {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "setAssetAllowed",
      args: [target, !allowed],
    });
    refetch();
  };

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-bold">Accepted tokens</h2>
        <p className="mt-1 text-sm text-muted">
          ETH is always accepted. Only allow plain ERC-20s — fee-on-transfer or rebasing tokens break refund accounting.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={fid("token-addr")}>Token address</label>
        <input
          id={fid("token-addr")}
          value={input}
          onChange={(e) => setInput(e.target.value.trim())}
          placeholder={`Token address (default: ${mock?.symbol ?? "mock token"})`}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 font-mono text-sm outline-none focus:border-forest"
        />
        <Button onClick={toggle} disabled={!target || tx.busy || allowed === undefined} variant={allowed ? "outline" : "primary"}>
          {allowed ? "Disallow" : "Allow"}
        </Button>
      </div>
      {input && !isAddress(input) && <p className="text-[13px] text-rust">Not a valid address.</p>}
      <p className="text-sm">
        <span className="font-mono">{target ? shortAddress(target) : "—"}</span>
        {!input && mock ? ` (${mock.symbol})` : ""} is{" "}
        <strong className={allowed ? "text-forest" : "text-rust"}>{allowed === undefined ? "…" : allowed ? "allowed" : "not allowed"}</strong> for new
        campaigns.
      </p>
      <TxNotice tx={tx.current} onRetry={toggle} />
    </Card>
  );
}
