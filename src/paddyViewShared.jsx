import { useEffect, useMemo, useRef, useState } from "react";
import { formatRupees } from "./formatRupees";

function normalizeSearchQuery(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** options: { value: string, name: string }[] — search by name, pick one value. */
export function NameSearchFilter({
  label,
  options,
  selectedValue,
  onSelectedChange,
  placeholder = "Search by name…",
  emptyHint = "No matches",
}) {
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!selectedValue) return;
    const name = options.find((o) => o.value === selectedValue)?.name ?? "";
    if (name) setInputText(name);
  }, [selectedValue, options]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalizeSearchQuery(inputText);
    if (!q) return options;
    return options.filter((o) =>
      normalizeSearchQuery(o.name).includes(q),
    );
  }, [options, inputText]);

  const onInputChange = (v) => {
    setInputText(v);
    setOpen(true);
    if (v === "") onSelectedChange("");
  };

  const pick = (o) => {
    onSelectedChange(o.value);
    setInputText(o.name);
    setOpen(false);
  };

  return (
    <div className="relative min-w-56 max-w-xs" ref={rootRef}>
      <label className="mb-1 block text-xs font-medium text-zinc-600">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-48 flex-1 rounded-xl border border-emerald-100 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
          autoComplete="off"
        />
        {selectedValue ? (
          <button
            type="button"
            onClick={() => {
              onSelectedChange("");
              setInputText("");
              setOpen(false);
            }}
            className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-48 w-full min-w-48 overflow-auto rounded-xl border border-emerald-100 bg-white py-1 text-sm shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-center text-zinc-500">{emptyHint}</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-emerald-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  {o.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function farmerBagValue(f) {
  const v = f.bagValue ?? f.bagValuePerKata;
  return v != null && v !== "" ? Number(v) : null;
}

export function farmerLineRupees(f) {
  const v = f.rupees ?? f.lineTotal;
  return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

export function farmerRowMatchesFilters(f, filterFarmerId, filterKayidhaName) {
  if (filterFarmerId && f.farmerId !== filterFarmerId) return false;
  if (filterKayidhaName) {
    const kn =
      typeof f.kayidhaName === "string" ? f.kayidhaName.trim() : "";
    if (kn !== filterKayidhaName) return false;
  }
  return true;
}

/** Same widths % for every farmers sub-table so totals line up under Net katas / Line ₹. */
function FarmerSubtableColgroup() {
  return (
    <colgroup>
      <col style={{ width: "3.5%" }} />
      <col style={{ width: "20%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "6%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "13%" }} />
      <col style={{ width: "17.5%" }} />
    </colgroup>
  );
}

const FARMER_SUBTABLE_WRAP =
  "w-full min-w-[720px] overflow-x-auto rounded-lg border border-emerald-100 bg-white";
const FARMER_SUBTABLE_CLASS =
  "w-full min-w-[720px] table-fixed border-collapse text-left text-[0.7rem] text-zinc-800";

/** Single totals row: columns 9–10 align with nested farmers headers above. */
export function FarmerColumnTotalsFooter({ kind, display }) {
  return (
    <div className={FARMER_SUBTABLE_WRAP}>
      <table className={FARMER_SUBTABLE_CLASS}>
        <FarmerSubtableColgroup />
        <thead className="sr-only">
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Farmer</th>
            <th scope="col">Kayidha</th>
            <th scope="col">Mode</th>
            <th scope="col">Bags</th>
            <th scope="col">Above kg</th>
            <th scope="col">Bag value</th>
            <th scope="col">Total kg</th>
            <th scope="col">Net katas</th>
            <th scope="col">Line ₹</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t-2 border-emerald-200 bg-emerald-50/90 align-top">
            <td
              colSpan={8}
              className="px-2 py-2 align-bottom text-[0.65rem] font-medium text-zinc-500"
            >
              Total (filtered lines, all journeys)
            </td>
            <td className="px-2 py-2 align-bottom">
              {kind === "netKatas" ? (
                <div>
                  <p className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-900">
                    Sum of net katas
                  </p>
                  <p className="font-mono text-sm font-semibold text-red-700 tabular-nums">
                    {display}
                  </p>
                </div>
              ) : (
                <span className="text-zinc-300">—</span>
              )}
            </td>
            <td className="px-2 py-2 align-bottom">
              {kind === "lineRupees" ? (
                <div>
                  <p className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-900">
                    Sum of line (₹)
                  </p>
                  <p className="font-mono text-sm font-semibold text-red-700 tabular-nums">
                    {display}
                  </p>
                </div>
              ) : (
                <span className="text-zinc-300">—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function FarmersNestedTable({
  farmers,
  farmerMap,
  filterFarmerId,
  filterKayidhaName,
}) {
  const all = Array.isArray(farmers) ? farmers : [];
  const narrowByFarmerOrKayidha = Boolean(filterFarmerId || filterKayidhaName);
  const entries = all
    .map((f, i) => ({ f, line: i + 1 }))
    .filter(({ f }) =>
      narrowByFarmerOrKayidha
        ? farmerRowMatchesFilters(f, filterFarmerId, filterKayidhaName)
        : true,
    );

  if (entries.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }

  return (
    <div className={FARMER_SUBTABLE_WRAP}>
      <table className={FARMER_SUBTABLE_CLASS}>
        <FarmerSubtableColgroup />
        <thead>
          <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.6rem] font-bold uppercase tracking-wider text-white">
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Line</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Farmer</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Kayidha</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Mode (kg)</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Bags</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Above kg</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Bag value</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Total kg</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Net katas</th>
            <th className="px-2 py-2 whitespace-nowrap">Line ₹</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ f, line }, idx) => {
            const name = farmerMap[f.farmerId]?.trim()
              ? farmerMap[f.farmerId]
              : "—";
            const kayidhaLabel =
              typeof f.kayidhaName === "string" && f.kayidhaName.trim()
                ? f.kayidhaName.trim()
                : "—";
            const bv = farmerBagValue(f);
            const lineRupees = farmerLineRupees(f);
            const paid = Boolean(f.isPaid);
            return (
              <tr
                key={`${line}-${idx}`}
                className={[
                  "border-b border-zinc-200/80 last:border-0",
                  paid
                    ? "bg-zinc-200/70"
                    : "odd:bg-white even:bg-zinc-50/60",
                ].join(" ")}
              >
                <td className="border-r border-zinc-200 px-2 py-2 font-medium text-zinc-500">
                  {line}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 font-medium">{name}</td>
                <td className="border-r border-zinc-200 truncate px-2 py-2 font-medium text-zinc-700">
                  {kayidhaLabel}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 whitespace-nowrap">
                  {f.weightMode ?? "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 whitespace-nowrap">
                  {f.bags ?? "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 whitespace-nowrap">
                  {f.aboveKgs ?? "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 whitespace-nowrap">
                  {bv != null && Number.isFinite(bv) ? bv : "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 whitespace-nowrap font-mono">
                  {f.totalKg != null ? Number(f.totalKg).toFixed(2) : "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 whitespace-nowrap font-mono text-red-700">
                  {f.netKatas != null ? Number(f.netKatas).toFixed(4) : "—"}
                </td>
                <td className="px-2 py-2 whitespace-nowrap font-medium text-emerald-800">
                  {lineRupees != null ? formatRupees(lineRupees) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function formatTotalNetKata(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(4);
}

/** Sum kgs from kayidhaPaddyLines where kayidhaName matches (exact trim). */
export function sumKayidhaPaddyKgsForJourney(journey, selectedKayidhaName) {
  if (!selectedKayidhaName) return 0;
  const lines = Array.isArray(journey.kayidhaPaddyLines)
    ? journey.kayidhaPaddyLines
    : [];
  let sum = 0;
  for (const line of lines) {
    const n =
      typeof line.kayidhaName === "string" ? line.kayidhaName.trim() : "";
    if (n !== selectedKayidhaName) continue;
    const kgs = line.kgs != null ? Number(line.kgs) : NaN;
    if (Number.isFinite(kgs) && kgs >= 0) sum += kgs;
  }
  return sum;
}
