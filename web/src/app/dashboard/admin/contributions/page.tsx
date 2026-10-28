import { Suspense } from "react";
import { AdminContributions } from "./contributions";

export const metadata = { title: "Contributions — OpenRaise admin" };

export default function AdminContributionsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <AdminContributions />
    </Suspense>
  );
}
