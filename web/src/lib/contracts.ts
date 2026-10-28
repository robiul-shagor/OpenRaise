import { type Address, zeroAddress } from "viem";
import { deployments } from "@/generated/contracts";

export { openRaiseAbi, mockErc20Abi } from "@/generated/contracts";

export type Deployment = { openRaise: Address; mockToken: Address; startBlock: bigint };

/** Addresses for a chain: env overrides (for a public testnet) take priority over synced deployments. */
export function getDeployment(chainId: number | undefined): Deployment | undefined {
  if (chainId === undefined || chainId === 1) return undefined;
  const envChain = Number(process.env.NEXT_PUBLIC_TESTNET_CHAIN_ID);
  if (chainId === envChain && process.env.NEXT_PUBLIC_TESTNET_OPENRAISE && process.env.NEXT_PUBLIC_TESTNET_TOKEN) {
    return {
      openRaise: process.env.NEXT_PUBLIC_TESTNET_OPENRAISE as Address,
      mockToken: process.env.NEXT_PUBLIC_TESTNET_TOKEN as Address,
      startBlock: BigInt(process.env.NEXT_PUBLIC_TESTNET_START_BLOCK ?? "0"),
    };
  }
  const d = deployments[chainId];
  return d ? { openRaise: d.openRaise, mockToken: d.mockToken, startBlock: BigInt(d.startBlock) } : undefined;
}

export const NATIVE = zeroAddress;
