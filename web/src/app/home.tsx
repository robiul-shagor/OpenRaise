"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DiscoverCard, timeLabel } from "@/components/CampaignCards";
import { Cover } from "@/components/Cover";
import { ArrowRight, Button, Eyebrow, LinkButton, ProgressBar, Tag } from "@/components/ui";
import { formatAmount, progressBps, Status } from "@/lib/format";
import {
  campaignStats,
  raisedByAsset,
  useAppChain,
  useAssetMeta,
  useCampaigns,
  useChainNow,
  useEvents,
  usePlatformStats,
  type CampaignView,
} from "@/lib/hooks";

const STEPS = [
  {
    title: "Create a Campaign",
    text: "Set a goal, a deadline and the token you accept. These terms are locked into the contract the moment you launch.",
    link: "Start one",
    href: "/create",
    fn: "createCampaign()",
    cardTitle: "Launch With Clear Terms",
    cardText: "Goal, deadline and asset are public and can never be changed after launch.",
    cta: "Start now",
  },
  {
    title: "Back With Crypto",
    text: "Send test ETH or mUSD from your wallet. It sits in the contract — not with the founder, and not with us.",
    link: "Browse campaigns",
    href: "/campaigns",
    fn: "contribute()",
    cardTitle: "Back a Builder Today",
    cardText: "See exactly what you sign: the function, the contract and the amount.",
    cta: "Back now",
  },
  {
    title: "Withdraw When Funded",
    text: "Goal reached by the deadline? The owner — and only the owner — withdraws the full amount, once.",
    link: "See the rules",
    href: "/rules",
    fn: "withdraw()",
    cardTitle: "Funded? Get Paid Once",
    cardText: "Backers can’t refund a successful campaign. The money goes to the project.",
    cta: "View rules",
  },
  {
    title: "Refund If It Falls Short",
    text: "Goal missed? The owner is locked out, and every backer reclaims exactly what they put in — no deadline to claim.",
    link: "See the rules",
    href: "/rules",
    fn: "refund()",
    cardTitle: "Missed? Take It Back",
    cardText: "Press Claim refund and the contract sends your contribution back to you.",
    cta: "View rules",
  },
];

const FAQS = [
  [
    "How do I start a campaign?",
    "Connect your wallet, open Start a campaign, set a goal, a deadline and the accepted token, then sign one transaction. Your campaign appears on Campaigns as soon as it is confirmed.",
  ],
  [
    "What happens if a campaign misses its goal?",
    "At the deadline the campaign is marked failed. The owner can never withdraw, and every backer can press Claim refund to get back exactly what they contributed.",
  ],
  [
    "When can the owner withdraw?",
    "Only after the deadline, only if the goal was reached (hitting it exactly counts), only from the owner’s wallet, and only once. Any other attempt is rejected by the contract.",
  ],
  [
    "Is there a minimum or maximum contribution?",
    "Any amount above zero is accepted until the deadline. There is no platform fee — you only pay network gas, which is test ETH in this demo.",
  ],
  [
    "Is this real money?",
    "No. OpenRaise is a technical demo on a local test chain using test ETH and a mock token. It has not been audited and is not a fundraising service.",
  ],
];

const TRUST = [
  { title: "Escrowed by the contract", text: "Funds only leave through withdraw() or refund(). No admin key can move them.", icon: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" },
  { title: "Refunds you claim yourself", text: "Goal missed? Press Claim refund — no one has to approve it.", icon: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5" },
  { title: "A public record of every wei", text: "Each contribution, withdrawal and refund is an onchain event.", icon: "M4 6h16M4 12h16M4 18h10" },
  { title: "No surprise transactions", text: "Every action is simulated first, so you see a clear error before you sign.", icon: "M5 12l5 5L20 7" },
];

export function Home() {
  const { supported } = useAppChain();
  const { data: campaigns } = useCampaigns(60);
  const { data: events } = useEvents();
  const platform = usePlatformStats();
  const now = useChainNow();

  // Homepage shows only listable campaigns: not hidden by moderation, not cancelled.
  const list = useMemo(
    () => (campaigns ?? []).filter((c) => !c.hidden && c.status !== Status.Cancelled),
    [campaigns],
  );
  const backersOf = (c: CampaignView) => campaignStats(events ?? [], c.id).backers;

  // Featured: the active campaign closest to its goal, else the newest campaign.
  const featured = useMemo(() => {
    const active = list.filter((c) => c.status === Status.Active);
    const pool = active.length ? active : list;
    return [...pool].sort((a, b) => progressBps(b.raised, b.goal) - progressBps(a.raised, a.goal))[0];
  }, [list]);

  const recentBackers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of events ?? []) {
      if (e.kind !== "Contributed" || seen.has(e.actor)) continue;
      seen.add(e.actor);
      out.push(e.actor);
      if (out.length === 3) break;
    }
    return out;
  }, [events]);

  const totals = raisedByAsset(list);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-14 text-center">
        <h1 className="mx-auto max-w-[900px] font-display text-[40px] font-black leading-[1.12] tracking-[-0.02em] sm:text-[60px]">
          Back Bold Ideas. Get Refunded If They Fall Short.
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-[17px] text-muted">
          Every contribution goes straight into the campaign&apos;s smart contract. Builders only get paid if the goal is met —
          otherwise everyone gets their money back.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/campaigns" size="lg">
            Explore Campaigns <ArrowRight />
          </LinkButton>
          <LinkButton href="/create" variant="soft" size="lg">
            Start a Campaign
          </LinkButton>
        </div>
      </section>

      {/* Hero panel with live featured campaign */}
      <section className="mt-12">
        <div className="dots-light relative flex min-h-[500px] flex-wrap justify-between gap-5 overflow-hidden rounded-[28px] bg-panel p-5 sm:p-7">
          <HeroArt />
          <div className="relative w-[320px] max-w-full self-start rounded-[20px] bg-paper p-5 text-center shadow-[0_20px_40px_-20px_rgba(0,0,0,0.4)]">
            <h2 className="font-display text-[21px] font-black leading-tight">Fund Open Builders, Together</h2>
            <p className="mb-3.5 mt-2 text-[13px] text-muted">
              Join backers funding tools, infra and public goods — with every wei on the record.
            </p>
            <Cover seed={featured ? `${featured.id}-${featured.category}` : "hero"} image={featured?.imageURI} className="h-[150px] rounded-[14px]">
              {featured && <Tag className="absolute left-2.5 top-2.5">{featured.category}</Tag>}
            </Cover>
          </div>
          {featured ? (
            <FeaturedCard c={featured} now={now} backers={backersOf(featured)} />
          ) : (
            <div className="relative w-[330px] max-w-full self-end rounded-[20px] bg-paper p-5 text-sm text-muted">
              {supported ? "No campaigns yet — be the first." : "Connect to the local Anvil chain to see live campaigns."}
              <LinkButton href="/create" className="mt-4 w-full">Start a campaign</LinkButton>
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex">
              {(recentBackers.length ? recentBackers : ["0x4E", "0xA9", "0x6C"]).map((a, i) => (
                <span
                  key={a}
                  className={`grid h-[34px] w-[34px] place-items-center rounded-full border-2 border-white text-[11px] font-bold ${
                    ["bg-lime text-forest", "bg-mint text-forest", "bg-forest text-white"][i]
                  } ${i ? "-ml-2.5" : ""}`}
                  aria-hidden="true"
                >
                  {a.slice(2, 4).toUpperCase()}
                </span>
              ))}
            </div>
            <span className="text-sm text-ink-2">
              <strong>
                {platform.backers} {platform.backers === 1 ? "backer" : "backers"}
              </strong>{" "}
              have funded builders on OpenRaise
            </span>
          </div>
          <LinkButton href="/#how" variant="soft" className="bg-mint-2">
            See how it works <ArrowRight />
          </LinkButton>
        </div>
      </section>

      <HowItWorks />

      <Discover list={list} now={now} backersOf={backersOf} />

      {/* Stats band */}
      <section className="relative mt-20 overflow-hidden rounded-[28px] bg-mint-3 px-6 py-16 text-center">
        <div className="dots-dark absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-[620px]">
          <h2 className="font-display text-3xl font-black leading-tight sm:text-[40px]">Join Backers Funding Builders in the Open</h2>
          <p className="mt-3 text-muted">Every contribution is a public transaction — here&apos;s the running total across all campaigns.</p>
          <LinkButton href="/campaigns" className="mt-6">Back a campaign</LinkButton>
          <div className="mt-8 font-display text-6xl font-black text-forest">{platform.contributions}</div>
          <div className="mt-1 text-sm text-ink-2">
            contributions · {formatAmount(totals.eth, 18)} ETH and {formatAmount(totals.token, 6)} mUSD raised across{" "}
            {list.length} {list.length === 1 ? "campaign" : "campaigns"}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="pt-24 text-center">
        <h2 className="font-display text-3xl font-black sm:text-[44px]">Built So You Don&apos;t Have to Trust Us</h2>
        <p className="mt-3 text-muted">The rules live in public code. Here&apos;s what that means for you.</p>
        <div className="mt-10 grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.title} className="rounded-[20px] bg-wash p-6">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-mint text-forest">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{t.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      <Faq />
    </div>
  );
}

function FeaturedCard({ c, now, backers }: { c: CampaignView; now: bigint | undefined; backers: number }) {
  const meta = useAssetMeta(c.asset);
  const bps = progressBps(c.raised, c.goal);
  return (
    <div className="relative w-[330px] max-w-full self-end rounded-[20px] bg-paper p-5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.4)]">
      <div className="font-display text-[30px] font-black">
        {meta ? `${formatAmount(c.raised, meta.decimals)} ${meta.symbol}` : "…"}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>
          <strong className="text-ink">{backers}</strong> backers · goal {meta ? `${formatAmount(c.goal, meta.decimals)} ${meta.symbol}` : "…"}
        </span>
        <strong className="text-ink">{Math.floor(bps / 100)}%</strong>
      </div>
      <div className="mt-1.5">
        <ProgressBar bps={bps} status={c.status} />
      </div>
      <p className="mt-3 truncate text-[13px] text-ink-2">
        {c.title} · {timeLabel(c, now)}
      </p>
      <div className="mt-4 flex gap-2">
        <LinkButton href={`/campaigns/${c.id}#back-${c.id}`} variant="soft" className="flex-1 px-3">
          Back now
        </LinkButton>
        <LinkButton href={`/campaigns/${c.id}`} className="flex-1 px-3">
          View campaign
        </LinkButton>
      </div>
    </div>
  );
}

function HeroArt() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="600" cy="260" r="150" fill="#4F7A57" opacity="0.55" />
      <circle cx="660" cy="220" r="90" fill="#A9C79C" opacity="0.5" />
      <rect x="470" y="300" width="300" height="120" rx="28" fill="#CFE8C4" opacity="0.18" transform="rotate(-8 620 360)" />
      <path d="M380 380 C 480 300, 560 420, 700 330 S 900 260, 980 300" stroke="#E9F86B" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="980" cy="300" r="9" fill="#E9F86B" />
    </svg>
  );
}

function HowItWorks() {
  const [step, setStep] = useState(0);
  const cur = STEPS[step];
  return (
    <section id="how" className="flex scroll-mt-6 flex-wrap items-center gap-14 pb-10 pt-28">
      <div className="min-w-0 flex-[1_1_380px]">
        <Eyebrow>How it works</Eyebrow>
        <div role="tablist" aria-label="How it works" className="mt-5 flex flex-col">
          {STEPS.map((s, i) => (
            <div key={s.title} className="border-b border-line pb-3.5 pt-1.5">
              <button
                type="button"
                role="tab"
                aria-selected={step === i}
                onClick={() => setStep(i)}
                className={`block w-full py-2.5 text-left font-display text-2xl leading-snug ${
                  step === i ? "font-black text-ink" : "font-bold text-[#A3ABA4] hover:text-ink-2"
                }`}
              >
                {s.title}
              </button>
              {step === i && (
                <p className="max-w-[420px] text-sm text-muted">
                  {s.text}{" "}
                  <Link href={s.href} className="font-semibold text-ember no-underline">
                    {s.link} ↗
                  </Link>
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-[420px] text-sm text-muted">
          All four steps are functions on one public contract — nobody, including us, can move the money any other way.
        </p>
      </div>
      <div className="relative min-h-[470px] min-w-0 flex-[1_1_520px]">
        <div className="absolute bottom-[50px] left-0 top-[50px] hidden w-[70px] rounded-[18px] bg-sage sm:block" />
        <div className="absolute bottom-[25px] left-[30px] top-[25px] hidden w-20 rounded-[18px] bg-moss sm:block" />
        <div className="dots-dark absolute inset-0 flex items-end justify-center rounded-[22px] bg-mint-2 p-4 sm:left-[70px] sm:p-6">
          <span className="absolute right-5 top-5 rounded-full bg-paper px-3.5 py-1.5 font-mono text-[13px] font-semibold text-forest">
            {cur.fn}
          </span>
          <div className="relative w-[300px] max-w-full rounded-[18px] bg-paper p-5 text-center shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)]">
            <h3 className="font-display text-xl font-black leading-tight">{cur.cardTitle}</h3>
            <p className="mb-4 mt-2 text-[13px] text-muted">{cur.cardText}</p>
            <div className="flex gap-2">
              <LinkButton href="/rules" variant="soft" className="h-[42px] flex-1 px-3 text-[13px]">See the rules</LinkButton>
              <LinkButton href={cur.href} className="h-[42px] flex-1 px-3 text-[13px]">{cur.cta}</LinkButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Discover({
  list,
  now,
  backersOf,
}: {
  list: readonly CampaignView[];
  now: bigint | undefined;
  backersOf: (c: CampaignView) => number;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / 3));
  const current = page % pages;
  const shown = list.slice(current * 3, current * 3 + 3);
  return (
    <section className="pb-10 pt-24 text-center">
      <h2 className="mx-auto max-w-[720px] font-display text-3xl font-black leading-tight tracking-[-0.01em] sm:text-[44px]">
        Discover Campaigns Built Around What You Care About
      </h2>
      <p className="mx-auto mt-3.5 max-w-[460px] text-muted">
        Tooling, infra, education and public goods — each one escrowed by the contract until its deadline.
      </p>
      {shown.length ? (
        <div className="mt-10 grid gap-6 text-left sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <DiscoverCard key={c.id.toString()} c={c} now={now} backers={backersOf(c)} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-muted">No campaigns yet.</p>
      )}
      {pages > 1 && (
        <div className="mt-9 flex justify-center gap-2.5">
          <Button variant="soft" onClick={() => setPage((p) => (p - 1 + pages) % pages)}>← Previous</Button>
          <Button onClick={() => setPage((p) => (p + 1) % pages)}>Next →</Button>
        </div>
      )}
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mx-auto max-w-[820px] scroll-mt-6 pt-24">
      <h2 className="text-center font-display text-3xl font-black sm:text-[44px]">Frequently Asked Questions</h2>
      <div className="mt-10 divide-y divide-line border-y border-line">
        {FAQS.map(([q, a], i) => (
          <div key={q}>
            <button
              type="button"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left font-display text-lg font-bold"
            >
              <span>{q}</span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mint-3 font-sans text-forest">
                {open === i ? "−" : "+"}
              </span>
            </button>
            {open === i && <p className="-mt-1 pb-5 text-muted">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
