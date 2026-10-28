"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { LinkButton } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { useAppChain, useIsAdmin } from "@/lib/hooks";
import { useMounted } from "@/lib/useMounted";

type Item = { href: string; label: string; isActive: (path: string, type: string | null) => boolean };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Overview", isActive: (p) => p === "/dashboard" },
  { href: "/dashboard/campaigns", label: "My campaigns", isActive: (p) => p.startsWith("/dashboard/campaigns") },
  { href: "/dashboard/backed", label: "Backed", isActive: (p) => p.startsWith("/dashboard/backed") },
];

// Admin section, following the "Backend — contributions & indexer" design board.
const ADMIN_ITEMS: Item[] = [
  { href: "/dashboard/admin", label: "Moderation", isActive: (p) => p === "/dashboard/admin" },
  {
    href: "/dashboard/admin/contributions",
    label: "Contributions",
    isActive: (p, t) => p === "/dashboard/admin/contributions" && t !== "payouts",
  },
  {
    href: "/dashboard/admin/contributions?type=payouts",
    label: "Refunds & withdrawals",
    isActive: (p, t) => p === "/dashboard/admin/contributions" && t === "payouts",
  },
  { href: "/dashboard/admin/contributions#indexer", label: "Indexer", isActive: () => false },
  { href: "/dashboard/admin/contracts", label: "Contracts", isActive: (p) => p === "/dashboard/admin/contracts" },
];

/** Owner/backer area: sidebar on desktop, tab row on mobile. Requires a connected wallet on a supported chain. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const type = useSearchParams().get("type");
  const mounted = useMounted();
  const { address, isConnected } = useConnection();
  const { supported, chainId } = useAppChain();
  const { isAdmin } = useIsAdmin();
  const navLink = (i: Item) => {
    const on = i.isActive(path, type);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={on ? "page" : undefined}
        className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold no-underline lg:rounded-xl ${
          on ? "bg-forest text-white" : "text-ink-2 hover:bg-mint-3"
        }`}
      >
        {i.label}
      </Link>
    );
  };

  // Wallet state is only known in the browser, so gates apply after mount. The page itself is ALWAYS rendered
  // (hidden while gated): a layout that drops `children` stops Next from rendering and validating the page segment.
  let gate: ReactNode = null;
  if (mounted && (!isConnected || !address))
    gate = (
      <Gate title="Connect your wallet">
        Your dashboard shows the campaigns you own and the ones you backed. Use <strong>Connect wallet</strong> in the header.
      </Gate>
    );
  else if (mounted && !supported) gate = <Gate title="Unsupported network">No OpenRaise deployment on chain {chainId}.</Gate>;
  const body = (
    <>
      {gate}
      <div hidden={gate !== null}>{children}</div>
    </>
  );

  return (
    <div className="mx-auto grid max-w-[1240px] gap-6 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <aside className="min-w-0">
        <div className="lg:sticky lg:top-6">
          <div className="mb-3 hidden lg:block">
            <div className="font-display text-lg font-black">Dashboard</div>
            {mounted && address && <div className="font-mono text-xs text-muted">{shortAddress(address)}{isAdmin ? " · admin" : ""}</div>}
          </div>
          <nav aria-label="Dashboard" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
            {ITEMS.map(navLink)}
          </nav>
          {mounted && isAdmin && (
            <nav aria-label="Admin" className="-mx-1 mt-2 flex items-center gap-1 overflow-x-auto px-1 pb-1 lg:mt-5 lg:flex-col lg:items-stretch lg:overflow-visible">
              <span className="shrink-0 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted lg:px-4 lg:pb-1">Admin</span>
              {ADMIN_ITEMS.map(navLink)}
            </nav>
          )}
          <LinkButton href="/create" variant="soft" className="mt-4 hidden w-full lg:inline-flex">
            Start a campaign
          </LinkButton>
        </div>
      </aside>
      <div className="min-w-0">{body}</div>
    </div>
  );
}

export function Gate({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-line p-10 text-center">
      <h1 className="font-display text-2xl font-black">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>
    </div>
  );
}
