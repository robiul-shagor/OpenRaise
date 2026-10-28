"use client";

import { useTxEntries } from "@/lib/tx";
import { useMounted } from "@/lib/useMounted";
import { TxNotice } from "./TxNotice";

/** Recent transactions, including ones resumed after a page refresh. */
export function TxToasts() {
  const mounted = useMounted();
  const { entries, dismiss } = useTxEntries();
  if (!mounted || entries.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-30 w-[min(360px,calc(100vw-2rem))] space-y-2">
      {entries.slice(0, 3).map((tx) => (
        <div key={tx.id} className="relative rounded-2xl border border-line bg-paper p-1 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)]">
          <button
            onClick={() => dismiss(tx.id)}
            className="absolute right-3 top-3 z-10 text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="-mt-3">
            <TxNotice tx={tx} />
          </div>
        </div>
      ))}
    </div>
  );
}
