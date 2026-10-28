"use client";

import { useMounted } from "@/lib/useMounted";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection, usePublicClient } from "wagmi";
import { useAppChain, useChainNow } from "@/lib/hooks";
import { mockErc20Abi } from "@/lib/contracts";
import { LOCAL_CHAIN_ID } from "@/lib/wagmi";
import { useSendTx } from "@/lib/tx";
import { TxNotice } from "./TxNotice";

const STEPS = [
  { label: "+10 min", seconds: 600 },
  { label: "+1 hour", seconds: 3_600 },
  { label: "+1 day", seconds: 86_400 },
  { label: "+7 days", seconds: 604_800 },
];

/** Local-chain-only helpers: move Anvil's clock forward and mint mock tokens. */
export function DevTools() {
  const { chainId, deployment } = useAppChain();
  const { isConnected } = useConnection();
  const client = usePublicClient({ chainId });
  const queryClient = useQueryClient();
  const now = useChainNow();
  const faucet = useSendTx();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useMounted();

  if (!mounted || chainId !== LOCAL_CHAIN_ID || !deployment) return null;

  async function advance(seconds: number) {
    if (!client) return;
    setBusy(true);
    setError(undefined);
    try {
      // Anvil-specific RPC methods; not available on public networks.
      await client.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
      await client.request({ method: "evm_mine" as never, params: [] as never });
      await queryClient.invalidateQueries();
    } catch {
      setError("Time travel failed — is Anvil running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl border border-dashed border-moss/60 bg-wash p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-forest">Local dev tools (Anvil)</summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted">
          Chain time: <span className="font-mono text-ink">{now ? new Date(Number(now) * 1000).toLocaleString() : "…"}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button
              key={s.label}
              disabled={busy}
              onClick={() => advance(s.seconds)}
              className="rounded-full bg-mint px-3.5 py-1.5 font-semibold text-forest hover:bg-mint-2 disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
          <button
            disabled={!isConnected || faucet.busy}
            onClick={() =>
              faucet.send("mUSD faucet", { address: deployment.mockToken, abi: mockErc20Abi, functionName: "faucet" })
            }
            className="rounded-full bg-lime px-3.5 py-1.5 font-semibold text-ink hover:brightness-95 disabled:opacity-50"
            title={isConnected ? "" : "Connect a wallet first"}
          >
            Get 10,000 mUSD
          </button>
        </div>
        {error && <p className="text-rust">{error}</p>}
        <TxNotice tx={faucet.current} />
      </div>
    </details>
  );
}
