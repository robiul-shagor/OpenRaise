import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui";

export const metadata = { title: "Campaign rules — OpenRaise" };

function State({ name, tone, children }: { name: string; tone: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border-2 p-4 sm:p-5 ${tone}`}>
      <div className="font-display text-xl font-black">{name}</div>
      <div className="mt-1 text-[13px] text-ink-2">{children}</div>
    </div>
  );
}

function Arrow({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex flex-col items-stretch px-2 py-2 lg:py-0">
      <div className={`text-center font-mono text-xs font-semibold ${color}`}>{label}</div>
      <div className={`flex items-center ${color}`} aria-hidden="true">
        <div className="h-0.5 flex-1 bg-current" />
        <svg width="10" height="12" viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z" fill="currentColor" /></svg>
      </div>
    </div>
  );
}

const mono = "font-mono text-[13px]";

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-12 sm:px-6">
      <p className="mb-2 font-mono text-[13px] uppercase tracking-[0.05em] text-forest">Campaign state machine</p>
      <h1 className="font-display text-[34px] font-black tracking-[-0.01em] sm:text-[44px]">One deadline, two ways out</h1>
      <p className="mt-2 max-w-[760px] text-muted">
        Status is derived from <code className={mono}>block.timestamp</code>, <code className={mono}>raised</code> and{" "}
        <code className={mono}>goal</code> on every read — no keeper or admin has to &ldquo;close&rdquo; a campaign.
      </p>

      <div className="mt-8 rounded-[20px] border border-line bg-paper p-5 sm:p-9">
        <div className="grid items-center gap-y-2 lg:grid-cols-[220px_1fr_220px_1fr_220px]">
          <div className="lg:row-span-2">
            <State name="Active" tone="border-sky bg-sky-bg [&>div:first-child]:text-sky">
              <code className="font-mono">now &lt; deadline</code>
              <br />
              contribute() allowed
            </State>
          </div>
          <Arrow label="deadline passed ∧ raised ≥ goal" color="text-forest" />
          <State name="Successful" tone="border-forest bg-mint-2 [&>div:first-child]:text-forest">
            withdraw() for owner
            <br />
            refund() reverts
          </State>
          <Arrow label="owner · withdraw()" color="text-forest" />
          <State name="Withdrawn" tone="border-ink">
            withdrawn = true
            <br />
            second call reverts
          </State>

          <Arrow label="deadline passed ∧ raised < goal" color="text-rust" />
          <State name="Failed" tone="border-rust bg-rust-bg [&>div:first-child]:text-rust">
            refund() for each backer
            <br />
            withdraw() reverts
          </State>
          <Arrow label="each backer · refund()" color="text-rust" />
          <State name="Refunded (per backer)" tone="border-ink">
            contributionOf[you] = 0
            <br />
            pull-based, once each
          </State>
        </div>
        <div className="mt-6 grid items-center gap-y-2 border-t border-line pt-6 lg:grid-cols-[220px_1fr_220px_1fr_220px]">
          <div className="hidden lg:block" />
          <Arrow label="owner or admin · cancelCampaign() while Active" color="text-muted" />
          <State name="Cancelled" tone="border-faint bg-[#EEEAE4]">
            contribute() &amp; withdraw() revert
            <br />
            refund() for each backer
          </State>
          <Arrow label="each backer · refund()" color="text-rust" />
          <State name="Refunded (per backer)" tone="border-ink">
            full contribution back
            <br />
            no need to wait for the deadline
          </State>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <RuleCard who="Owner · success" badge="Successful" badgeTone="bg-mint-2 text-forest" title="Goal reached → withdraw once">
          After the deadline, if <code className={mono}>raised ≥ goal</code>, the owner can call <code className={mono}>withdraw()</code>{" "}
          to receive the full raised amount. A second call reverts with <code className={mono}>InvalidStatus(Withdrawn)</code>.
        </RuleCard>
        <RuleCard who="Backer · failed" badge="Failed · refunds open" badgeTone="bg-rust-bg text-rust" title="Goal missed → claim refund">
          Every backer can call <code className={mono}>refund()</code> and get back exactly their recorded contribution. There is
          no deadline to claim, and the owner can never withdraw.
        </RuleCard>
        <RuleCard who="Backer · after refund" badge="Refunded" badgeTone="bg-mint-3 text-ink" title="Nothing left to claim">
          Your <code className={mono}>contributionOf</code> is set to 0 before the transfer, so a second claim reverts with{" "}
          <code className={mono}>NothingToRefund()</code>.
        </RuleCard>
        <RuleCard who="Any user · reverted" badge="Transaction reverted" badgeTone="bg-rust-bg text-rust" title="Nothing was sent">
          Each action is simulated first, and custom errors are decoded into plain language:
          <span className="mt-2 block rounded-lg bg-wash p-2">
            <code className={mono}>InvalidStatus</code> — the campaign isn&apos;t in the right state (e.g. it just ended).
          </span>
          <span className="mt-1.5 block rounded-lg bg-wash p-2">
            <code className={mono}>NotCampaignOwner</code> — only the owner can withdraw.
          </span>
        </RuleCard>
      </div>

      <div className="mt-8 rounded-[20px] bg-wash p-6 text-sm text-ink-2">
        <h2 className="font-display text-lg font-bold text-ink">Boundaries, exactly</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Contributions are accepted while <code className={mono}>block.timestamp &lt; deadline</code>; at exactly the deadline the campaign has ended.</li>
          <li>The goal is inclusive: raising exactly the goal is a success.</li>
          <li>Contributions above the goal are allowed while active; the owner withdraws the full amount.</li>
          <li>Durations from 1 minute to 365 days. Goal, deadline and asset can never change after creation.</li>
          <li>
            While Active, the owner may edit title, description, team name, category and cover image (an{" "}
            <code className={mono}>ipfs://</code> or <code className={mono}>https://</code> link) with{" "}
            <code className={mono}>updateCampaign()</code>; each edit is a public <code className={mono}>CampaignUpdated</code> event.
          </li>
          <li>
            While Active, the owner — or the platform admin, e.g. for a scam — may <code className={mono}>cancelCampaign()</code>. Backers
            are then refunded in full, even if the goal was already met.
          </li>
          <li>
            The admin can also hide a campaign from listings (<code className={mono}>setHidden()</code>), remove and lock its image
            (<code className={mono}>setImageLocked()</code>) and allowlist tokens. The owner can change just the cover image at any time,
            even after the campaign ends, with <code className={mono}>updateImage()</code>. Funds move
            only through <code className={mono}>withdraw()</code> (owner, Successful) and <code className={mono}>refund()</code> (backer, Failed
            or Cancelled) — the admin can never take them.
          </li>
        </ul>
        <LinkButton href="/campaigns" className="mt-5">Explore campaigns</LinkButton>
      </div>
    </div>
  );
}

function RuleCard({
  who,
  badge,
  badgeTone,
  title,
  children,
}: {
  who: string;
  badge: string;
  badgeTone: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-paper p-5">
      <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">{who}</div>
      <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${badgeTone}`}>{badge}</span>
      <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </section>
  );
}
