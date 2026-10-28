"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { TxProvider } from "@/lib/tx";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return new QueryClient();
  browserQueryClient ??= new QueryClient({ defaultOptions: { queries: { staleTime: 2_000 } } });
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={getQueryClient()}>
        <TxProvider>{children}</TxProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
