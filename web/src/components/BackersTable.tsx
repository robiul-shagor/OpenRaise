import { formatAmount, shortAddress, Status, type AssetMeta } from "@/lib/format";
import type { BackerRow } from "@/lib/hooks";

const fmtDate = (ts: bigint) =>
  new Date(Number(ts) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function rowState(b: BackerRow, status: Status): { text: string; tone: string } {
  if (b.refunded) return { text: "Refunded", tone: "text-rust" };
  if (status === Status.Withdrawn) return { text: "Paid to owner", tone: "text-forest" };
  if (status === Status.Failed || status === Status.Cancelled) return { text: "Refund unclaimed", tone: "text-ember" };
  return { text: "Held in contract", tone: "text-ink-2" };
}

/** Per-backer totals built from Contributed/Refunded events. Addresses are shown, never names: backers are pseudonymous. */
export function BackersTable({ rows, meta, status }: { rows: BackerRow[]; meta: AssetMeta | undefined; status: Status }) {
  if (!rows.length) return <p className="text-sm text-muted">No backers yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Backer</th>
            <th className="px-4 py-2.5 font-semibold">Total</th>
            <th className="px-4 py-2.5 font-semibold">Txs</th>
            <th className="px-4 py-2.5 font-semibold">Last contribution</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const st = rowState(b, status);
            return (
              <tr key={b.address} className="border-t border-line">
                <td className="px-4 py-2.5 font-mono" title={b.address}>{shortAddress(b.address)}</td>
                <td className="px-4 py-2.5 font-mono">
                  {meta ? formatAmount(b.total, meta.decimals) : "…"} {meta?.symbol}
                </td>
                <td className="px-4 py-2.5 font-mono">{b.txs}</td>
                <td className="px-4 py-2.5 text-muted">{b.last !== undefined ? fmtDate(b.last) : "—"}</td>
                <td className={`px-4 py-2.5 ${st.tone}`}>{st.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function backersCsv(rows: BackerRow[], meta: AssetMeta | undefined): string {
  const header = "address,total,symbol,total_base_units,txs,last_contribution_iso,refunded";
  const lines = rows.map((b) =>
    [
      b.address,
      meta ? formatAmount(b.total, meta.decimals, meta.decimals).replace(/,/g, "") : "",
      meta?.symbol ?? "",
      b.total.toString(),
      b.txs,
      b.last !== undefined ? new Date(Number(b.last) * 1000).toISOString() : "",
      b.refunded,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

/** Triggers a client-side download of generated text (CSV). */
export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
