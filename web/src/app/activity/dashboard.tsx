"use client";

import Link from "next/link";
import { useState } from "react";
import { useBlockNumber } from "wagmi";
import { EVENT_CHIP, useAssetResolver } from "@/components/EventFeed";
import { Button } from "@/components/ui";
import { explorerTxUrl, formatAmount, shortAddress, Status, type AssetMeta } from "@/lib/format";
import { campaignStats, useAppChain, useCampaigns, useEvents, type ActivityItem, type CampaignView, type EventKind } from "@/lib/hooks";

export type TypeFilter = "all" | "payouts" | EventKind;

const TYPES: TypeFilter[] = [
  "all",
  "payouts",
  "Contributed",
  "Refunded",
  "Withdrawn",
  "CampaignCreated",
  "CampaignUpdated",
  "CampaignCancelled",
  "CampaignHiddenSet",
  "CampaignImageLocked",
  "CampaignImageUpdated",
];
const TYPE_LABEL: Record<TypeFilter, string> = {
  all: "All events",
  payouts: "Refunds & withdrawals",
  Contributed: "Contributions",
  Refunded: "Refunds",
  Withdrawn: "Withdrawals",
  CampaignCreated: "Created",
  CampaignUpdated: "Edited",
  CampaignCancelled: "Cancelled",
  CampaignHiddenSet: "Hide/unhide",
  CampaignImageLocked: "Image moderation",
  CampaignImageUpdated: "Image updates",
};

type Mismatch = { id: bigint; reason: string };

/** Recomputes each campaign's totals from events and compares them with the contract's own state. */
export function reconcile(campaigns: readonly CampaignView[], events: readonly ActivityItem[]): Mismatch[] {
  const out: Mismatch[] = [];
  for (const c of campaigns) {
    let contributed = 0n;
    let refunded = 0n;
    let withdrawn = false;
    for (const e of events) {
      if (e.campaignId !== c.id) continue;
      if (e.kind === "Contributed") contributed += e.amount ?? 0n;
      if (e.kind === "Refunded") refunded += e.amount ?? 0n;
      if (e.kind === "Withdrawn") withdrawn = true;
    }
    if (contributed !== c.raised) out.push({ id: c.id, reason: "raised ≠ Σ Contributed" });
    if (refunded !== c.refunded) out.push({ id: c.id, reason: "refunded ≠ Σ Refunded" });
    if (withdrawn !== (c.status === Status.Withdrawn)) out.push({ id: c.id, reason: "Withdrawn event ≠ status" });
    const cancelled = events.some((e) => e.campaignId === c.id && e.kind === "CampaignCancelled");
    if (cancelled !== (c.status === Status.Cancelled)) out.push({ id: c.id, reason: "CampaignCancelled event ≠ status" });
  }
  return out;
}

function toCsv(rows: ActivityItem[], resolve: (id: bigint) => AssetMeta | undefined): string {
  const header = ["timestamp_iso", "block", "event", "campaign_id", "address", "amount", "symbol", "amount_base_units", "tx_hash"];
  const lines = rows.map((e) => {
    const meta = resolve(e.campaignId);
    return [
      e.timestamp !== undefined ? new Date(Number(e.timestamp) * 1000).toISOString() : "",
      e.blockNumber.toString(),
      e.kind,
      e.campaignId.toString(),
      e.actor,
      e.amount !== undefined && meta ? formatAmount(e.amount, meta.decimals, meta.decimals).replace(/,/g, "") : "",
      e.amount !== undefined ? (meta?.symbol ?? "") : "",
      e.amount?.toString() ?? "",
      e.txHash,
    ].join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

const matchesType = (t: TypeFilter, e: ActivityItem) =>
  t === "all" || (t === "payouts" ? e.kind === "Refunded" || e.kind === "Withdrawn" : e.kind === t);

type LedgerRow = { c: CampaignView; contributed: bigint; refunded: bigint; ok: boolean };

/** Per-campaign comparison of contract state with totals rebuilt from events (the board's "Ledger reconciliation"). */
export function ledgerRows(campaigns: readonly CampaignView[], events: readonly ActivityItem[]): LedgerRow[] {
  return campaigns.map((c) => {
    let contributed = 0n;
    let refunded = 0n;
    for (const e of events) {
      if (e.campaignId !== c.id) continue;
      if (e.kind === "Contributed") contributed += e.amount ?? 0n;
      if (e.kind === "Refunded") refunded += e.amount ?? 0n;
    }
    return { c, contributed, refunded, ok: contributed === c.raised && refunded === c.refunded };
  });
}

/**
 * Event log over the whole registry. `public` is the /activity page; `admin` is the ops view from the
 * "Backend — contributions & indexer" board: same table plus refund tracking, ledger reconciliation and indexer health.
 */
export function Dashboard({ variant = "public", initialType = "all" }: { variant?: "public" | "admin"; initialType?: TypeFilter }) {
  const admin = variant === "admin";
  const { chainId, supported } = useAppChain();
  const { data: campaigns } = useCampaigns(200);
  const { data: events, isPending, refetch, isFetching, dataUpdatedAt } = useEvents();
  const { deployment } = useAppChain();
  const { data: head } = useBlockNumber({ chainId, watch: true });
  const resolve = useAssetResolver(campaigns);
  const [type, setType] = useState<TypeFilter>(initialType);
  const [campaign, setCampaign] = useState("all");
  const [check, setCheck] = useState<{ at: Date; mismatches: Mismatch[] } | null>(null);

  const all = events ?? [];
  const rows = all.filter((e) => matchesType(type, e) && (campaign === "all" || e.campaignId.toString() === campaign));
  const contributions = all.filter((e) => e.kind === "Contributed");
  const contributors = new Set(contributions.map((e) => e.actor.toLowerCase())).size;
  const refunds = all.filter((e) => e.kind === "Refunded").length;
  const lastIndexed = all[0]?.blockNumber;
  const titleOf = (id: bigint) => campaigns?.find((c) => c.id === id)?.title ?? "";
  const ledger = ledgerRows(campaigns ?? [], all);
  // Refund tracking: the failed/cancelled campaign with the most money still owed to backers.
  const refundCase = ledger
    .filter((r) => r.c.status === Status.Failed || r.c.status === Status.Cancelled)
    .sort((a, b) => (b.c.raised - b.c.refunded > a.c.raised - a.c.refunded ? 1 : -1))[0];
  const refundStats = refundCase ? campaignStats(all, refundCase.c.id) : undefined;

  async function runReconcile() {
    const fresh = await refetch();
    setCheck({ at: new Date(), mismatches: reconcile(campaigns ?? [], fresh.data ?? []) });
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows, resolve)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openraise-events-${chainId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!supported) {
    return <p className="mx-auto max-w-[1240px] px-6 py-16 text-rust">No OpenRaise deployment for chain {chainId}.</p>;
  }
  const refundMeta = refundCase ? resolve(refundCase.c.id) : undefined;

  return (
    <div className={admin ? "" : "mx-auto max-w-[1240px] px-4 pb-10 pt-9 sm:px-6"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`font-display font-black tracking-[-0.01em] ${admin ? "text-[30px] sm:text-[36px]" : "text-[34px] sm:text-[40px]"}`}>
            {admin ? "Contributions" : "Activity"}
          </h1>
          <p className="mt-1.5 max-w-[640px] text-muted">
            Every contribution, refund and withdrawal across all campaigns, decoded from contract events. Read model: chain logs
            — contract state stays authoritative.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={runReconcile} disabled={isFetching || !campaigns}>
            {isFetching ? "Reading chain…" : "Reconcile with chain"}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
        </div>
      </div>

      {check && (
        <div
          role="status"
          className={`mt-5 rounded-2xl p-4 text-sm ${check.mismatches.length ? "bg-rust-bg text-rust" : "bg-mint-2 text-forest"}`}
        >
          {check.mismatches.length ? (
            <>
              <strong>{check.mismatches.length} mismatch(es) between events and contract state:</strong>{" "}
              {check.mismatches.map((m) => `#${m.id} ${m.reason}`).join(" · ")}
            </>
          ) : (
            <>
              <strong>In sync.</strong> Event totals match contract state for all {campaigns?.length ?? 0} campaigns (raised,
              refunded, withdrawn) · checked {check.at.toLocaleTimeString()}
            </>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <Tile
          label="Latest indexed block"
          value={lastIndexed !== undefined ? `#${lastIndexed}` : "—"}
          sub={head !== undefined ? `In sync · chain at #${head}` : ""}
          tone="good"
        />
        <Tile label="Events" value={String(all.length)} sub={`${contributions.length} contributions`} />
        <Tile label="Unique contributors" value={String(contributors)} sub={`across ${campaigns?.length ?? 0} campaigns`} />
        {admin && refundCase && refundStats ? (
          <Tile
            label={`Refunds claimed · #${refundCase.c.id}`}
            value={refundMeta ? `${formatAmount(refundCase.c.refunded, refundMeta.decimals)} / ${formatAmount(refundCase.c.raised, refundMeta.decimals)} ${refundMeta.symbol}` : "…"}
            sub={`${refundStats.backerRows.filter((b) => b.refunded).length} of ${refundStats.backers} backers claimed`}
            tone="warn"
          />
        ) : (
          <Tile label="Refunds claimed" value={String(refunds)} sub={admin ? "No failed or cancelled campaigns" : "Refunded events"} />
        )}
      </div>

      <section className="mt-6 rounded-[20px] border border-line bg-paper p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Event type" className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                onClick={() => setType(t)}
                className={`h-10 rounded-full px-4 text-sm font-semibold ${type === t ? "bg-forest text-white" : "bg-wash text-ink hover:bg-mint-3"}`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <label className="flex w-full min-w-0 items-center gap-2 text-sm font-semibold sm:w-auto">
            Campaign
            <select
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="h-10 w-full min-w-0 rounded-full border border-line bg-paper px-3 text-sm font-normal sm:w-[260px]"
            >
              <option value="all">All campaigns</option>
              {campaigns?.map((c) => (
                <option key={c.id.toString()} value={c.id.toString()}>
                  #{c.id.toString()} {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Time", "Event", "Campaign", "From / to", "Amount", "Block", "Tx"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody data-testid="event-table">
              {rows.map((e) => {
                const meta = resolve(e.campaignId);
                const url = explorerTxUrl(chainId, e.txHash);
                return (
                  <tr key={`${e.txHash}-${e.logIndex}`} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                      {e.timestamp !== undefined ? new Date(Number(e.timestamp) * 1000).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${EVENT_CHIP[e.kind]}`}>{e.kind}</span>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5">
                      <Link href={`/campaigns/${e.campaignId}`} className="font-mono font-semibold">#{e.campaignId.toString()}</Link>{" "}
                      <span className="text-muted">{titleOf(e.campaignId)}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono" title={e.actor}>{shortAddress(e.actor)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono">
                      {e.amount !== undefined && meta ? `${formatAmount(e.amount, meta.decimals)} ${meta.symbol}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono">#{e.blockNumber.toString()}</td>
                    <td className="px-4 py-2.5 font-mono">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer noopener">{shortAddress(e.txHash)}</a>
                      ) : (
                        <span title={e.txHash}>{shortAddress(e.txHash)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-8 text-center text-sm text-muted">{isPending ? "Loading events…" : "No events match these filters."}</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>
            Showing {rows.length} of {all.length} events
          </span>
          <span>Amounts are stored as integer base units (wei, 6-decimal mUSD) and formatted for display only.</span>
        </div>
      </section>

      {admin && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="min-w-0 rounded-[20px] border border-line bg-paper p-5">
            <h2 className="font-display text-lg font-bold">Ledger reconciliation</h2>
            <p className="mt-1 text-sm text-muted">
              Totals rebuilt from events compared with <code className="font-mono">getCampaign(id).raised</code> /{" "}
              <code className="font-mono">.refunded</code> read from the contract{head !== undefined ? ` at block #${head}` : ""}.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-left text-sm" data-testid="ledger">
                <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Campaign</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Onchain raised</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Indexed Σ</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Refunded</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(({ c, contributed, refunded, ok }) => {
                    const m = resolve(c.id);
                    const f = (v: bigint) => (m ? `${formatAmount(v, m.decimals)} ${m.symbol}` : "…");
                    return (
                      <tr key={c.id.toString()} className="border-t border-line">
                        <td className="px-4 py-2.5">
                          <Link href={`/dashboard/campaigns/${c.id}`} className="font-mono font-semibold">#{c.id.toString()}</Link>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">{f(c.raised)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{f(contributed)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {f(c.refunded)}
                          {refunded !== c.refunded && <span className="text-rust"> (Σ {f(refunded)})</span>}
                        </td>
                        <td className={`px-4 py-2.5 font-semibold ${ok ? "text-forest" : "text-rust"}`}>{ok ? "Match" : "Mismatch"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!ledger.length && <p className="p-6 text-center text-sm text-muted">No campaigns yet.</p>}
            </div>
          </section>

          <section id="indexer" className="min-w-0 scroll-mt-6 rounded-[20px] border border-line bg-paper p-5">
            <h2 className="font-display text-lg font-bold">Indexer health</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2.5 [&_dd]:break-words [&_dd]:sm:text-right [&_dd]:pb-2 [&_dd]:sm:pb-0">
              <dt className="text-muted">Read model</dt>
              <dd>Chain logs (<code className="font-mono">eth_getLogs</code>), no database</dd>
              <dt className="text-muted">Last sync</dt>
              <dd className="font-mono">{dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"} · every 5s</dd>
              <dt className="text-muted">Chain head</dt>
              <dd className="font-mono">{head !== undefined ? `#${head}` : "—"}</dd>
              <dt className="text-muted">Confirmations before final</dt>
              <dd>0 — reads latest (local Anvil; use ≥2 on public chains)</dd>
              <dt className="text-muted">Reorgs</dt>
              <dd>Self-correcting — the log is re-read from the start block on every sync</dd>
              <dt className="text-muted">Start block</dt>
              <dd className="font-mono">#{deployment?.startBlock.toString() ?? "—"} (deploy)</dd>
            </dl>
            <p className="mt-4 rounded-xl bg-wash p-3 text-xs text-ink-2">
              If this view is wiped it rebuilds from the deploy block — nothing here is the source of truth. A production indexer
              (e.g. PostgreSQL) would page logs in batches and persist them; the contract would still be authoritative.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "warn" }) {
  return (
    <div className="bg-paper p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-2xl font-bold tracking-tight">{value}</div>
      <div className={`mt-0.5 text-xs ${tone === "good" ? "font-semibold text-forest" : tone === "warn" ? "font-semibold text-rust" : "text-muted"}`}>{sub}</div>
    </div>
  );
}
