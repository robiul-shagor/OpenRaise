"use client";

import Link from "next/link";
import { useMounted } from "@/lib/useMounted";
import { useEffect, useRef, useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { describeError } from "@/lib/errors";
import { useIsAdmin } from "@/lib/hooks";
import { Button } from "./ui";

export function WalletButton() {
  const { address, isConnected, connector, chain, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const [open, setOpen] = useState(false);
  const mounted = useMounted();
  const { isAdmin } = useIsAdmin();
  const ref = useRef<HTMLDivElement>(null);

  // Close the wallet/account menu on outside click or Escape.
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Avoid hydration mismatch: connection state is only known in the browser.
  if (!mounted) return <Button variant="soft" disabled>Connect<span className="hidden sm:inline"> wallet</span></Button>;

  if (isConnected && address) {
    const network = chain ? `${chain.name === "Foundry" ? "Anvil" : chain.name} · ${chain.id}` : `Chain ${chainId}`;
    return (
      <div className="relative flex items-center gap-2" ref={ref}>
        <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-2 font-mono text-xs text-ink-2 xl:inline-flex" title={connector?.name}>
          <span className="h-2 w-2 rounded-full bg-grow" />
          {network}
        </span>
        <Button variant="soft" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" title="Account">
          <span className="font-mono min-[360px]:hidden">{`${address.slice(0, 4)}…${address.slice(-3)}`}</span>
          <span className="hidden font-mono min-[360px]:inline">{shortAddress(address)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Button>
        {open && (
          <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-line bg-paper p-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)]">
            <div className="px-3 pb-2 pt-1.5">
              <div className="break-all font-mono text-xs text-ink">{address}</div>
              <div className="mt-0.5 text-xs text-muted">
                {connector?.name} · {network}
              </div>
            </div>
            <Link
              role="menuitem"
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-mint-3"
            >
              My dashboard
            </Link>
            {isAdmin && (
              <Link
                role="menuitem"
                href="/dashboard/admin"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-mint-3"
              >
                Admin
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                disconnect.mutate();
              }}
              className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-rust hover:bg-rust-bg"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="soft" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        Connect<span className="hidden sm:inline"> wallet</span>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line bg-paper p-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)]">
          {connectors.map((c) => (
            <button
              key={c.uid}
              role="menuitem"
              className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-mint-3"
              onClick={() => {
                connect.mutate({ connector: c }, { onSuccess: () => setOpen(false) });
              }}
            >
              {c.id === "injected" ? "Browser wallet (MetaMask, Rabby…)" : c.name}
              {c.id.startsWith("anvil-dev") && <span className="block text-xs text-muted">Local Anvil only, no signing prompt</span>}
            </button>
          ))}
          {connect.error && <p className="px-3 py-2 text-xs text-rust">{describeError(connect.error)}</p>}
        </div>
      )}
    </div>
  );
}
