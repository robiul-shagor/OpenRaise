"use client";

import { useState } from "react";
import { openRaiseAbi } from "@/lib/contracts";
import { useAppChain, type CampaignView } from "@/lib/hooks";
import { useSendTx } from "@/lib/tx";
import { ImageField } from "./ImageField";
import { TxNotice } from "./TxNotice";
import { Button, Card } from "./ui";

/**
 * Owner-only image editor for campaigns that are no longer Active. Uses `updateImage`, which changes the image
 * and nothing else — text and terms stay frozen after the campaign ends.
 */
export function ImageCard({ c, anchorId }: { c: CampaignView; anchorId: string }) {
  const { deployment } = useAppChain();
  const tx = useSendTx();
  const [value, setValue] = useState(c.imageURI);
  const changed = value !== c.imageURI;

  const save = () =>
    deployment &&
    tx.send(value ? "Save cover image" : "Remove cover image", {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "updateImage",
      args: [c.id, value],
    });

  return (
    <Card className="scroll-mt-6 space-y-4 p-6">
      <div id={anchorId} className="scroll-mt-6">
        <h2 className="font-display text-lg font-bold">Cover image</h2>
        <p className="mt-1 text-sm text-muted">
          This campaign has ended, so its title, story and terms are frozen — but you can still change the cover image.
        </p>
      </div>
      <ImageField value={value} onChange={setValue} seed={`${c.id}-${c.category}`} locked={c.imageLocked} />
      {!c.imageLocked && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {changed && (
            <Button variant="outline" onClick={() => setValue(c.imageURI)} disabled={tx.busy}>
              Discard
            </Button>
          )}
          <Button onClick={save} disabled={!changed || tx.busy}>
            {tx.busy ? "Saving…" : changed ? "Save image" : "No changes"}
          </Button>
        </div>
      )}
      <TxNotice tx={tx.current} onRetry={save} />
    </Card>
  );
}
