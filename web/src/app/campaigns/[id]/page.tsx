import { Suspense } from "react";
import { CampaignDetail } from "./campaign-detail";

export default function CampaignPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-[1240px] px-6 py-16 text-muted">Loading campaign…</p>}>
      <CampaignDetail />
    </Suspense>
  );
}
