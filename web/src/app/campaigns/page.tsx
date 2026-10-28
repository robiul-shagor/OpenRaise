import { Suspense } from "react";
import { Explore } from "./explore";

export default function CampaignsPage() {
  return (
    <Suspense>
      <Explore />
    </Suspense>
  );
}
