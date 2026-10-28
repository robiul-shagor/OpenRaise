"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { LinkButton } from "./ui";

const NAV = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/#how", label: "How It Works" },
  { href: "/activity", label: "Activity" },
  { href: "/rules", label: "Rules" },
];

function NavLinks({ path, mobile = false, onNavigate }: { path: string; mobile?: boolean; onNavigate?: () => void }) {
  return NAV.map((n) => {
    const active = n.href !== "/#how" && path.startsWith(n.href);
    const tone = active ? "bg-mint-3 text-forest" : "text-ink-2 hover:text-forest";
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={
          mobile
            ? `flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold no-underline ${active ? tone : "text-ink hover:bg-wash"}`
            : `rounded-full px-3.5 py-2.5 no-underline ${tone}`
        }
      >
        {n.label}
      </Link>
    );
  });
}

// usePathname is request data on dynamic routes, so it must sit inside Suspense; the fallback renders the same links unhighlighted.
function ActiveNavLinks(props: { mobile?: boolean; onNavigate?: () => void }) {
  return <NavLinks path={usePathname()} {...props} />;
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // While the mobile menu is open: Escape closes it, and growing past the lg breakpoint resets it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => mq.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="relative z-40 border-b border-line/70 bg-paper">
      {/* Own background layer so the open-menu backdrop dims the page, not the header bar. */}
      <div className="relative bg-paper">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-2 px-3 py-3 min-[360px]:px-4 sm:gap-3 sm:px-6 lg:py-4">
          <Logo compact />
          <nav aria-label="Primary" className="hidden gap-1 text-sm font-medium lg:flex">
            <Suspense fallback={<NavLinks path="" />}>
              <ActiveNavLinks />
            </Suspense>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <WalletButton />
            {/* Hidden via a wrapper: LinkButton always sets inline-flex, which would override `hidden`. */}
            <div className="hidden lg:block">
              <LinkButton href="/create">Start a campaign</LinkButton>
            </div>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink hover:bg-wash lg:hidden"
            >
              <MenuIcon open={open} />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <>
          {/* Tap-outside backdrop; hidden from assistive tech (the toggle button and Escape already close the menu). */}
          <div aria-hidden="true" onClick={close} className="fixed inset-0 -z-10 bg-ink/20 lg:hidden" />
          <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-paper shadow-[0_24px_40px_-24px_rgba(0,0,0,0.35)] lg:hidden">
            <nav aria-label="Mobile" className="mx-auto flex max-w-[1240px] flex-col gap-1 px-4 pb-5 pt-3 sm:px-6">
              <Suspense fallback={<NavLinks path="" mobile onNavigate={close} />}>
                <ActiveNavLinks mobile onNavigate={close} />
              </Suspense>
              <LinkButton href="/create" size="lg" className="mt-3 w-full" onClick={close}>
                Start a campaign
              </LinkButton>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
