"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { zeroAddress } from "viem";
import { useConnection } from "wagmi";
import { parseCampaignId } from "../manage";
import { Gate } from "@/app/dashboard/shell";
import { ImageField } from "@/components/ImageField";
import { TxNotice } from "@/components/TxNotice";
import { Button, Card, LinkButton } from "@/components/ui";
import { openRaiseAbi } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { CATEGORIES, formatAmount, Status } from "@/lib/format";
import { useAppChain, useAssetMeta, useCampaign, type CampaignView } from "@/lib/hooks";
import { useSendTx } from "@/lib/tx";
import { useMounted } from "@/lib/useMounted";

const MAX_TITLE = 80;
const MAX_DESC = 1000;
const MAX_NAME = 48;
const bytes = (s: string) => new TextEncoder().encode(s).length;
const field =
  "w-full rounded-xl border border-[#C9D2CE] bg-paper px-3.5 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-mint";

export function EditCampaign() {
  const id = parseCampaignId(useParams<{ id: string }>().id);
  const { address } = useConnection();
  const mounted = useMounted();
  const { data: c, error, isPending } = useCampaign(id ?? 0n);

  if (id === null || error) return <Gate title="Campaign not found">{error ? describeError(error) : "Check the link."}</Gate>;
  if (isPending || !c || !mounted) return <p className="text-muted">Loading campaign…</p>;
  if (address?.toLowerCase() !== c.owner.toLowerCase()) {
    return <Gate title="Not your campaign">Only the campaign owner can edit it.</Gate>;
  }
  if (c.status !== Status.Active) {
    return (
      <Gate title="This campaign can no longer be edited">
        Details are locked once a campaign ends or is cancelled. <Link href={`/dashboard/campaigns/${c.id}`}>Back to campaign</Link>.
      </Gate>
    );
  }
  // Keyed so the form's initial state comes from the loaded campaign without syncing state in an effect.
  return <EditForm key={c.id.toString()} c={c} />;
}

function EditForm({ c }: { c: CampaignView }) {
  // Unique per instance: Next keeps visited pages mounted (hidden), so fixed ids would collide across pages.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const router = useRouter();
  const { deployment } = useAppChain();
  const meta = useAssetMeta(c.asset);
  const tx = useSendTx();
  const [title, setTitle] = useState(c.title);
  const [creatorName, setCreatorName] = useState(c.creatorName);
  const [category, setCategory] = useState(c.category);
  const [description, setDescription] = useState(c.description);
  const [imageURI, setImageURI] = useState(c.imageURI);
  const [touched, setTouched] = useState(false);

  const categories = (CATEGORIES as readonly string[]).includes(c.category) ? CATEGORIES : [c.category, ...CATEGORIES];
  const checks = {
    title: bytes(title.trim()) > 0 && bytes(title.trim()) <= MAX_TITLE,
    name: bytes(creatorName.trim()) > 0 && bytes(creatorName.trim()) <= MAX_NAME,
    description: bytes(description) <= MAX_DESC,
  };
  const valid = checks.title && checks.name && checks.description;
  const changed =
    title.trim() !== c.title ||
    creatorName.trim() !== c.creatorName ||
    category !== c.category ||
    description !== c.description ||
    imageURI !== c.imageURI;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (!valid || !changed || !deployment) return;
    const receipt = await tx.send("Save campaign details", {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "updateCampaign",
      args: [c.id, { title: title.trim(), description, creatorName: creatorName.trim(), category, imageURI }],
    });
    if (receipt) router.push(`/dashboard/campaigns/${c.id}`);
  }

  const err = (ok: boolean, msg: string) => touched && !ok && <p role="alert" className="mt-1.5 text-[13px] text-rust">{msg}</p>;
  const fmt = (v: bigint) => (meta ? `${formatAmount(v, meta.decimals)} ${meta.symbol}` : "…");

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/campaigns/${c.id}`} className="text-sm font-medium text-muted no-underline hover:text-ink">
        ← Back to campaign
      </Link>
      <div>
        <h1 className="font-display text-[30px] font-black tracking-[-0.01em] sm:text-[36px]">Edit campaign</h1>
        <p className="mt-1 max-w-[640px] text-muted">
          Changes are saved onchain and appear in the activity log as an edit, so backers can see the campaign was updated.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <form onSubmit={submit} noValidate className="min-w-0 flex-[999_1_480px] space-y-5">
          <fieldset className="flex min-w-0 flex-col gap-[18px] rounded-[20px] border border-line bg-paper p-6">
            <legend className="px-1.5 font-display text-base font-bold">Details you can edit</legend>
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
                {categories.map((cat) => (
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
              <div className="mb-1.5 text-sm font-semibold">Cover image</div>
              <ImageField value={imageURI} onChange={setImageURI} seed={`${c.id}-${category}`} locked={c.imageLocked} />
            </div>
            <div>
              <label htmlFor={fid("description")} className="mb-1.5 block text-sm font-semibold">Description</label>
              <textarea id={fid("description")} rows={6} className={`${field} resize-y py-3 text-[15px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="mt-1 text-xs text-muted">{bytes(description)} / {MAX_DESC} bytes · shown to backers as plain text.</div>
              {err(checks.description, `Max ${MAX_DESC} bytes.`)}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LinkButton href={`/dashboard/campaigns/${c.id}`} variant="outline">Discard</LinkButton>
            <Button type="submit" size="lg" disabled={tx.busy || !changed || (touched && !valid)}>
              {tx.busy ? "Saving…" : changed ? "Save changes" : "No changes"}
            </Button>
          </div>
          <TxNotice tx={tx.current} onRetry={() => submit()} />
        </form>

        <aside className="min-w-0 flex-[1_1_300px]">
          <Card className="space-y-3 p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Locked terms
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Goal</dt>
                <dd className="font-mono font-semibold">{fmt(c.goal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Deadline</dt>
                <dd className="text-right font-mono font-semibold">{new Date(Number(c.deadline) * 1000).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Asset</dt>
                <dd className="font-mono font-semibold">{c.asset === zeroAddress ? "ETH" : meta?.symbol}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">
              Backers contributed under these terms, so the contract never lets them change. To stop the campaign instead, cancel it
              from the campaign page — every backer is refunded in full.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
