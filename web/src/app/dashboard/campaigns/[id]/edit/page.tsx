import { Suspense } from "react";
import { EditCampaign } from "./edit-form";

export const metadata = { title: "Edit campaign — OpenRaise" };

export default function EditCampaignPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading campaign…</p>}>
      <EditCampaign />
    </Suspense>
  );
}
