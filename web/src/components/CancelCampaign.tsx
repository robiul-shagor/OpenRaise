"use client";

import { useState } from "react";
import { openRaiseAbi } from "@/lib/contracts";
import { useAppChain } from "@/lib/hooks";
import { useSendTx } from "@/lib/tx";
import { TxNotice } from "./TxNotice";
import { Button } from "./ui";

/**
 * Two-step cancel: explain consequences, then confirm. Cancelling is irreversible onchain:
 * contributions stop, backers can refund in full, nothing can ever be withdrawn.
 */
export function CancelCampaign({
  id,
  backers,
  asAdmin = false,
  compact = false,
}: {
  id: bigint;
  backers: number;
  asAdmin?: boolean;
  compact?: boolean;
}) {
  const { deployment } = useAppChain();
  const tx = useSendTx();
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    if (!deployment) return;
    const ok = await tx.send(asAdmin ? `Admin cancel #${id}` : "Cancel campaign", {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "cancelCampaign",
      args: [id],
    });
    if (ok) setConfirming(false);
  };

  if (!confirming) {
    return (
      <>
        <Button variant="outline" className={`text-rust ${compact ? "h-9 px-3.5 text-[13px]" : ""}`} onClick={() => setConfirming(true)}>
          {asAdmin ? "Cancel" : "Cancel campaign"}
        </Button>
        <TxNotice tx={tx.current?.phase === "success" ? null : tx.current} onRetry={run} />
      </>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby={`cancel-h-${id}`} className="rounded-2xl border-2 border-rust/40 bg-rust-bg p-4 text-sm text-ink">
      <h3 id={`cancel-h-${id}`} className="font-display text-base font-bold text-rust">
        Cancel campaign #{id.toString()}?
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
        <li>No one can contribute after this. This cannot be undone.</li>
        <li>
          {backers > 0
            ? `All ${backers} ${backers === 1 ? "backer" : "backers"} can reclaim their full contribution.`
            : "There are no backers, so nothing needs refunding."}
        </li>
        <li>Nothing can be withdrawn — not by the owner, not by the admin.</li>
        <li>It disappears from the homepage, and shows as Cancelled elsewhere.</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" onClick={run} disabled={tx.busy}>
          {tx.busy ? "Cancelling…" : "Yes, cancel campaign"}
        </Button>
        <Button variant="outline" onClick={() => setConfirming(false)} disabled={tx.busy}>
          Keep it running
        </Button>
      </div>
      <TxNotice tx={tx.current} onRetry={run} />
    </div>
  );
}
