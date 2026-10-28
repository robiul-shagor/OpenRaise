"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { useAppChain } from "@/lib/hooks";
import { shortAddress } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";

const repo = process.env.NEXT_PUBLIC_REPO_URL;

export function SiteFooter() {
  const mounted = useMounted();
  const { deployment, chainId } = useAppChain();
  const col = "flex flex-col gap-2 text-sm";
  const head = "mb-1 text-xs font-semibold uppercase tracking-wider text-sage";
  return (
    <footer className="mt-24 bg-forest text-mint-2">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div className="space-y-3">
          <div className="[&_span]:text-white">
            <Logo />
          </div>
          <p className="max-w-xs text-sm text-sage">
            All-or-nothing crowdfunding, enforced by a public smart contract. A technical demo — not audited, not for real funds.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className={col}>
            <div className={head}>Contract</div>
            <span className="font-mono text-xs">{mounted && deployment ? shortAddress(deployment.openRaise) : "—"}</span>
            <span className="text-xs">{mounted ? `Chain ${chainId}` : ""}</span>
          </div>
          <div className={col}>
            <div className={head}>Product</div>
            <Link href="/campaigns" className="text-mint-2 no-underline hover:text-white">Campaigns</Link>
            <Link href="/create" className="text-mint-2 no-underline hover:text-white">Start a campaign</Link>
            <Link href="/activity" className="text-mint-2 no-underline hover:text-white">Activity</Link>
            <Link href="/dashboard" className="text-mint-2 no-underline hover:text-white">My dashboard</Link>
          </div>
          <div className={col}>
            <div className={head}>Learn</div>
            <Link href="/#how" className="text-mint-2 no-underline hover:text-white">How it works</Link>
            <Link href="/rules" className="text-mint-2 no-underline hover:text-white">Withdraw &amp; refund rules</Link>
            <Link href="/#faq" className="text-mint-2 no-underline hover:text-white">FAQ</Link>
          </div>
          {repo && (
            <div className={col}>
              <div className={head}>Source</div>
              <a href={repo} target="_blank" rel="noreferrer noopener" className="text-mint-2 no-underline hover:text-white">GitHub</a>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-[1240px] px-4 py-5 text-xs text-sage sm:px-6">
          © 2026 OpenRaise · Technical demo — not audited, not for real funds.
        </p>
      </div>
    </footer>
  );
}
