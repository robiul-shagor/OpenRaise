import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Status, STATUS_LABEL } from "@/lib/format";

export const STATUS_TONE: Record<Status, { fg: string; bg: string; bar: string }> = {
  [Status.Active]: { fg: "text-sky", bg: "bg-sky-bg", bar: "bg-grow" },
  [Status.Successful]: { fg: "text-forest", bg: "bg-mint-2", bar: "bg-grow" },
  [Status.Failed]: { fg: "text-rust", bg: "bg-rust-bg", bar: "bg-rust" },
  [Status.Withdrawn]: { fg: "text-ink", bg: "bg-mint-3", bar: "bg-forest" },
  [Status.Cancelled]: { fg: "text-ink-2", bg: "bg-[#EEEAE4]", bar: "bg-faint" },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const t = STATUS_TONE[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${t.bg} ${t.fg}`}>
      {label ??
        (status === Status.Failed
          ? "Failed · refunds open"
          : status === Status.Cancelled
            ? "Cancelled · refunds open"
            : STATUS_LABEL[status])}
    </span>
  );
}

export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-lime px-2.5 py-1 text-[11px] font-semibold text-ink ${className}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ bps, status, thick = false }: { bps: number; status: Status; thick?: boolean }) {
  const width = Math.min(100, bps / 100);
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-mint-3 ${thick ? "h-2" : "h-1.5"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${STATUS_TONE[status].bar}`} style={{ width: `${width}%` }} />
    </div>
  );
}

type Variant = "primary" | "soft" | "outline" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-forest text-white hover:bg-forest-deep",
  soft: "bg-mint text-forest hover:bg-mint-2",
  outline: "border border-line bg-paper text-ink hover:bg-wash",
  danger: "bg-rust text-white hover:brightness-110",
};

const pill = (variant: Variant, size: "md" | "lg") =>
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "lg" ? "h-[50px] px-6 text-[15px]" : "h-11 px-5 text-sm"
  } ${VARIANT[variant]}`;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg" };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`${pill(variant, size)} ${className}`} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> &
  AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: "md" | "lg" };

export function LinkButton({ variant = "primary", size = "md", className = "", ...props }: LinkButtonProps) {
  return <Link className={`${pill(variant, size)} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line bg-paper p-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink">{children}</span>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-wash p-3.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-mono text-[13px] font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
