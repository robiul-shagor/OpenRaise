"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CampaignCard } from "@/components/CampaignCards";
import { DevTools } from "@/components/DevTools";
import { EventFeed, useAssetResolver } from "@/components/EventFeed";
import { Button, LinkButton } from "@/components/ui";
import { describeError } from "@/lib/errors";
import { formatAmount, Status, STATUS_LABEL } from "@/lib/format";
import {
  campaignStats,
  raisedByAsset,
  useAppChain,
  useCampaigns,
  useChainNow,
  useEvents,
  usePlatformStats,
} from "@/lib/hooks";

const PAGE = 24;
type Filter = "all" | Status;
const FILTERS: Filter[] = ["all", Status.Active, Status.Successful, Status.Failed, Status.Withdrawn, Status.Cancelled];

export function Explore() {
  const { supported, chainId } = useAppChain();
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { data, total, isPending, error, refetch } = useCampaigns(limit);
  const { data: events } = useEvents();
  const platform = usePlatformStats();
  const now = useChainNow();
  const resolve = useAssetResolver(data);

  // Hidden campaigns are moderated out of listings; their pages stay reachable so refunds always work.
  const list = useMemo(() => (data ?? []).filter((c) => !c.hidden), [data]);
  const totals = raisedByAsset(list);
  const q = query.trim().toLowerCase();
  const matches = list.filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.creatorName.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.owner.toLowerCase().includes(q),
  );
  const shown = filter === "all" ? matches : matches.filter((c) => c.status === filter);
  const count = (f: Filter) => (f === "all" ? matches.length : matches.filter((c) => c.status === f).length);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      <section className="flex flex-wrap items-end justify-between gap-10 pb-8 pt-14">
        <div className="min-w-0 flex-[1_1_520px]">
          <p className="mb-3.5 font-mono text-[13px] uppercase tracking-[0.04em] text-forest">
            Escrowed by smart contract · refundable if goals are missed
          </p>
          <h1 className="font-display text-[40px] font-black leading-[1.05] tracking-[-0.02em] sm:text-[56px]">
            Back the builders.
            <br />
            Every wei on the record.
          </h1>
          <p className="mt-4 max-w-[620px] text-[17px] text-muted">
            Contributions go straight into the campaign contract. Owners withdraw only if the goal is met by the deadline —
            otherwise every backer can claim their refund.
          </p>
        </div>
        <div className="grid flex-[1_1_420px] grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {[
            ["Raised in ETH", formatAmount(totals.eth, 18, 2)],
            ["Raised in mUSD", formatAmount(totals.token, 6, 0)],
            ["Contributions", String(platform.contributions)],
          ].map(([label, value]) => (
            <div key={label} className="bg-paper p-4">
              <div className="text-[13px] text-muted">{label}</div>
              <div className="truncate font-mono text-2xl font-bold tracking-tight">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {!supported ? (
        <p className="rounded-2xl bg-rust-bg p-5 text-rust">
          No OpenRaise deployment for chain {chainId}. Switch your wallet to Anvil (31337).
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-7 pb-10">
          <div className="min-w-0 flex-[999_1_640px]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
                      filter === f ? "bg-forest text-white" : "border border-line bg-paper text-ink hover:bg-wash"
                    }`}
                  >
                    {f === "all" ? "All" : STATUS_LABEL[f]}
                    <span className="font-mono text-xs opacity-75">{count(f)}</span>
                  </button>
                ))}
              </div>
              <label className="flex h-11 min-w-[200px] flex-[0_1_320px] items-center gap-2 rounded-full border border-line bg-paper px-4 focus-within:border-forest">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#59625A" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span className="sr-only">Search campaigns</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, team, category or address"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>
            </div>

            {error ? (
              <div className="space-y-3 rounded-2xl bg-rust-bg p-5 text-rust">
                <p>Could not load campaigns: {describeError(error)}</p>
                <p className="text-sm">Is Anvil running and are contracts deployed? See the README.</p>
                <Button variant="outline" onClick={() => refetch()}>Retry</Button>
              </div>
            ) : isPending ? (
              <p className="text-muted">Loading campaigns…</p>
            ) : shown.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-line p-10 text-center text-muted">
                {list.length ? "No campaigns match these filters." : "No campaigns yet."}{" "}
                <Link href="/create" className="font-semibold">Start one</Link>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
                {shown.map((c) => (
                  <CampaignCard key={c.id.toString()} c={c} now={now} backers={campaignStats(events ?? [], c.id).backers} />
                ))}
              </div>
            )}

            {total !== undefined && BigInt(limit) < total && (
              <div className="mt-8 text-center">
                <Button variant="soft" onClick={() => setLimit((l) => l + PAGE)}>
                  Load more ({(total - BigInt(limit)).toString()} older)
                </Button>
              </div>
            )}
          </div>

          <aside aria-label="Live onchain activity" className="flex-[1_1_320px] space-y-4">
            <div className="rounded-[20px] border border-line bg-paper p-5">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="font-display text-[17px] font-bold">Live activity</h2>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest">
                  <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-grow" />
                  Watching events
                </span>
              </div>
              <p className="mb-2 text-[13px] text-muted">Decoded from contract logs.</p>
              {events?.length ? (
                <EventFeed events={events.slice(0, 8)} resolve={resolve} now={now} withCampaign />
              ) : (
                <p className="py-4 text-sm text-muted">No events yet.</p>
              )}
              <LinkButton href="/activity" variant="outline" className="mt-2 w-full rounded-xl">
                Open full event log
              </LinkButton>
            </div>
            <DevTools />
          </aside>
        </div>
      )}
    </div>
  );
}
