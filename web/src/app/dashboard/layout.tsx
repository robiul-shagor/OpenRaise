import { Suspense } from "react";
import { DashboardShell } from "./shell";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
