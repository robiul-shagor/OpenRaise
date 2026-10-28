import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import { injected, mock } from "wagmi/connectors";

const localRpc = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

const localChain = {
  ...foundry,
  rpcUrls: { default: { http: [localRpc] } },
} as const;

/** Anvil's default dev accounts #0-#2 (derived from the public "test … junk" mnemonic). */
export const ANVIL_DEV_ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
] as const;

// The dev wallet sends unsigned eth_sendTransaction to Anvil, which signs with its unlocked accounts.
// It only works against a local Anvil node and is disabled by NEXT_PUBLIC_ENABLE_DEV_WALLET=false.
const devWalletEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_WALLET !== "false";

const DEV_ROLES = ["owner", "backer A", "backer B"] as const;

function devAccount(index: number): CreateConnectorFn {
  const base = mock({ accounts: [ANVIL_DEV_ACCOUNTS[index]], features: { reconnect: true } });
  const id = `anvil-dev-${index}`;
  return (cfg) => ({
    ...base(cfg),
    id,
    name: `Anvil #${index} (${DEV_ROLES[index]})`,
    // The mock connector only remembers its connection in memory; restore it from wagmi storage on reload.
    isAuthorized: async () => (await cfg.storage?.getItem("recentConnectorId")) === id,
  });
}

export const config = createConfig({
  chains: [localChain, sepolia],
  connectors: [
    injected(),
    ...(devWalletEnabled ? ANVIL_DEV_ACCOUNTS.map((_, i) => devAccount(i)) : []),
  ],
  transports: {
    [localChain.id]: http(localRpc),
    [sepolia.id]: http(sepoliaRpc),
  },
  ssr: true,
});

export const LOCAL_CHAIN_ID = localChain.id;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
