"use client";

import { useSearchParams } from "next/navigation";
import { AdminOnly } from "../admin";
import { Dashboard, type TypeFilter } from "@/app/activity/dashboard";

/** Admin ops view ("Backend — contributions & indexer" board). `?type=payouts` opens on refunds & withdrawals. */
export function AdminContributions() {
  const type: TypeFilter = useSearchParams().get("type") === "payouts" ? "payouts" : "all";
  return (
    <AdminOnly>
      {/* Keyed so switching between sidebar presets resets the filter even though Next keeps the page mounted. */}
      <Dashboard key={type} variant="admin" initialType={type} />
    </AdminOnly>
  );
}
