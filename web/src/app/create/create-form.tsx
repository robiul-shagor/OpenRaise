"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseEventLogs, zeroAddress } from "viem";
import { useConnection, usePublicClient } from "wagmi";
import { Avatar, Cover } from "@/components/Cover";
import { ImageField } from "@/components/ImageField";
import { TxNotice } from "@/components/TxNotice";
import { Button, ProgressBar, StatusBadge, Tag } from "@/components/ui";
import { openRaiseAbi } from "@/lib/contracts";
import { CATEGORIES, ETH_META, parseAmount, shortAddress, Status } from "@/lib/format";
import { useAppChain, useAssetMeta, useCampaigns, useChainNow } from "@/lib/hooks";
import { useSendTx } from "@/lib/tx";
import { useMounted } from "@/lib/useMounted";

// Short presets exist so the success/failure paths can be demoed locally; the contract allows 1 minute to 365 days.
const DURATIONS = [
  { label: "10 minutes (demo)", secs: 600 },
  { label: "1 hour", secs: 3_600 },
  { label: "1 day", secs: 86_400 },
  { label: "7 days", secs: 7 * 86_400 },
  { label: "14 days", secs: 14 * 86_400 },
  { label: "30 days", secs: 30 * 86_400 },
  { label: "60 days", secs: 60 * 86_400 },
  { label: "90 days", secs: 90 * 86_400 },
];
const MAX_TITLE = 80;
const MAX_DESC = 1000;
const MAX_NAME = 48;
const bytes = (s: string) => new TextEncoder().encode(s).length;
// Inclusion buffer so the deadline still satisfies MIN_DURATION when the tx is mined.
const DEADLINE_BUFFER = 30n;

const field =
  "w-full rounded-xl border border-[#C9D2CE] bg-paper px-3.5 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-mint";

export function CreateForm() {
  // Unique per instance: Next keeps visited pages mounted (hidden), so fixed ids would collide across pages.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const router = useRouter();
  const mounted = useMounted();
  const { address, isConnected } = useConnection();
  const { deployment, chainId, supported } = useAppChain();
  const client = usePublicClient({ chainId });
  const tokenMeta = useAssetMeta(deployment?.mockToken);
  const { total } = useCampaigns(1);
  const now = useChainNow();
  const tx = useSendTx();

  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [assetKind, setAssetKind] = useState<"eth" | "token">("eth");
  const [goal, setGoal] = useState("");
  const [durationSecs, setDurationSecs] = useState(DURATIONS[0].secs);
  const [touched, setTouched] = useState(false);

  const meta = assetKind === "eth" ? ETH_META : tokenMeta;
  const goalUnits = meta ? parseAmount(goal, meta.decimals) : null;
  const assetAddr = assetKind === "eth" ? zeroAddress : deployment?.mockToken;

  const checks = {
    wallet: mounted && isConnected && supported,
    title: bytes(title.trim()) > 0 && bytes(title.trim()) <= MAX_TITLE,
    name: bytes(creatorName.trim()) > 0 && bytes(creatorName.trim()) <= MAX_NAME,
    description: bytes(description) <= MAX_DESC,
    goal: goalUnits !== null,
  };
  const valid = checks.title && checks.name && checks.description && checks.goal;
  const deadline = now !== undefined ? now + BigInt(durationSecs) + DEADLINE_BUFFER : undefined;

  const params =
    valid && assetAddr && goalUnits !== null && deadline !== undefined
      ? {
          asset: assetAddr,
          goal: goalUnits,
          deadline,
          title: title.trim(),
          description,
          creatorName: creatorName.trim(),
          category,
          imageURI,
        }
      : null;

  const gas = useQuery({
    queryKey: ["createGas", chainId, address, params && { ...params, goal: params.goal.toString(), deadline: undefined }],
    enabled: Boolean(client && deployment && address && params),
    staleTime: 10_000,
    queryFn: () =>
      client!.estimateContractGas({
        address: deployment!.openRaise,
        abi: openRaiseAbi,
        functionName: "createCampaign",
        args: [params!],
        account: address!,
      }),
  });

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (!params || !deployment) return;
    const receipt = await tx.send("Create campaign", {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "createCampaign",
      args: [params],
    });
    if (receipt) {
      const [created] = parseEventLogs({ abi: openRaiseAbi, logs: receipt.logs, eventName: "CampaignCreated" });
      if (created) router.push(`/campaigns/${created.args.id}`);
    }
  }

  const err = (ok: boolean, msg: string) =>
    touched && !ok && <p role="alert" className="mt-1.5 text-[13px] text-rust">{msg}</p>;
  const closes =
    now !== undefined
      ? new Date((Number(now) + durationSecs) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "…";
  const nextId = total !== undefined ? (total + 1n).toString() : "…";

  const callPreview = [
    "createCampaign({",
    `  asset:       ${assetKind === "eth" ? "address(0)          // native ETH" : `${shortAddress(deployment?.mockToken ?? "0x")}  // ${tokenMeta?.symbol ?? "token"}`}`,
    `  goal:        ${goalUnits ?? "—"}${goalUnits !== null ? `  // ${goal} ${meta?.symbol}` : ""}`,
    `  deadline:    ${deadline ?? "—"}  // ≈ ${closes} (chain time)`,
    `  title:       ${JSON.stringify(title.trim() || "")}`,
    `  creatorName: ${JSON.stringify(creatorName.trim() || "")}`,
    `  category:    ${JSON.stringify(category)}`,
    `  imageURI:    ${JSON.stringify(imageURI)}`,
    `  description: ${bytes(description)} bytes, stored onchain`,
    "})",
  ].join("\n");

  return (
    <div className="mt-7 flex flex-wrap items-start gap-7">
      <form onSubmit={submit} noValidate className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <fieldset className="min-w-0 flex flex-col gap-[18px] rounded-[20px] border border-line bg-paper p-6">
          <legend className="px-1.5 font-display text-base font-bold">1 · Story</legend>
          <div>
            <label htmlFor={fid("title")} className="mb-1.5 block text-sm font-semibold">Campaign title</label>
            <input id={fid("title")} className={`${field} h-12`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} />
            <div className="mt-1 text-xs text-muted">{bytes(title)} / {MAX_TITLE} bytes</div>
            {err(checks.title, `Title is required (max ${MAX_TITLE} bytes).`)}
          </div>
          <div>
            <label htmlFor={fid("creator")} className="mb-1.5 block text-sm font-semibold">Team or DAO name</label>
            <input id={fid("creator")} className={`${field} h-12`} value={creatorName} onChange={(e) => setCreatorName(e.target.value)} maxLength={MAX_NAME} />
            {err(checks.name, `Team name is required (max ${MAX_NAME} bytes).`)}
          </div>
          <div>
            <div className="mb-1.5 text-sm font-semibold" id={fid("cat-label")}>Category</div>
            <div role="radiogroup" aria-labelledby={fid("cat-label")} className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="radio"
                  aria-checked={category === cat}
                  onClick={() => setCategory(cat)}
                  className={`h-10 rounded-full px-4 text-sm font-semibold ${category === cat ? "bg-forest text-white" : "border border-line bg-paper text-ink hover:bg-mint-3"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor={fid("description")} className="mb-1.5 block text-sm font-semibold">Description</label>
            <textarea
              id={fid("description")}
              rows={5}
              className={`${field} resize-y py-3 text-[15px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What you'll build, who it's for, and how the funds will be spent."
            />
            <div className="mt-1 text-xs text-muted">
              {bytes(description)} / {MAX_DESC} bytes · stored onchain, public forever, shown to backers as plain text.
            </div>
            {err(checks.description, `Max ${MAX_DESC} bytes.`)}
          </div>
          <div>
            <div className="mb-1.5 text-sm font-semibold">
              Cover image <span className="font-normal text-muted">(optional — you can add or change it later)</span>
            </div>
            <ImageField value={imageURI} onChange={setImageURI} seed={`${nextId}-${category}`} />
          </div>
        </fieldset>

        <fieldset className="min-w-0 flex flex-col gap-[18px] rounded-[20px] border border-line bg-paper p-6">
          <legend className="px-1.5 font-display text-base font-bold">2 · Funding terms</legend>
          <div>
            <div className="mb-1.5 text-sm font-semibold" id={fid("asset-label")}>Accepted asset</div>
            <div role="radiogroup" aria-labelledby={fid("asset-label")} className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ["eth", "ETH", "Native test ETH"],
                  ["token", tokenMeta?.symbol ?? "mUSD", `Mock ERC-20 · ${tokenMeta?.decimals ?? 6} decimals`],
                ] as const
              ).map(([kind, sym, note]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={assetKind === kind}
                  disabled={kind === "token" && !deployment}
                  onClick={() => setAssetKind(kind)}
                  className={`flex min-h-16 flex-col justify-center gap-0.5 rounded-xl bg-paper px-3.5 py-2.5 text-left ${assetKind === kind ? "border-2 border-forest" : "border border-[#C9D2CE]"}`}
                >
                  <span className="font-mono text-base font-semibold">{sym}</span>
                  <span className="text-[13px] text-muted">{note}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fid("goal")} className="mb-1.5 block text-sm font-semibold">Funding goal</label>
              <div className={`flex h-12 items-center gap-2 rounded-xl bg-paper px-3.5 ${touched && !checks.goal ? "border-2 border-rust" : "border border-[#C9D2CE] focus-within:border-forest"}`}>
                <input
                  id={fid("goal")}
                  inputMode="decimal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value.trim())}
                  placeholder="5"
                  className="w-full bg-transparent font-mono text-lg font-semibold outline-none"
                />
                <span className="font-mono text-muted">{meta?.symbol}</span>
              </div>
              {err(checks.goal, `Enter a goal greater than 0 (max ${meta?.decimals ?? 18} decimals).`)}
            </div>
            <div>
              <label htmlFor={fid("duration")} className="mb-1.5 block text-sm font-semibold">Duration</label>
              <select id={fid("duration")} className={`${field} h-12`} value={durationSecs} onChange={(e) => setDurationSecs(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d.secs} value={d.secs}>{d.label}</option>
                ))}
              </select>
              <div className="mt-1 text-xs text-muted">Closes ≈ {closes} (chain time)</div>
            </div>
          </div>
          <div className="flex gap-2.5 rounded-xl bg-wash p-4 text-sm text-ink-2">
            <svg className="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#141A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
            </svg>
            <span>
              <strong>All-or-nothing.</strong> If you reach {goal ? `${goal} ${meta?.symbol ?? ""}` : "your goal"} by the deadline you can withdraw
              once (hitting it exactly counts). If not, every backer can reclaim exactly what they sent — you can&apos;t touch the
              funds.
            </span>
          </div>
        </fieldset>

        <fieldset className="min-w-0 rounded-[20px] border border-line bg-paper p-6">
          <legend className="px-1.5 font-display text-base font-bold">3 · Review transaction</legend>
          <pre className="overflow-x-auto rounded-xl bg-ink p-3.5 font-mono text-[13px] leading-relaxed text-mint-2">{callPreview}</pre>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[13px] text-muted">
              {gas.data ? `Est. gas ~${gas.data.toLocaleString()} · paid in test ETH` : params ? "Estimating gas…" : "Fill in the form to estimate gas"}
            </span>
            <Button type="submit" size="lg" disabled={!mounted || !checks.wallet || tx.busy || (touched && !valid)}>
              {!mounted || isConnected ? (tx.busy ? "Working…" : "Create campaign") : "Connect a wallet to create"}
            </Button>
          </div>
          <TxNotice tx={tx.current} onRetry={() => submit()} />
        </fieldset>
      </form>

      <aside aria-label="Live preview" className="min-w-0 flex-[1_1_340px] lg:sticky lg:top-6">
        <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Preview on Campaigns</div>
        <div className="overflow-hidden rounded-[20px] border border-line bg-paper">
          <Cover seed={`${nextId}-${category}`} image={imageURI} className="h-36">
            <div className="relative flex items-start justify-between p-3.5">
              <span className="rounded-full bg-paper/90 px-2.5 py-1 font-mono text-xs font-semibold">#{nextId}</span>
              <Tag>{category}</Tag>
            </div>
          </Cover>
          <div className="relative flex flex-col gap-3 px-5 pb-5">
            <div className="-mt-5 flex items-end justify-between">
              <Avatar name={creatorName || "Your team"} seed={address ?? "preview"} size={44} />
              <span className="text-xs text-muted">{DURATIONS.find((d) => d.secs === durationSecs)?.label.replace(" (demo)", "")} left</span>
            </div>
            <div><StatusBadge status={Status.Active} /></div>
            <h3 className="break-words font-display text-lg font-bold leading-snug">{title.trim() || "Untitled campaign"}</h3>
            <p className="truncate text-[13px] text-muted">
              by {creatorName.trim() || "Your team"} · <span className="font-mono">{address ? shortAddress(address) : "0x…"}</span>
            </p>
            <ProgressBar bps={0} status={Status.Active} />
            <div className="flex justify-between font-mono text-sm">
              <span className="font-semibold">0 <span className="font-normal text-muted">/ {goal || "0"} {meta?.symbol}</span></span>
              <span className="text-[13px] font-semibold">0%</span>
            </div>
          </div>
        </div>
        <ul className="mt-5 flex flex-col gap-2.5 text-sm text-ink-2">
          <Check ok={checks.wallet}>Wallet connected on a supported chain</Check>
          <Check ok>Duration within contract limits (1 minute – 365 days)</Check>
          <Check ok={checks.title && checks.name}>Title and team name filled in</Check>
          <Check ok={checks.goal}>Goal greater than 0</Check>
        </ul>
      </aside>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className={`font-bold ${ok ? "text-forest" : "text-rust"}`} aria-hidden="true">{ok ? "✓" : "!"}</span>
      <span>
        <span className="sr-only">{ok ? "Done: " : "To do: "}</span>
        {children}
      </span>
    </li>
  );
}
