"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { WithdrawAction } from "@/app/campaigns/[id]/action-panel";
import { Gate } from "@/app/dashboard/shell";
import { Tile } from "@/app/dashboard/my-dashboard";
import { BackersTable, backersCsv, downloadText } from "@/components/BackersTable";
import { CancelCampaign } from "@/components/CancelCampaign";
import { Cover } from "@/components/Cover";
import { ImageCard } from "@/components/ImageCard";
import { EventFeed } from "@/components/EventFeed";
import { RaisedChart } from "@/components/RaisedChart";
import { Button, Card, LinkButton, ProgressBar, StatusBadge, Tag } from "@/components/ui";
import { describeError } from "@/lib/errors";
import { formatAmount, formatDuration, progressBps, Status } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { useAssetMeta, useCampaign, useCampaignStats, useChainNow, useEvents, useIsAdmin } from "@/lib/hooks";

export function parseCampaignId(raw: string | string[] | undefined): bigint | null {
  return typeof raw === "string" && /^[1-9]\d{0,18}$/.test(raw) ? BigInt(raw) : null;
}

export function ManageCampaign() {
  const id = parseCampaignId(useParams<{ id: string }>().id);
  if (id === null) return <Gate title="Campaign not found">Check the link and try again.</Gate>;
  return <Manage id={id} />;
}

/** Owner's private view of one campaign: analytics, backers, activity and the owner-only actions. */
function Manage({ id }: { id: bigint }) {
  const mounted = useMounted();
  const { address } = useConnection();
  const { isAdmin } = useIsAdmin();
  const { data: c, error, isPending } = useCampaign(id);
  const meta = useAssetMeta(c?.asset);
  const stats = useCampaignStats(id);
  const { data: events } = useEvents();
  const now = useChainNow();

  if (error) return <Gate title="Campaign not found">{describeError(error)}</Gate>;
  if (isPending || !c || !mounted) return <p className="text-muted">Loading campaign…</p>;

  const isOwner = address?.toLowerCase() === c.owner.toLowerCase();
  if (!isOwner && !isAdmin) {
    return (
      <Gate title="Not your campaign">
        Only the campaign owner can manage it. <Link href={`/campaigns/${c.id}`}>View the public page</Link>.
      </Gate>
    );
  }

  const fmt = (v: bigint) => (meta ? `${formatAmount(v, meta.decimals)} ${meta.symbol}` : "…");
  const bps = progressBps(c.raised, c.goal);
  const mine = (events ?? []).filter((e) => e.campaignId === id);
  const created = mine.find((e) => e.kind === "CampaignCreated");
  const cancelledAt = mine.find((e) => e.kind === "CampaignCancelled")?.timestamp;
  const avg = stats.contributions ? c.raised / BigInt(stats.contributions) : 0n;
  const refundedBackers = stats.backerRows.filter((r) => r.refunded).length;
  const active = c.status === Status.Active;
  const closingNote = active
    ? now !== undefined
      ? formatDuration(c.deadline - now)
      : "…"
    : c.status === Status.Cancelled
      ? "Cancelled"
      : `Ended ${new Date(Number(c.deadline) * 1000).toLocaleDateString()}`;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/campaigns" className="text-sm font-medium text-muted no-underline hover:text-ink">
        ← My campaigns
      </Link>

      <Cover seed={`${c.id}-${c.category}`} image={c.imageURI} className="h-40 rounded-[20px] sm:h-52">
        {c.imageLocked && (
          <span className="absolute bottom-3 left-3 rounded-full bg-paper/90 px-3 py-1 text-xs font-semibold text-rust">
            Image removed and locked by the platform admin
          </span>
        )}
      </Cover>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <Tag>{c.category}</Tag>
            {c.hidden && <span className="rounded-full bg-rust-bg px-2.5 py-1 text-xs font-bold text-ember">Hidden by admin</span>}
            <span className="font-mono text-xs text-muted">Campaign #{c.id.toString()}</span>
            {!isOwner && <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-semibold">Viewing as admin</span>}
          </div>
          <h1 className="break-words font-display text-[28px] font-black leading-tight sm:text-[34px]">{c.title}</h1>
          <p className="text-sm text-muted">by {c.creatorName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/campaigns/${c.id}`} variant="outline">View public page</LinkButton>
          {isOwner && active && <LinkButton href={`/dashboard/campaigns/${c.id}/edit`} variant="soft">Edit details</LinkButton>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        <Tile label="Raised" value={fmt(c.raised)} sub={`${(bps / 100).toFixed(1)}% of ${fmt(c.goal)}`} highlight={c.raised >= c.goal && c.status !== Status.Cancelled} />
        <Tile label="Backers" value={String(stats.backers)} sub={`${stats.contributions} contributions`} />
        <Tile label="Average contribution" value={stats.contributions ? fmt(avg) : "—"} />
        <Tile
          label={active ? "Time left" : c.status === Status.Failed || c.status === Status.Cancelled ? "Refunds claimed" : "Status"}
          value={c.status === Status.Failed || c.status === Status.Cancelled ? `${refundedBackers} / ${stats.backers}` : closingNote}
          sub={c.status === Status.Failed || c.status === Status.Cancelled ? `${fmt(c.refunded)} returned` : undefined}
        />
      </div>

      <OwnerActions>
        {c.status === Status.Successful && isOwner && (
          <Card className="p-6">
            <WithdrawAction c={c} meta={meta} />
          </Card>
        )}
        {c.status === Status.Withdrawn && (
          <Callout tone="ok">Funds withdrawn to {isOwner ? "your wallet" : "the owner"}. This campaign is complete.</Callout>
        )}
        {c.status === Status.Failed && (
          <Callout tone="warn">The goal wasn&apos;t met by the deadline. Backers can reclaim their contributions; nothing can be withdrawn.</Callout>
        )}
        {c.status === Status.Cancelled && (
          <Callout tone="warn">
            Cancelled{cancelledAt !== undefined ? ` on ${new Date(Number(cancelledAt) * 1000).toLocaleString()}` : ""}. Backers can reclaim
            their full contributions.
          </Callout>
        )}
        {active && (
          <Card className="space-y-3 p-6">
            <h2 className="font-display text-lg font-bold">Campaign controls</h2>
            <p className="text-sm text-muted">
              While the campaign is live you can edit its title, story, team name, category and cover image. The goal ({fmt(c.goal)}), deadline and
              asset are locked — backers contributed under those terms.
            </p>
            <div className="flex flex-wrap items-start gap-2">
              {isOwner && <LinkButton href={`/dashboard/campaigns/${c.id}/edit`}>Edit details</LinkButton>}
              <CancelCampaign id={c.id} backers={stats.backers} asAdmin={!isOwner} />
            </div>
          </Card>
        )}
      </OwnerActions>

      {/* Ended campaigns: image is the only thing the owner can still change (live ones use the Edit screen). */}
      {isOwner && !active && <ImageCard key={c.imageURI} c={c} anchorId={`image-${c.id}`} />}

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Total contributed over time</h2>
          <span className="text-xs text-muted">From Contributed events</span>
        </div>
        <ProgressBar bps={bps} status={c.status} thick />
        <div className="mt-4">
          <RaisedChart events={mine} goal={c.goal} meta={meta} start={created?.timestamp} end={active ? now : (cancelledAt ?? c.deadline)} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Backers · {stats.backers}</h2>
          <Button
            variant="outline"
            disabled={!stats.backerRows.length}
            onClick={() => downloadText(`openraise-campaign-${c.id}-backers.csv`, backersCsv(stats.backerRows, meta))}
          >
            Export CSV
          </Button>
        </div>
        <BackersTable rows={stats.backerRows} meta={meta} status={c.status} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-2 font-display text-lg font-bold">Activity</h2>
        {mine.length ? (
          <EventFeed events={mine} resolve={() => meta} now={now} withCampaign={false} />
        ) : (
          <p className="text-sm text-muted">No events yet.</p>
        )}
      </Card>
    </div>
  );
}

function OwnerActions({ children }: { children: ReactNode }) {
  return <section aria-label="Owner actions" className="space-y-4">{children}</section>;
}

function Callout({ tone, children }: { tone: "ok" | "warn"; children: ReactNode }) {
  return (
    <p role="status" className={`rounded-2xl p-4 text-sm ${tone === "ok" ? "bg-mint-2 text-forest" : "bg-rust-bg text-rust"}`}>
      {children}
    </p>
  );
}
