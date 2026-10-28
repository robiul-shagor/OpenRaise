"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { timeLabel } from "@/components/CampaignCards";
import { Cover } from "@/components/Cover";
import { EventFeed, useAssetResolver } from "@/components/EventFeed";
import { Card, LinkButton, ProgressBar, StatusBadge } from "@/components/ui";
import { formatAmount, progressBps, Status, type AssetMeta } from "@/lib/format";
import {
  campaignStats,
  raisedByAsset,
  useCampaigns,
  useChainNow,
  useEvents,
  type BackerRow,
  type CampaignView,
} from "@/lib/hooks";

const fmt = (v: bigint, meta: AssetMeta | undefined) => (meta ? `${formatAmount(v, meta.decimals)} ${meta.symbol}` : "…");

/** Everything the dashboard needs about the connected wallet, derived from campaign views + events. */
function useMine() {
  const { address } = useConnection();
  const { data: campaigns, isPending } = useCampaigns(200);
  const { data: events } = useEvents();
  const resolve = useAssetResolver(campaigns);
  const now = useChainNow();

  return useMemo(() => {
    const me = address?.toLowerCase();
    const all = campaigns ?? [];
    const evs = events ?? [];
    const owned = all.filter((c) => c.owner.toLowerCase() === me);
    const backed = all
      .map((c) => ({ c, row: campaignStats(evs, c.id).backerRows.find((r) => r.address.toLowerCase() === me) }))
      .filter((x): x is { c: CampaignView; row: BackerRow } => x.row !== undefined);
    const ownedIds = new Set(owned.map((c) => c.id));
    return {
      isPending,
      now,
      resolve,
      owned,
      backed,
      backersOf: (id: bigint) => campaignStats(evs, id).backers,
      toWithdraw: owned.filter((c) => c.status === Status.Successful),
      toRefund: backed.filter(
        ({ c, row }) => (c.status === Status.Failed || c.status === Status.Cancelled) && !row.refunded,
      ),
      ownedEvents: evs.filter((e) => ownedIds.has(e.campaignId)),
    };
  }, [address, campaigns, events, isPending, now, resolve]);
}

export function Overview() {
  const m = useMine();
  if (m.isPending) return <p className="text-muted">Loading…</p>;
  const raised = raisedByAsset(m.owned);
  const live = m.owned.filter((c) => c.status === Status.Active).length;
  const backers = m.owned.reduce((n, c) => n + m.backersOf(c.id), 0);
  const actions = m.toWithdraw.length + m.toRefund.length;

  return (
    <div className="space-y-8">
      <Header title="Overview" sub="What needs your attention across campaigns you own and back." />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <Tile label="Campaigns you own" value={String(m.owned.length)} sub={`${live} live`} />
        <Tile
          label="Raised by your campaigns"
          value={`${formatAmount(raised.eth, 18, 2)} ETH`}
          sub={raised.token > 0n ? `+ ${formatAmount(raised.token, 6, 0)} mUSD` : `${backers} backers`}
        />
        <Tile label="Ready to withdraw" value={String(m.toWithdraw.length)} highlight={m.toWithdraw.length > 0} />
        <Tile label="Refunds you can claim" value={String(m.toRefund.length)} highlight={m.toRefund.length > 0} />
      </div>

      <Card className="p-6">
        <h2 className="font-display text-xl font-bold">Needs your action</h2>
        {actions === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing right now. Successful campaigns and claimable refunds will appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line" data-testid="needs-action">
            {m.toWithdraw.map((c) => (
              <li key={`w${c.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <strong className="text-forest">Withdraw</strong> · <span className="break-words">{c.title}</span>
                </span>
                <LinkButton href={`/dashboard/campaigns/${c.id}`}>Withdraw {fmt(c.raised, m.resolve(c.id))}</LinkButton>
              </li>
            ))}
            {m.toRefund.map(({ c, row }) => (
              <li key={`r${c.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <strong className="text-rust">Refund</strong> · <span className="break-words">{c.title}</span>
                </span>
                <LinkButton href={`/campaigns/${c.id}#back-${c.id}`} variant="danger">Claim {fmt(row.total, m.resolve(c.id))}</LinkButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Recent activity on your campaigns</h2>
          <Link href="/dashboard/campaigns" className="text-sm font-semibold">All campaigns →</Link>
        </div>
        {m.ownedEvents.length ? (
          <EventFeed events={m.ownedEvents.slice(0, 8)} resolve={m.resolve} now={m.now} withCampaign />
        ) : (
          <p className="text-sm text-muted">No activity yet. <Link href="/create">Start a campaign</Link>.</p>
        )}
      </Card>
    </div>
  );
}

export function OwnedList() {
  const m = useMine();
  if (m.isPending) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-6">
      <Header title="My campaigns" sub="Manage, edit or cancel campaigns created with this wallet.">
        <LinkButton href="/create">Start a campaign</LinkButton>
      </Header>
      {m.owned.length ? (
        <ul className="space-y-3" data-testid="owned-campaigns">
          {m.owned.map((c) => (
            <OwnedRow key={c.id.toString()} c={c} meta={m.resolve(c.id)} now={m.now} backers={m.backersOf(c.id)} />
          ))}
        </ul>
      ) : (
        <Empty title="No campaigns yet">
          Campaigns you create with this wallet show up here. <Link href="/create">Start one</Link>.
        </Empty>
      )}
    </div>
  );
}

export function BackedList() {
  const m = useMine();
  if (m.isPending) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-6">
      <Header title="Backed" sub="Campaigns you contributed to, and whether you can reclaim anything." />
      {m.backed.length ? (
        <ul className="space-y-3" data-testid="backed-campaigns">
          {m.backed.map(({ c, row }) => (
            <BackedRow key={c.id.toString()} c={c} row={row} meta={m.resolve(c.id)} now={m.now} />
          ))}
        </ul>
      ) : (
        <Empty title="Nothing backed yet">
          <Link href="/campaigns">Explore campaigns</Link> to back one. If it fails or is cancelled, you can claim your refund here.
        </Empty>
      )}
    </div>
  );
}

function Header({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[30px] font-black tracking-[-0.01em] sm:text-[36px]">{title}</h1>
        <p className="mt-1 text-muted">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Row({ c, children, action }: { c: CampaignView; children: ReactNode; action: ReactNode }) {
  return (
    <li className="flex flex-col gap-4 rounded-[20px] border border-line bg-paper p-4 sm:flex-row sm:items-center">
      <Cover seed={`${c.id}-${c.category}`} image={c.imageURI} className="hidden h-16 w-16 shrink-0 rounded-xl sm:block" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={c.status} />
          {c.hidden && <span className="rounded-full bg-rust-bg px-2.5 py-1 text-xs font-bold text-ember">Hidden</span>}
          <span className="font-mono text-xs text-muted">#{c.id.toString()} · {c.category}</span>
        </div>
        <div className="truncate font-display text-lg font-bold">{c.title}</div>
        {children}
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:w-56 sm:items-end">{action}</div>
    </li>
  );
}

function OwnedRow({ c, meta, now, backers }: { c: CampaignView; meta: AssetMeta | undefined; now: bigint | undefined; backers: number }) {
  const bps = progressBps(c.raised, c.goal);
  const hint =
    c.status === Status.Successful
      ? { text: "Goal reached — ready to withdraw", tone: "text-forest" }
      : c.status === Status.Active
        ? { text: `Live · ${timeLabel(c, now)}`, tone: "text-ink-2" }
        : c.status === Status.Failed
          ? { text: "Goal missed — backers refunding", tone: "text-rust" }
          : c.status === Status.Cancelled
            ? { text: "Cancelled — backers refunding", tone: "text-ink-2" }
            : { text: "Withdrawn to your wallet", tone: "text-ink-2" };
  return (
    <Row
      c={c}
      action={
        <>
          <span className={`text-xs font-semibold sm:text-right ${hint.tone}`}>{hint.text}</span>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {c.status === Status.Active ? (
              <LinkButton href={`/dashboard/campaigns/${c.id}/edit`} variant="outline">
                Edit
              </LinkButton>
            ) : (
              !c.imageLocked && (
                <LinkButton href={`/dashboard/campaigns/${c.id}#image-${c.id}`} variant="outline">
                  Image
                </LinkButton>
              )
            )}
            <LinkButton href={`/dashboard/campaigns/${c.id}`} variant={c.status === Status.Successful ? "primary" : "soft"}>
              {c.status === Status.Successful ? `Withdraw ${fmt(c.raised, meta)}` : "Manage"}
            </LinkButton>
          </div>
        </>
      }
    >
      <ProgressBar bps={bps} status={c.status} />
      <div className="flex flex-wrap justify-between gap-x-4 font-mono text-sm">
        <span>
          <strong>{fmt(c.raised, meta)}</strong> <span className="text-muted">/ {meta ? formatAmount(c.goal, meta.decimals) : "…"}</span>
        </span>
        <span className="text-muted">
          {backers} {backers === 1 ? "backer" : "backers"} · {Math.floor(bps / 100)}%
        </span>
      </div>
    </Row>
  );
}

function BackedRow({ c, row, meta, now }: { c: CampaignView; row: BackerRow; meta: AssetMeta | undefined; now: bigint | undefined }) {
  let action: ReactNode;
  if (row.refunded) action = <Note>Refunded {fmt(row.total, meta)} to you.</Note>;
  else if (c.status === Status.Failed || c.status === Status.Cancelled)
    action = (
      <>
        <span className="text-xs font-semibold text-rust sm:text-right">
          {c.status === Status.Cancelled ? "Cancelled" : "Goal missed"} — refund available
        </span>
        <LinkButton href={`/campaigns/${c.id}#back-${c.id}`} variant="danger">Claim refund</LinkButton>
      </>
    );
  else if (c.status === Status.Active) action = <Note>Live · {timeLabel(c, now)}. Refundable if it fails or is cancelled.</Note>;
  else action = <Note>Goal reached — your contribution went to the project.</Note>;
  return (
    <Row c={c} action={action}>
      <div className="flex flex-wrap justify-between gap-x-4 text-sm">
        <span>
          You put in <strong className="font-mono">{fmt(row.total, meta)}</strong>
          <span className="text-muted"> · {row.txs} {row.txs === 1 ? "contribution" : "contributions"}</span>
        </span>
        <Link href={`/campaigns/${c.id}`} className="text-sm font-semibold">View campaign →</Link>
      </div>
    </Row>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-wash px-3 py-2 text-[13px] text-ink-2 sm:text-right">{children}</p>;
}

export function Tile({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`p-5 ${highlight ? "bg-mint-2" : "bg-paper"}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-2xl font-bold tracking-tight ${highlight ? "text-forest" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-line p-8 text-center">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</p>
    </div>
  );
}
