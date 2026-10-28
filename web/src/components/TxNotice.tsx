"use client";

import { explorerTxUrl, shortAddress } from "@/lib/format";
import type { TxEntry } from "@/lib/tx";

const PHASE_TEXT: Record<TxEntry["phase"], string> = {
  simulating: "Checking transaction…",
  signing: "Confirm in your wallet…",
  pending: "Pending — waiting for confirmation…",
  success: "Confirmed",
  reverted: "Reverted",
  error: "Failed",
};

export function TxNotice({ tx, onRetry }: { tx: TxEntry | null; onRetry?: () => void }) {
  if (!tx) return null;
  const failed = tx.phase === "error" || tx.phase === "reverted";
  const done = tx.phase === "success";
  const tone = failed ? "bg-rust-bg text-rust" : done ? "bg-mint-2 text-forest" : "bg-sky-bg text-sky";
  const url = tx.hash ? explorerTxUrl(tx.chainId, tx.hash) : undefined;
  return (
    <div className={`mt-3 rounded-xl p-3 text-sm ${tone}`} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {!failed && !done && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        <span className="font-semibold">
          {tx.label}: {PHASE_TEXT[tx.phase]}
        </span>
      </div>
      {tx.error && <p className="mt-1">{tx.error}</p>}
      {tx.hash && (
        <p className="mt-1 font-mono text-xs opacity-80">
          tx{" "}
          {url ? (
            <a className="underline" href={url} target="_blank" rel="noreferrer noopener">{shortAddress(tx.hash)}</a>
          ) : (
            <span title={tx.hash}>{shortAddress(tx.hash)}</span>
          )}
        </p>
      )}
      {failed && onRetry && (
        <button type="button" className="mt-2 text-xs font-semibold underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
