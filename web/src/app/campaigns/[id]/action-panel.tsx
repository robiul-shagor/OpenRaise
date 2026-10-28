"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { formatUnits, zeroAddress, type TransactionReceipt } from "viem";
import { useBalance, useConnection } from "wagmi";
import { Button, Card, KV } from "@/components/ui";
import { TxNotice } from "@/components/TxNotice";
import { mockErc20Abi, openRaiseAbi } from "@/lib/contracts";
import { eligibility, formatAmount, parseAmount, shortAddress, Status, type AssetMeta } from "@/lib/format";
import { useAppChain, useEvents, useTokenState, type CampaignView } from "@/lib/hooks";
import { useSendTx, type TxEntry } from "@/lib/tx";
import { useMounted } from "@/lib/useMounted";

type Props = { campaign: CampaignView; meta: AssetMeta | undefined; contribution: bigint };

const fmt = (v: bigint, meta: AssetMeta | undefined) => (meta ? `${formatAmount(v, meta.decimals)} ${meta.symbol}` : "…");

export function ActionPanel({ campaign: c, meta, contribution }: Props) {
  const mounted = useMounted();
  const { address, isConnected } = useConnection();
  const { supported } = useAppChain();
  const { data: events } = useEvents();
  const e = eligibility({ status: c.status, owner: c.owner, account: address, contribution });

  const myRefund = (events ?? []).find(
    (ev) => ev.kind === "Refunded" && ev.campaignId === c.id && ev.actor.toLowerCase() === address?.toLowerCase(),
  );
  const withdrawal = (events ?? []).find((ev) => ev.kind === "Withdrawn" && ev.campaignId === c.id);

  let body: ReactNode;
  if (!mounted) body = null;
  else if (!isConnected)
    body = (
      <Intro title={c.status === Status.Active ? "Back this campaign" : "Connect to continue"}>
        Connect a wallet to contribute, withdraw, or claim a refund.
      </Intro>
    );
  else if (!supported) body = <p className="text-sm text-rust">Switch to a supported network first.</p>;
  else if (e.kind === "contribute") body = <ContributeForm c={c} meta={meta} />;
  else if (e.kind === "withdraw") body = <WithdrawAction c={c} meta={meta} />;
  else if (e.kind === "refund") body = <RefundAction c={c} meta={meta} amount={e.amount} />;
  else if (myRefund)
    body = (
      <Done title={`${fmt(myRefund.amount ?? 0n, meta)} refunded`} block={myRefund.blockNumber}>
        <KV rows={[["Returned to", `${shortAddress(myRefund.actor)} (you)`], ["Event", "Refunded"], ["Your balance in campaign", fmt(0n, meta)]]} />
        <Button variant="outline" disabled className="w-full rounded-xl">Already refunded</Button>
        <p className="text-sm text-muted" data-testid="eligibility">{e.kind === "none" ? e.reason : ""}</p>
      </Done>
    );
  else if (withdrawal && c.status === Status.Withdrawn)
    body = (
      <Done title={`${fmt(withdrawal.amount ?? 0n, meta)} withdrawn`} block={withdrawal.blockNumber}>
        <KV rows={[["Sent to", shortAddress(withdrawal.actor)], ["Event", "Withdrawn"], ["Left in campaign", fmt(0n, meta)]]} />
        <Button variant="outline" disabled className="w-full rounded-xl">Already withdrawn</Button>
        <p className="text-sm text-muted" data-testid="eligibility">{e.kind === "none" ? e.reason : ""}</p>
      </Done>
    );
  else
    body = (
      <Intro
        title={
          c.status === Status.Successful
            ? "Goal reached"
            : c.status === Status.Failed
              ? "Goal missed"
              : c.status === Status.Cancelled
                ? "Campaign cancelled"
                : "Campaign closed"
        }
      >
        <span data-testid="eligibility">{e.kind === "none" ? e.reason : ""}</span>
      </Intro>
    );

  return <Card className="space-y-4 p-6">{body}</Card>;
}

function Intro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

function Spinner() {
  return <span className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-[3px] border-sky border-t-transparent" />;
}

function Check() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest text-white">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}

function Done({ title, block, children }: { title: string; block?: bigint; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Check />
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {block !== undefined && <p className="text-sm text-muted">Confirmed in block #{block.toString()}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Wallet-confirm and pending steps shared by every action, shown in place of the form while a tx is in flight. */
function InFlight({ tx, call, to, value }: { tx: TxEntry; call: string; to: string; value: string }) {
  if (tx.phase === "simulating" || tx.phase === "signing") {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Spinner />
          <div>
            <h2 className="font-display text-xl font-bold">{tx.phase === "simulating" ? "Checking transaction" : "Confirm in your wallet"}</h2>
            <p className="text-sm text-muted">Step 1 of 2 · {tx.phase === "simulating" ? "simulating against the chain" : "waiting for signature"}</p>
          </div>
        </div>
        <KV rows={[["call", call], ["to", to], ["value", value], ["chain", `${tx.chainId === 31337 ? "Anvil" : "Chain"} · ${tx.chainId}`]]} />
        <p className="text-xs text-muted">Check the contract address matches the Contract tab before signing.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Spinner />
        <div>
          <h2 className="font-display text-xl font-bold">Transaction pending</h2>
          <p className="text-sm text-muted">Step 2 of 2 · waiting for 1 confirmation</p>
        </div>
      </div>
      <div className="rounded-xl bg-wash p-3.5">
        <div className="text-xs text-muted">tx hash</div>
        <div className="break-all font-mono text-xs">{tx.hash}</div>
      </div>
      <p className="text-xs text-muted">Safe to refresh — we&apos;ll pick this transaction back up from its hash.</p>
    </div>
  );
}

const inFlight = (tx: TxEntry | null): boolean =>
  tx !== null && (tx.phase === "simulating" || tx.phase === "signing" || tx.phase === "pending");

function ContributeForm({ c, meta }: { c: CampaignView; meta: AssetMeta | undefined }) {
  // Unique per instance: Next keeps visited pages mounted (hidden), so fixed ids would collide across pages.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const { deployment, chainId } = useAppChain();
  const { address } = useConnection();
  const isEth = c.asset === zeroAddress;
  const { data: ethBal } = useBalance({ address, chainId, query: { enabled: isEth } });
  const { data: tokenState } = useTokenState(isEth ? undefined : c.asset, deployment?.openRaise);
  const tokenBal = tokenState?.[0]?.result;
  const allowance = tokenState?.[1]?.result ?? 0n;
  const approveTx = useSendTx();
  const contributeTx = useSendTx();
  const [input, setInput] = useState("");
  const [done, setDone] = useState<{ amount: bigint; receipt: TransactionReceipt } | null>(null);

  const amount = meta ? parseAmount(input, meta.decimals) : null;
  const balance = isEth ? ethBal?.value : tokenBal;
  const needsApproval = !isEth && amount !== null && allowance < amount;
  const insufficient = amount !== null && balance !== undefined && amount > balance;
  const busy = approveTx.busy || contributeTx.busy;
  const chips = isEth ? ["0.1", "0.5", "1", "2"] : ["50", "100", "250", "500"];
  const symbol = meta?.symbol ?? "";
  const to = deployment ? shortAddress(deployment.openRaise) : "…";

  async function approve() {
    if (!deployment || amount === null) return;
    // Approve exactly the amount being contributed, not an unlimited allowance.
    await approveTx.send(`Approve ${symbol}`, {
      address: c.asset,
      abi: mockErc20Abi,
      functionName: "approve",
      args: [deployment.openRaise, amount],
    });
  }

  async function contribute(e?: FormEvent) {
    e?.preventDefault();
    if (!deployment || amount === null || needsApproval) return;
    const receipt = await contributeTx.send("Contribute", {
      address: deployment.openRaise,
      abi: openRaiseAbi,
      functionName: "contribute",
      args: [c.id, amount],
      value: isEth ? amount : 0n,
    });
    if (receipt) {
      setDone({ amount, receipt });
      setInput("");
    }
  }

  if (inFlight(approveTx.current)) {
    return <InFlight tx={approveTx.current!} call={`approve(${to}, ${input})`} to={shortAddress(c.asset)} value="0" />;
  }
  if (inFlight(contributeTx.current)) {
    return <InFlight tx={contributeTx.current!} call={`contribute(${c.id}, ${input})`} to={to} value={isEth ? `${input} ETH` : "0"} />;
  }
  if (done) {
    return (
      <Done title={`You backed #${c.id}`} block={done.receipt.blockNumber}>
        <KV rows={[["Amount", fmt(done.amount, meta)], ["Event", "Contributed"], ["Gas used", done.receipt.gasUsed.toLocaleString()]]} />
        <p className="sr-only">Contribute: Confirmed</p>
        <Button variant="soft" className="w-full" onClick={() => { setDone(null); contributeTx.reset(); }}>
          Contribute again
        </Button>
      </Done>
    );
  }

  return (
    <form onSubmit={contribute} className="space-y-4">
      <Intro title="Back this campaign">
        {symbol} goes into the campaign contract, not to the owner. Refundable if the goal isn&apos;t met.
      </Intro>
      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor={fid("amount")}>
          Amount
        </label>
        <div className={`flex h-14 items-center gap-2 rounded-xl border bg-paper px-4 ${input && (amount === null || insufficient) ? "border-2 border-rust" : "border-line focus-within:border-forest"}`}>
          <input
            id={fid("amount")}
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0.0"
            aria-label={`Amount (${symbol})`}
            className="w-full bg-transparent font-mono text-xl font-semibold outline-none"
          />
          <span className="font-mono text-muted">{symbol}</span>
        </div>
        {input && amount === null && <p role="alert" className="mt-1.5 text-[13px] text-rust">Enter a positive amount.</p>}
        {insufficient && <p role="alert" className="mt-1.5 text-[13px] text-rust">Amount exceeds your balance.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setInput(q)}
            className="h-9 rounded-full border border-line px-3.5 font-mono text-[13px] font-semibold hover:bg-mint-3"
          >
            {q} {symbol}
          </button>
        ))}
      </div>
      <KV
        rows={[
          ["Wallet balance", balance !== undefined && meta ? `${formatAmount(balance, meta.decimals)} ${symbol}` : "…"],
          ...(!isEth ? ([["Approved", meta ? `${formatUnits(allowance, meta.decimals)} ${symbol}` : "…"]] as [string, string][]) : []),
          ["Platform fee", "none"],
        ]}
      />
      {needsApproval ? (
        <Button className="w-full" size="lg" onClick={approve} disabled={busy || insufficient}>
          Step 1 of 2: Approve {input} {symbol}
        </Button>
      ) : (
        <Button type="submit" className="w-full" size="lg" disabled={busy || amount === null || insufficient}>
          {isEth ? "" : "Step 2 of 2: "}Contribute {amount !== null ? `${input} ${symbol}` : ""}
        </Button>
      )}
      <TxNotice tx={approveTx.current?.phase === "success" ? null : approveTx.current} onRetry={approve} />
      <TxNotice tx={contributeTx.current} onRetry={() => contribute()} />
    </form>
  );
}

export function WithdrawAction({ c, meta }: { c: CampaignView; meta: AssetMeta | undefined }) {
  const { deployment } = useAppChain();
  const tx = useSendTx();
  const to = deployment ? shortAddress(deployment.openRaise) : "…";
  const run = () =>
    deployment && tx.send("Withdraw", { address: deployment.openRaise, abi: openRaiseAbi, functionName: "withdraw", args: [c.id] });

  if (inFlight(tx.current)) return <InFlight tx={tx.current!} call={`withdraw(${c.id})`} to={to} value="0" />;
  return (
    <div className="space-y-4">
      <span className="inline-block rounded-full bg-mint-2 px-2.5 py-1 text-xs font-bold text-forest">Goal reached</span>
      <Intro title="Withdraw the funds">
        The campaign hit its goal by the deadline, so the contract now lets the owner — and only the owner — move the money
        out. This can happen once.
      </Intro>
      <KV rows={[["Amount", fmt(c.raised, meta)], ["Sent to", `${shortAddress(c.owner)} (owner)`]]} />
      <Button className="w-full" size="lg" onClick={run} disabled={tx.busy}>
        Withdraw {fmt(c.raised, meta)}
      </Button>
      <p className="text-xs text-muted">
        Anyone else who tries gets <span className="font-mono">NotCampaignOwner()</span> and nothing moves.
      </p>
      <TxNotice tx={tx.current} onRetry={run} />
    </div>
  );
}

function RefundAction({ c, meta, amount }: { c: CampaignView; meta: AssetMeta | undefined; amount: bigint }) {
  const { deployment } = useAppChain();
  const { address } = useConnection();
  const tx = useSendTx();
  const to = deployment ? shortAddress(deployment.openRaise) : "…";
  const run = () =>
    deployment && tx.send("Refund", { address: deployment.openRaise, abi: openRaiseAbi, functionName: "refund", args: [c.id] });

  if (inFlight(tx.current)) return <InFlight tx={tx.current!} call={`refund(${c.id})`} to={to} value="0" />;
  return (
    <div className="space-y-4">
      <span className="inline-block rounded-full bg-rust-bg px-2.5 py-1 text-xs font-bold text-rust">
        {c.status === Status.Cancelled ? "Campaign cancelled" : "Goal missed"}
      </span>
      <Intro title="Get your money back">
        {c.status === Status.Cancelled
          ? "This campaign was cancelled before its deadline, so nobody can withdraw the money."
          : "The deadline passed before the goal was reached, so the owner can't take the money."}{" "}
        You can claim back exactly what you put in.
      </Intro>
      <KV rows={[["You contributed", fmt(amount, meta)], ["Returned to", `${address ? shortAddress(address) : "…"} (you)`]]} />
      <Button variant="danger" className="w-full" size="lg" onClick={run} disabled={tx.busy}>
        Claim refund · {fmt(amount, meta)}
      </Button>
      <p className="text-xs text-muted">No time limit — your refund stays claimable.</p>
      <TxNotice tx={tx.current} onRetry={run} />
    </div>
  );
}
