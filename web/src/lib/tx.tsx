"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi, ContractFunctionArgs, ContractFunctionName, Hex, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";
import {
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
  type SimulateContractParameters,
} from "wagmi/actions";
import type { config as appConfig } from "./wagmi";
import { describeError } from "./errors";

export type TxPhase = "simulating" | "signing" | "pending" | "success" | "reverted" | "error";

export type TxEntry = {
  id: string;
  label: string;
  chainId: number;
  phase: TxPhase;
  hash?: Hex;
  error?: string;
  createdAt: number;
};

type TxContextValue = {
  entries: TxEntry[];
  upsert: (entry: TxEntry) => void;
  dismiss: (id: string) => void;
};

const STORAGE_KEY = "openraise:txs";
const TxContext = createContext<TxContextValue | null>(null);

function load(): TxEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TxEntry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: TxEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 10)));
  } catch {
    // storage unavailable: transactions still work, they just won't be resumed after refresh
  }
}

/** Tracks transactions and persists pending hashes so receipts are still awaited after a refresh. */
export function TxProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<TxEntry[]>([]);
  const resumed = useRef(false);

  const upsert = useCallback((entry: TxEntry) => {
    setEntries((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)];
      save(next);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      save(next);
      return next;
    });
  }, []);

  // Resume waiting on transactions that were pending when the page was closed or refreshed.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const stored = load();
    // Pre-broadcast phases can't be resumed: the wallet prompt is gone.
    const restored = stored.map((e) =>
      e.phase === "simulating" || e.phase === "signing"
        ? { ...e, phase: "error" as const, error: "Interrupted before broadcast. Try again." }
        : e,
    );
    setEntries(restored);
    for (const e of restored) {
      if (e.phase !== "pending" || !e.hash) continue;
      waitForTransactionReceipt(config, { hash: e.hash, chainId: e.chainId as never })
        .then((r) => upsert({ ...e, phase: r.status === "success" ? "success" : "reverted" }))
        .catch((err) => upsert({ ...e, phase: "error", error: describeError(err) }))
        .finally(() => queryClient.invalidateQueries());
    }
  }, [config, queryClient, upsert]);

  const value = useMemo(() => ({ entries, upsert, dismiss }), [entries, upsert, dismiss]);
  return <TxContext.Provider value={value}>{children}</TxContext.Provider>;
}

export function useTxEntries() {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTxEntries must be used inside TxProvider");
  return ctx;
}

type Mutability = "nonpayable" | "payable";

/**
 * Simulate → sign → wait for receipt, with each phase surfaced to the UI.
 * Simulation catches most reverts with a readable reason before the wallet prompt.
 */
export function useSendTx() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const { upsert } = useTxEntries();
  const [current, setCurrent] = useState<TxEntry | null>(null);

  const send = useCallback(
    async <
      const abi extends Abi | readonly unknown[],
      functionName extends ContractFunctionName<abi, Mutability>,
      args extends ContractFunctionArgs<abi, Mutability, functionName>,
    >(
      label: string,
      params: SimulateContractParameters<abi, functionName, args, typeof appConfig>,
    ): Promise<TransactionReceipt | null> => {
      const chainId = (params.chainId ?? config.state.chainId) as number;
      let entry: TxEntry = { id: crypto.randomUUID(), label, chainId, phase: "simulating", createdAt: Date.now() };
      const update = (patch: Partial<TxEntry>) => {
        entry = { ...entry, ...patch };
        setCurrent(entry);
        upsert(entry);
      };
      update({});
      try {
        const { request } = await simulateContract(config, params as never);
        update({ phase: "signing" });
        const hash = await writeContract(config, request as never);
        update({ phase: "pending", hash });
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: chainId as never });
        update(
          receipt.status === "success"
            ? { phase: "success" }
            : { phase: "reverted", error: "Transaction reverted onchain." },
        );
        return receipt.status === "success" ? receipt : null;
      } catch (err) {
        update({ phase: "error", error: describeError(err) });
        return null;
      } finally {
        await queryClient.invalidateQueries();
      }
    },
    [config, queryClient, upsert],
  );

  const busy = current?.phase === "simulating" || current?.phase === "signing" || current?.phase === "pending";
  return { send, current, busy, reset: () => setCurrent(null) };
}
