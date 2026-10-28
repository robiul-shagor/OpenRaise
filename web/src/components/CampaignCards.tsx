"use client";

import Link from "next/link";
import type { CampaignView } from "@/lib/hooks";
import { useAssetMeta } from "@/lib/hooks";
import { formatAmount, formatDuration, progressBps, shortAddress, Status } from "@/lib/format";
import { Avatar, Cover } from "./Cover";
import { ProgressBar, StatusBadge, Tag } from "./ui";

export function timeLabel(c: CampaignView, now: bigint | undefined): string {
  if (c.status === Status.Active) return now !== undefined ? formatDuration(c.deadline - now) : "…";
  if (c.status === Status.Failed) return "Refunds open";
  if (c.status === Status.Withdrawn) return "Withdrawn";
  if (c.status === Status.Cancelled) return "Cancelled";
  return `Ended ${new Date(Number(c.deadline) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Explore grid card. Title, creator name and category are untrusted onchain text: rendered as plain text only. */
export function CampaignCard({ c, now, backers }: { c: CampaignView; now: bigint | undefined; backers?: number }) {
  const meta = useAssetMeta(c.asset);
  const bps = progressBps(c.raised, c.goal);
  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="group flex flex-col overflow-hidden rounded-[20px] border border-line bg-paper text-ink no-underline transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(0,0,0,0.45)]"
    >
      <Cover seed={`${c.id}-${c.category}`} image={c.imageURI} className="h-36">
        <div className="relative flex items-start justify-between p-3.5">
          <span className="rounded-full bg-paper/90 px-2.5 py-1 font-mono text-xs font-semibold">#{c.id.toString()}</span>
          <Tag>{c.category}</Tag>
        </div>
      </Cover>
      <div className="relative flex flex-1 flex-col gap-3 px-5 pb-5 pt-0">
        <div className="-mt-5 flex items-end justify-between">
          <Avatar name={c.creatorName} seed={c.owner} size={44} />
          <span className="text-xs text-muted">{timeLabel(c, now)}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={c.status} />
        </div>
        <h3 className="line-clamp-2 break-words font-display text-lg font-bold leading-snug group-hover:text-forest">{c.title}</h3>
        <p className="truncate text-[13px] text-muted">
          by {c.creatorName} · <span className="font-mono">{shortAddress(c.owner)}</span>
        </p>
        <div className="mt-auto space-y-2 pt-1">
          <ProgressBar bps={bps} status={c.status} />
          <div className="flex items-baseline justify-between gap-2 font-mono text-sm">
            <span className="font-semibold">
              {meta ? formatAmount(c.raised, meta.decimals) : "…"}{" "}
              <span className="font-normal text-muted">/ {meta ? `${formatAmount(c.goal, meta.decimals)} ${meta.symbol}` : "…"}</span>
            </span>
            <span className="text-[13px] font-semibold">{Math.floor(bps / 100)}%</span>
          </div>
          {backers !== undefined && <p className="text-[13px] text-muted">{backers} {backers === 1 ? "backer" : "backers"}</p>}
        </div>
      </div>
    </Link>
  );
}

/** Homepage "Discover" card: big cover, serif title, thin progress line. */
export function DiscoverCard({ c, now, backers }: { c: CampaignView; now: bigint | undefined; backers: number }) {
  const meta = useAssetMeta(c.asset);
  const bps = progressBps(c.raised, c.goal);
  return (
    <Link href={`/campaigns/${c.id}`} className="group block text-ink no-underline">
      <Cover seed={`${c.id}-${c.category}`} image={c.imageURI} className="h-52 rounded-2xl transition group-hover:brightness-[0.97]">
        <div className="relative flex justify-between p-3">
          <Tag className="bg-paper">{c.category}</Tag>
          <Tag>
            {backers} {backers === 1 ? "backer" : "backers"}
          </Tag>
        </div>
      </Cover>
      <h3 className="mb-2.5 mt-4 line-clamp-2 break-words font-display text-lg font-bold leading-snug">{c.title}</h3>
      <ProgressBar bps={bps} status={c.status} />
      <div className="mt-2 flex justify-between text-[13px] text-muted">
        <span>
          <strong className="text-ink">{meta ? `${formatAmount(c.raised, meta.decimals)} ${meta.symbol}` : "…"}</strong> raised of{" "}
          {meta ? formatAmount(c.goal, meta.decimals) : "…"}
        </span>
        <span>{timeLabel(c, now)}</span>
      </div>
    </Link>
  );
}
