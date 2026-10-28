"use client";

import { useState } from "react";
import { useReadContracts } from "wagmi";
import { AdminOnly, TokenAllowlist } from "../admin";
import { Card } from "@/components/ui";
import { openRaiseAbi } from "@/lib/contracts";
import { useAppChain, useAssetMeta } from "@/lib/hooks";
import { LOCAL_CHAIN_ID } from "@/lib/wagmi";

const LIMITS = [
  ["MIN_DURATION", "Min duration", "s"],
  ["MAX_DURATION", "Max duration", "s"],
  ["MAX_TITLE_BYTES", "Title", "bytes"],
  ["MAX_DESCRIPTION_BYTES", "Description", "bytes"],
  ["MAX_CREATOR_NAME_BYTES", "Team name", "bytes"],
  ["MAX_CATEGORY_BYTES", "Category", "bytes"],
  ["MAX_IMAGE_URI_BYTES", "Image link", "bytes"],
] as const;

const PERMISSIONS: [string, string, string][] = [
  ["createCampaign", "Anyone", "—"],
  ["contribute", "Anyone", "Active"],
  ["updateCampaign", "Campaign owner", "Active"],
  ["updateImage", "Campaign owner", "Any status (unless image locked)"],
  ["cancelCampaign", "Campaign owner or admin", "Active"],
  ["withdraw", "Campaign owner", "Successful, once"],
  ["refund", "Each backer", "Failed or Cancelled, once"],
  ["setHidden / setImageLocked", "Admin", "Any status — display only"],
  ["setAssetAllowed", "Admin", "New campaigns only"],
];

export function AdminContracts() {
  return (
    <AdminOnly>
      <Contracts />
    </AdminOnly>
  );
}

function Contracts() {
  const { chainId, deployment } = useAppChain();
  const token = useAssetMeta(deployment?.mockToken);
  const base = { chainId, address: deployment?.openRaise, abi: openRaiseAbi } as const;
  const { data } = useReadContracts({
    contracts: [
      { ...base, functionName: "owner" },
      { ...base, functionName: "campaignCount" },
      ...LIMITS.map(([fn]) => ({ ...base, functionName: fn })),
    ],
    query: { enabled: Boolean(deployment) },
  });
  const owner = data?.[0]?.result as string | undefined;
  const count = data?.[1]?.result as bigint | undefined;
  const limit = (i: number) => data?.[2 + i]?.result as bigint | undefined;
  const fmtLimit = (v: bigint | undefined, unit: string) =>
    v === undefined ? "…" : unit === "s" ? humanDuration(Number(v)) : `${v.toString()} ${unit}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[30px] font-black tracking-[-0.01em] sm:text-[36px]">Contracts</h1>
        <p className="mt-1 max-w-[680px] text-muted">
          What&apos;s deployed, who controls it, and the rules it enforces — read live from the chain.
        </p>
      </div>

      <Card className="space-y-3 p-6">
        <h2 className="font-display text-lg font-bold">Deployment</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Addr label="OpenRaise registry" value={deployment?.openRaise} />
          <Addr label="Registry admin (owner)" value={owner} />
          <Addr label={`Mock token${token ? ` (${token.symbol}, ${token.decimals} decimals)` : ""}`} value={deployment?.mockToken} />
          <Field label="Network" value={`${chainId === LOCAL_CHAIN_ID ? "Anvil (local)" : `Chain`} · ${chainId}`} />
          <Field label="Deploy block (indexer start)" value={deployment ? `#${deployment.startBlock}` : "—"} />
          <Field label="Campaigns created" value={count !== undefined ? count.toString() : "…"} />
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Limits enforced onchain</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {LIMITS.map(([fn, label, unit], i) => (
            <div key={fn} className="flex justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-muted">
                {label} <code className="font-mono text-xs">{fn}</code>
              </dt>
              <dd className="font-mono font-semibold">{fmtLimit(limit(i), unit)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Who can call what</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Function</th>
                <th className="px-4 py-2.5 font-semibold">Caller</th>
                <th className="px-4 py-2.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(([fn, who, when]) => (
                <tr key={fn} className="border-t border-line">
                  <td className="px-4 py-2.5 font-mono">{fn}</td>
                  <td className="px-4 py-2.5">{who}</td>
                  <td className="px-4 py-2.5 text-muted">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Funds leave the contract only through withdraw() and refund(). No function lets the admin move them.</p>
      </Card>

      <TokenAllowlist />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-wash p-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-[13px] font-semibold">{value}</dd>
    </div>
  );
}

function Addr({ label, value }: { label: string; value: string | undefined }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl bg-wash p-3.5">
      <dt className="flex items-center justify-between gap-2 text-xs text-muted">
        {label}
        {value && (
          <button
            type="button"
            className="font-semibold text-forest underline"
            onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {})}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </dt>
      <dd className="mt-0.5 break-all font-mono text-[13px] font-semibold">{value ?? "…"}</dd>
    </div>
  );
}

function humanDuration(s: number): string {
  if (s % 86_400 === 0) return `${s / 86_400} days`;
  if (s % 3_600 === 0) return `${s / 3_600} hours`;
  if (s % 60 === 0) return `${s / 60} minute${s === 60 ? "" : "s"}`;
  return `${s} s`;
}
