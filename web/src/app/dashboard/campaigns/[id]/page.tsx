import { Suspense } from "react";
import { ManageCampaign } from "./manage";

export default function ManageCampaignPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading campaign…</p>}>
      <ManageCampaign />
    </Suspense>
  );
}
