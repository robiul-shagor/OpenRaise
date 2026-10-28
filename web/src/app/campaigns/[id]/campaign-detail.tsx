"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { zeroAddress } from "viem";
import { useConnection } from "wagmi";
import { ActionPanel } from "./action-panel";
import { BackersTable } from "@/components/BackersTable";
import { Avatar, Cover } from "@/components/Cover";
import { DevTools } from "@/components/DevTools";
import { EventFeed } from "@/components/EventFeed";
import { Card, LinkButton, ProgressBar, StatusBadge, Tag } from "@/components/ui";
import { describeError } from "@/lib/errors";
import { formatAmount, formatDuration, progressBps, shortAddress, Status, type AssetMeta } from "@/lib/format";
import {
  useAppChain,
  useAssetMeta,
  useCampaign,
  useCampaignStats,
  useChainNow,
  useContribution,
  useEvents,
  type CampaignView,
} from "@/lib/hooks";

function parseId(raw: string | string[] | undefined): bigint | null {
  return typeof raw === "string" && /^[1-9]\d{0,18}$/.test(raw) ? BigInt(raw) : null;
}

export function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const id = parseId(params.id);
  if (id === null) return <NotFound />;
  return <Detail id={id} />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[1240px] space-y-3 px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-black">Campaign not found</h1>
      <Link href="/campaigns">← All campaigns</Link>
    </div>
  );
}

const fmtDate = (ts: bigint) =>
  new Date(Number(ts) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Detail({ id }: { id: bigint }) {
  const { data: c, error, isPending } = useCampaign(id);
  const { address } = useConnection();
  const { data: contribution } = useContribution(id, address);
  const meta = useAssetMeta(c?.asset);
  const stats = useCampaignStats(id);
  const now = useChainNow();

  if (error) {
    return /CampaignNotFound/.test(String(error)) ? (
      <NotFound />
    ) : (
      <p className="mx-auto max-w-[1240px] px-6 py-16 text-rust">{describeError(error)}</p>
    );
  }
  if (isPending || !c) return <p className="mx-auto max-w-[1240px] px-6 py-16 text-muted">Loading campaign…</p>;

  const fmt = (v: bigint) => (meta ? formatAmount(v, meta.decimals) : "…");
  const bps = progressBps(c.raised, c.goal);
  const isOwner = address?.toLowerCase() === c.owner.toLowerCase();

  const progressNote =
    c.raised >= c.goal ? "goal reached" : `${fmt(c.goal - c.raised)} ${meta?.symbol ?? ""} to go`;
  const closeNote =
    c.status === Status.Active
      ? now !== undefined
        ? `Closes in ${formatDuration(c.deadline - now).replace(" left", "")}`
        : ""
      : c.status === Status.Cancelled
        ? "Cancelled before its deadline"
        : `Closed ${fmtDate(c.deadline)}`;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-8 sm:px-6">
      <Link href="/campaigns" className="text-sm font-medium text-muted no-underline hover:text-ink">
        ← All campaigns
      </Link>

      {c.hidden && (
        <p role="status" className="mt-4 rounded-2xl bg-rust-bg p-4 text-sm text-rust">
          <strong>Hidden by the platform admin.</strong> This campaign is not listed on OpenRaise. The contract still works:
          backers can always reclaim refunds if it fails or is cancelled.
        </p>
      )}
      {isOwner && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mint-3 p-4 text-sm">
          <span className="text-forest">
            <strong>You own this campaign.</strong> Edit details, see backers and analytics, or cancel it from your dashboard.
          </span>
          <LinkButton href={`/dashboard/campaigns/${c.id}`} variant="primary">Manage campaign</LinkButton>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Cover seed={`${c.id}-${c.category}`} image={c.imageURI} className="h-48 rounded-[20px] sm:h-64" />
          <Card className="space-y-5 p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={c.status} />
              <Tag>{c.category}</Tag>
              <span className="font-mono text-xs text-muted">Campaign #{c.id.toString()}</span>
            </div>
            {/* Title, creator and description are untrusted user content: rendered as escaped text only. */}
            <h1 className="break-words font-display text-[32px] font-black leading-tight tracking-[-0.01em] sm:text-[40px]">
              {c.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={c.creatorName} seed={c.owner} size={32} />
                <span className="min-w-0 truncate">
                  Owner <strong className="text-ink">{c.creatorName}</strong>{" "}
                  <span className="font-mono" title={c.owner}>{shortAddress(c.owner)}</span>
                </span>
                {isOwner && <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-semibold text-ink">you</span>}
              </span>
              {stats.createdBlock !== undefined && (
                <span>
                  Created block <span className="font-mono">#{stats.createdBlock.toString()}</span>
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
              <Stat label="Raised" value={fmt(c.raised)} unit={meta?.symbol} />
              <Stat label="Goal" value={fmt(c.goal)} unit={meta?.symbol} />
              <Stat label="Backers" value={String(stats.backers)} />
              <Stat label="Deadline" value={fmtDate(c.deadline)} small />
            </dl>
            <ProgressBar bps={bps} status={c.status} thick />
            <div className="flex flex-wrap justify-between gap-2 text-sm text-muted">
              <span>
                <strong className="text-ink">{(bps / 100).toFixed(1)}%</strong> funded · {progressNote}
              </span>
              <span>{closeNote}</span>
            </div>
            {c.refunded > 0n && (
              <p className="text-sm text-muted">
                {fmt(c.refunded)} {meta?.symbol} refunded so far · {fmt(c.raised - c.refunded)} {meta?.symbol} still held
              </p>
            )}
          </Card>

          <Card className="p-6 sm:p-7">
            <h2 className="font-display text-xl font-bold">About this campaign</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-ink-2">{c.description || "No description."}</p>
            <p className="mt-4 text-xs text-muted">Stored onchain · rendered as plain text — no HTML from campaign owners.</p>
          </Card>

          <RecordsTabs c={c} meta={meta} />
        </div>

        <aside id={`back-${c.id}`} className="min-w-0 scroll-mt-6 space-y-4">
          <ActionPanel campaign={c} meta={meta} contribution={contribution ?? 0n} />
          <Position c={c} meta={meta} contribution={contribution ?? 0n} isOwner={isOwner} connected={Boolean(address)} />
          <DevTools />
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <div className="bg-paper p-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`mt-0.5 font-mono font-bold tracking-tight ${small ? "text-[15px]" : "text-xl"}`}>
        {value} {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
      </dd>
    </div>
  );
}

type Tab = "Activity" | "Backers" | "Contract";

function RecordsTabs({ c, meta }: { c: CampaignView; meta: AssetMeta | undefined }) {
  const [tab, setTab] = useState<Tab>("Activity");
  const { data: events, isPending, error } = useEvents();
  const { deployment } = useAppChain();
  const stats = useCampaignStats(c.id);
  const now = useChainNow();
  const mine = (events ?? []).filter((e) => e.campaignId === c.id);

  return (
    <Card className="p-6 sm:p-7">
      <div role="tablist" aria-label="Campaign records" className="mb-4 flex flex-wrap gap-1.5">
        {(["Activity", "Backers", "Contract"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-10 rounded-full px-4 text-sm font-semibold ${tab === t ? "bg-forest text-white" : "bg-wash text-ink hover:bg-mint-3"}`}
          >
            {t}
            {t === "Backers" && ` · ${stats.backers}`}
          </button>
        ))}
      </div>

      {tab === "Activity" &&
        (error ? (
          <p className="text-sm text-rust">Could not load events.</p>
        ) : isPending ? (
          <p className="text-sm text-muted">Loading events…</p>
        ) : mine.length ? (
          <>
            <p className="mb-2 text-xs text-muted">Rebuilt from onchain events on every load.</p>
            <EventFeed events={mine} resolve={() => meta} now={now} withCampaign={false} testId="activity" />
          </>
        ) : (
          <p className="text-sm text-muted">No events yet.</p>
        ))}

      {tab === "Backers" && (
        <div>
          <BackersTable rows={stats.backerRows} meta={meta} status={c.status} />
          <p className="mt-3 text-xs text-muted">
            Totals are built from <span className="font-mono">Contributed</span> events; refundable amounts are read from the
            contract&apos;s <span className="font-mono">contributionOf(id, address)</span>. No onchain loops.
          </p>
        </div>
      )}

      {tab === "Contract" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-wash p-3.5">
              <div className="text-xs text-muted">Contract</div>
              <div className="break-all font-mono text-[13px]">{deployment?.openRaise ?? "—"}</div>
            </div>
            <div className="rounded-xl bg-wash p-3.5">
              <div className="text-xs text-muted">Accepted asset</div>
              <div className="break-all font-mono text-[13px]">
                {c.asset === zeroAddress ? "Native ETH (18 decimals)" : `${meta?.symbol ?? "Token"} (${meta?.decimals ?? "?"} decimals) · ${c.asset}`}
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Rules enforced by the contract</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Contributions accepted only while <code className="font-mono">block.timestamp &lt; deadline</code>.</li>
              <li>Succeeds when <code className="font-mono">raised &gt;= goal</code> at the deadline — hitting the goal exactly counts.</li>
              <li>The owner may call <code className="font-mono">withdraw()</code> once, only after a successful close.</li>
              <li>After a failed close, each backer calls <code className="font-mono">refund()</code> once for exactly what they put in.</li>
              <li>State is updated before any transfer, and transfers are guarded against reentrancy.</li>
            </ul>
            <Link href="/rules" className="mt-3 inline-block text-sm font-semibold">See the full lifecycle →</Link>
          </div>
        </div>
      )}
    </Card>
  );
}

function Position({
  c,
  meta,
  contribution,
  isOwner,
  connected,
}: {
  c: CampaignView;
  meta: AssetMeta | undefined;
  contribution: bigint;
  isOwner: boolean;
  connected: boolean;
}) {
  const stats = useCampaignStats(c.id);
  const { address } = useConnection();
  if (!connected) return null;
  const row = stats.backerRows.find((r) => r.address.toLowerCase() === address?.toLowerCase());
  const fmt = (v: bigint) => (meta ? `${formatAmount(v, meta.decimals)} ${meta.symbol}` : "…");

  let label = "Your contribution";
  let value = fmt(contribution);
  let note = "";
  if (isOwner) {
    label = "You own this campaign";
    value = fmt(c.raised);
    note =
      c.status === Status.Withdrawn
        ? "Funds have been withdrawn to your address."
        : c.status === Status.Successful
          ? "Goal reached — you can withdraw once."
          : c.status === Status.Failed
            ? "Goal missed — backers can reclaim their funds; you cannot withdraw."
            : c.status === Status.Cancelled
              ? "Cancelled — backers can reclaim their funds; nothing can be withdrawn."
              : "You can withdraw only if the goal is met by the deadline.";
  } else if (row?.refunded) {
    label = "Refunded to you";
    value = fmt(row.total);
    note = "Your recorded contribution is now 0 — nothing more to claim.";
  } else if (contribution > 0n) {
    note =
      c.status === Status.Active
        ? "Refundable if the goal isn't met by the deadline."
        : c.status === Status.Failed || c.status === Status.Cancelled
          ? `${c.status === Status.Cancelled ? "Campaign cancelled" : "Goal missed"} — claim your refund above.`
          : "Goal reached — your contribution went to the project.";
  } else {
    note = c.status === Status.Active ? "You haven't backed this campaign yet." : "You didn't back this campaign.";
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold">Your position</h2>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        <span className="font-mono text-lg font-bold" data-testid="position-value">{value}</span>
      </div>
      {row && !isOwner && (
        <div className="mt-1 text-xs text-muted">
          {row.txs} {row.txs === 1 ? "contribution" : "contributions"}
        </div>
      )}
      <p className="mt-3 rounded-xl bg-wash p-3 text-[13px] text-ink-2">{note}</p>
    </Card>
  );
}
