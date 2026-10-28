"use client";

import { useMounted } from "@/lib/useMounted";
import { useConnection, useSwitchChain } from "wagmi";
import { getDeployment } from "@/lib/contracts";
import { useAppChain, useIsDeployed } from "@/lib/hooks";
import { LOCAL_CHAIN_ID } from "@/lib/wagmi";
import { describeError } from "@/lib/errors";
import { Button } from "./ui";

/**
 * Warns when the wallet is on a chain without an OpenRaise deployment (and offers a switch), or when the
 * configured contract has no code on the chain — typically a restarted Anvil that needs `make deploy seed`.
 */
export function NetworkGuard() {
  const { isConnected, chainId } = useConnection();
  const { chainId: appChainId } = useAppChain();
  const deployed = useIsDeployed();
  const switchChain = useSwitchChain();
  const mounted = useMounted();

  if (!mounted) return null;
  if (deployed === false) {
    return (
      <div className="border-b border-rust/20 bg-rust-bg" role="alert">
        <div className="mx-auto max-w-[1240px] px-4 py-2.5 text-sm text-rust sm:px-6">
          <strong>OpenRaise isn&apos;t deployed on this chain ({appChainId}).</strong>{" "}
          {appChainId === LOCAL_CHAIN_ID ? (
            <>
              Anvil keeps everything in memory, so a restart wipes the contracts. Run <code className="font-mono">make deploy seed</code>{" "}
              (or <code className="font-mono">make up</code>) and refresh.
            </>
          ) : (
            "Check the contract addresses in your environment."
          )}
        </div>
      </div>
    );
  }
  if (!isConnected || getDeployment(chainId)) return null;
  return (
    <div className="border-b border-rust/20 bg-rust-bg">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-2.5 text-sm text-rust sm:px-6">
        <span>
          Your wallet is on chain {chainId ?? "unknown"}, which has no OpenRaise deployment.
          {chainId === 1 && " Mainnet is never supported."}
        </span>
        <Button variant="outline" onClick={() => switchChain.mutate({ chainId: LOCAL_CHAIN_ID })} disabled={switchChain.isPending}>
          Switch to Anvil (31337)
        </Button>
        {switchChain.error && <span className="font-semibold">{describeError(switchChain.error)}</span>}
      </div>
    </div>
  );
}
