"use client";

import { useCallback } from "react";
import { zeroAddress } from "viem";
import { ETH_META, explorerTxUrl, formatAmount, shortAddress, timeAgo, type AssetMeta } from "@/lib/format";
import { useAppChain, useAssetMeta, type ActivityItem, type CampaignView, type EventKind } from "@/lib/hooks";

export const EVENT_DOT: Record<EventKind, string> = {
  CampaignCreated: "bg-ink",
  Contributed: "bg-sky",
  Withdrawn: "bg-forest",
  Refunded: "bg-rust",
  CampaignUpdated: "bg-moss",
  CampaignCancelled: "bg-faint",
  CampaignHiddenSet: "bg-ember",
  CampaignImageLocked: "bg-ember",
  CampaignImageUpdated: "bg-moss",
};

export const EVENT_CHIP: Record<EventKind, string> = {
  CampaignCreated: "bg-mint-3 text-ink",
  Contributed: "bg-sky-bg text-sky",
  Withdrawn: "bg-mint-2 text-forest",
  Refunded: "bg-rust-bg text-rust",
  CampaignUpdated: "bg-wash text-ink-2",
  CampaignCancelled: "bg-[#EEEAE4] text-ink-2",
  CampaignHiddenSet: "bg-rust-bg text-ember",
  CampaignImageLocked: "bg-rust-bg text-ember",
  CampaignImageUpdated: "bg-wash text-ink-2",
};

/** Maps a campaign id to its asset's symbol/decimals (ETH or the mock token). */
export function useAssetResolver(campaigns: readonly CampaignView[] | undefined) {
  const { deployment } = useAppChain();
  const tokenMeta = useAssetMeta(deployment?.mockToken);
  return useCallback(
    (id: bigint): AssetMeta | undefined => {
      const c = campaigns?.find((x) => x.id === id);
      if (!c) return undefined;
      return c.asset === zeroAddress ? ETH_META : tokenMeta;
    },
    [campaigns, tokenMeta],
  );
}

export function eventText(e: ActivityItem, meta: AssetMeta | undefined, opts: { withCampaign: boolean }): string {
  const amt = e.amount !== undefined && meta ? `${formatAmount(e.amount, meta.decimals)} ${meta.symbol}` : "";
  const on = opts.withCampaign ? ` #${e.campaignId}` : "";
  switch (e.kind) {
    case "CampaignCreated":
      return `Campaign${on} opened by ${shortAddress(e.actor)}`;
    case "Contributed":
      return `${shortAddress(e.actor)} backed${on} with ${amt}`;
    case "Withdrawn":
      return `Owner withdrew ${amt}${opts.withCampaign ? ` from #${e.campaignId}` : ""}`;
    case "Refunded":
      return `${shortAddress(e.actor)} reclaimed ${amt}${opts.withCampaign ? ` from #${e.campaignId}` : ""}`;
    case "CampaignUpdated":
      return `Owner edited the campaign details${on}`;
    case "CampaignCancelled":
      return `Campaign${on} cancelled by ${e.flag ? "the platform admin" : "its owner"} — refunds open`;
    case "CampaignHiddenSet":
      return `Campaign${on} ${e.flag ? "hidden" : "unhidden"} by the platform admin`;
    case "CampaignImageLocked":
      return e.flag
        ? `Image removed${opts.withCampaign ? ` from #${e.campaignId}` : ""} and locked by the platform admin`
        : `Image unlocked${on} by the platform admin`;
    case "CampaignImageUpdated":
      return `Owner ${e.flag ? "updated" : "removed"} the cover image${on}`;
  }
}

export function EventFeed({
  events,
  resolve,
  now,
  withCampaign,
  testId,
}: {
  events: readonly ActivityItem[];
  resolve: (id: bigint) => AssetMeta | undefined;
  now: bigint | undefined;
  withCampaign: boolean;
  testId?: string;
}) {
  const { chainId } = useAppChain();
  return (
    <ol className="flex flex-col" data-testid={testId}>
      {events.map((e) => {
        const url = explorerTxUrl(chainId, e.txHash);
        return (
          <li key={`${e.txHash}-${e.logIndex}`} className="flex gap-3 border-t border-line py-3 first:border-t-0">
            <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${EVENT_DOT[e.kind]}`} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="font-mono text-xs font-semibold">{e.kind}</span>
                <span className="text-xs text-muted">
                  {e.timestamp !== undefined && now !== undefined ? timeAgo(e.timestamp, now) : ""}
                </span>
              </div>
              <div className="mt-0.5 break-words text-sm">{eventText(e, resolve(e.campaignId), { withCampaign })}</div>
              <div className="mt-0.5 font-mono text-xs text-muted">
                #{e.blockNumber.toString()} ·{" "}
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer noopener">{shortAddress(e.txHash)}</a>
                ) : (
                  <span title={e.txHash}>{shortAddress(e.txHash)}</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
