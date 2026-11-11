import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import * as XLSX from "xlsx";
import {
  Check,
  ChevronDown,
  FileSpreadsheet,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import { farmerLineRupees } from "./paddyViewShared";
import "react-toastify/dist/ReactToastify.css";

const SELECTED_KEYS_STORAGE_KEY = "hari_calculate_kayidha_selected_keys";
const HOLDER_STATE_STORAGE_KEY = "hari_calculate_kayidha_holder_state";

function normalizeQuery(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  const s = String(dateStr).trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${dd}-${mm}-${yyyy}`;
  }
  return s;
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getRowBagValue(f) {
  const v = f?.bagValue ?? f?.bagValuePerKata;
  return v != null && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
}

function readStoredKeys() {
  try {
    const raw = sessionStorage.getItem(SELECTED_KEYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k) => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

function readStoredHolderState() {
  try {
    const raw = sessionStorage.getItem(HOLDER_STATE_STORAGE_KEY);
    if (!raw) return { name: "", isSet: false };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === "string" ? parsed.name : "",
      isSet: Boolean(parsed?.isSet && String(parsed?.name ?? "").trim()),
    };
  } catch {
    return { name: "", isSet: false };
  }
}

/**
 * Searchable input supporting BOTH live keyboard substring filtering AND
 * selecting from a dropdown of existing names.
 */
function ComboSearchInput({
  label,
  value,
  onChange,
  options,
  placeholder = "Type or select…",
  emptyHint = "No matches",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  const filteredOptions = useMemo(() => {
    const q = normalizeQuery(value);
    if (!q) return options;
    return options.filter((opt) => normalizeQuery(opt).includes(q));
  }, [options, value]);

  const pick = (opt) => {
    onChange(opt);
    setOpen(false);
  };

  return (
    <div className="relative w-full min-w-56 sm:w-64" ref={rootRef}>
      <label className="mb-1 block text-xs font-medium text-zinc-600">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-emerald-100 bg-white py-2 pl-3 pr-14 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/25"
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-lg p-1 text-zinc-400 hover:bg-emerald-50 hover:text-zinc-700"
              title="Clear"
              aria-label={`Clear ${label}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-50"
            title="Toggle dropdown"
            aria-label={`Toggle ${label} dropdown`}
            aria-expanded={open}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {open && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-emerald-100 bg-white py-1 text-sm shadow-xl">
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-zinc-500">
              {emptyHint}
            </li>
          ) : (
            filteredOptions.map((opt) => {
              const isExact = normalizeQuery(opt) === normalizeQuery(value);
              return (
                <li key={opt}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50 ${
                      isExact
                        ? "bg-emerald-50/80 font-semibold text-emerald-900"
                        : "text-zinc-800"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(opt)}
                  >
                    <span className="truncate">{opt}</span>
                    {isExact && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function CalculateKayidha() {
  const [journeys, setJourneys] = useState([]);
  const [farmerMap, setFarmerMap] = useState({});
  const [loadError, setLoadError] = useState(null);

  const [farmerQuery, setFarmerQuery] = useState("");
  const [holderName, setHolderName] = useState(() => readStoredHolderState().name);
  const [isHolderSet, setIsHolderSet] = useState(() => readStoredHolderState().isSet);
  const [showAllMatching, setShowAllMatching] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState(readStoredKeys);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        SELECTED_KEYS_STORAGE_KEY,
        JSON.stringify(selectedKeys),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [selectedKeys]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        HOLDER_STATE_STORAGE_KEY,
        JSON.stringify({ name: holderName, isSet: isHolderSet }),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [holderName, isHolderSet]);

  const handleSetHolder = useCallback(() => {
    const trimmed = holderName.trim();
    if (!trimmed) {
      toast.info("Please enter a Holder Name first.");
      return;
    }
    setHolderName(trimmed);
    setIsHolderSet(true);
    toast.success(`Holder Name set to "${trimmed}".`);
  }, [holderName]);

  useEffect(() => {
    const unsubJ = onSnapshot(
      collection(db, "paddy_journeys"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta =
            a.createdAt?.toMillis?.() ??
            (a.createdAt?.seconds != null ? a.createdAt.seconds * 1000 : 0);
          const tb =
            b.createdAt?.toMillis?.() ??
            (b.createdAt?.seconds != null ? b.createdAt.seconds * 1000 : 0);
          return tb - ta;
        });
        setJourneys(list);
      },
      (err) => setLoadError(err.message),
    );

    const unsubF = onSnapshot(
      collection(db, "farmers"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = String(d.data().name ?? "");
        });
        setFarmerMap(map);
      },
      (err) => setLoadError(err.message),
    );

    return () => {
      unsubJ();
      unsubF();
    };
  }, []);

  /** Flatten every farmer paddy line across all ViewPaddy journeys. */
  const allFarmerRows = useMemo(() => {
    const rows = [];
    journeys.forEach((j) => {
      const farmers = Array.isArray(j.farmers) ? j.farmers : [];
      farmers.forEach((f, idx) => {
        const farmerId = String(f?.farmerId ?? "");
        const mappedName = String(farmerMap[farmerId] ?? "").trim();
        const farmerName = mappedName || farmerId || "—";
        const kayidhaName =
          typeof f?.kayidhaName === "string" ? f.kayidhaName.trim() : "";
        const bagValue = getRowBagValue(f);
        const lineRupees = farmerLineRupees(f);

        rows.push({
          rowKey: `${j.id}__${idx}`,
          journeyId: j.id,
          lineNumber: idx + 1,
          date: j.date ?? "",
          vehicleNo: String(j.vehicleNo ?? "").trim(),
          riceMillName: String(j.riceMillName ?? "").trim(),
          farmerId,
          farmerName,
          kayidhaName,
          weightMode:
            f?.weightMode != null && f.weightMode !== ""
              ? Number(f.weightMode)
              : null,
          bags:
            f?.bags != null && f.bags !== "" && Number.isFinite(Number(f.bags))
              ? Number(f.bags)
              : null,
          aboveKgs:
            f?.aboveKgs != null &&
            f.aboveKgs !== "" &&
            Number.isFinite(Number(f.aboveKgs))
              ? Number(f.aboveKgs)
              : null,
          bagValue,
          totalKg:
            f?.totalKg != null &&
            f.totalKg !== "" &&
            Number.isFinite(Number(f.totalKg))
              ? Number(f.totalKg)
              : null,
          netKatas:
            f?.netKatas != null &&
            f.netKatas !== "" &&
            Number.isFinite(Number(f.netKatas))
              ? Number(f.netKatas)
              : null,
          lineRupees,
          isPaid: Boolean(f?.isPaid),
        });
      });
    });
    return rows;
  }, [journeys, farmerMap]);

  /** Unique sorted Farmer Names available in ViewPaddy. */
  const farmerNameOptions = useMemo(() => {
    const set = new Set();
    allFarmerRows.forEach((r) => {
      if (r.farmerName && r.farmerName !== "—") set.add(r.farmerName);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allFarmerRows]);

  const hasFilterText = Boolean(normalizeQuery(farmerQuery));

  /** Rows returned by the Farmer Name filter only (Holder Name does not filter). */
  const matchingRows = useMemo(() => {
    const fq = normalizeQuery(farmerQuery);
    if (!fq && !showAllMatching) return [];

    return allFarmerRows.filter((r) => {
      if (fq && !normalizeQuery(r.farmerName).includes(fq)) return false;
      return true;
    });
  }, [allFarmerRows, farmerQuery, showAllMatching]);

  const rowLookupMap = useMemo(() => {
    const map = new Map();
    allFarmerRows.forEach((r) => map.set(r.rowKey, r));
    return map;
  }, [allFarmerRows]);

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  /** Resolved rows added into Calculate Kayidha (preserving selection order). */
  const selectedRows = useMemo(() => {
    return selectedKeys.map((k) => rowLookupMap.get(k)).filter(Boolean);
  }, [selectedKeys, rowLookupMap]);

  const addRowToCalculate = useCallback(
    (row) => {
      if (selectedKeySet.has(row.rowKey)) {
        toast.info(
          `${row.farmerName} (${formatDateDisplay(row.date)}) is already in Calculate Kayidha.`,
        );
        return;
      }
      setSelectedKeys((prev) => [...prev, row.rowKey]);
      toast.success(`Added ${row.farmerName} to Calculate Kayidha.`);
    },
    [selectedKeySet],
  );

  const addAllMatchingRows = useCallback(() => {
    const toAdd = matchingRows
      .filter((r) => !selectedKeySet.has(r.rowKey))
      .map((r) => r.rowKey);

    if (toAdd.length === 0) {
      toast.info("All matching rows are already added.");
      return;
    }
    setSelectedKeys((prev) => [...prev, ...toAdd]);
    toast.success(`Added ${toAdd.length} row(s) to Calculate Kayidha.`);
  }, [matchingRows, selectedKeySet]);

  const removeSelectedRow = useCallback((rowKey) => {
    setSelectedKeys((prev) => prev.filter((k) => k !== rowKey));
  }, []);

  const clearSelectedRows = useCallback(() => {
    setSelectedKeys([]);
    setHolderName("");
    setIsHolderSet(false);
    toast.info("Cleared Calculate Kayidha.");
  }, []);

  const clearFilters = useCallback(() => {
    setFarmerQuery("");
    setShowAllMatching(false);
  }, []);

  /** Totals across all rows added to Calculate Kayidha. */
  const totals = useMemo(() => {
    let bags = 0;
    let aboveKgs = 0;
    let totalKg = 0;
    let netKatas = 0;
    let lineRupees = 0;

    for (const r of selectedRows) {
      bags += numOrZero(r.bags);
      aboveKgs += numOrZero(r.aboveKgs);
      totalKg += numOrZero(r.totalKg);
      netKatas += numOrZero(r.netKatas);
      lineRupees += numOrZero(r.lineRupees);
    }
    return { bags, aboveKgs, totalKg, netKatas, lineRupees };
  }, [selectedRows]);

  /** Holder-wise (Kayidha) summary breakdown for the selected rows. */
  const holderBreakdown = useMemo(() => {
    const groups = new Map();
    for (const r of selectedRows) {
      const key = r.kayidhaName || "No Holder (Unassigned)";
      const cur = groups.get(key) ?? {
        holderName: key,
        count: 0,
        bags: 0,
        totalKg: 0,
        netKatas: 0,
        lineRupees: 0,
      };
      cur.count += 1;
      cur.bags += numOrZero(r.bags);
      cur.totalKg += numOrZero(r.totalKg);
      cur.netKatas += numOrZero(r.netKatas);
      cur.lineRupees += numOrZero(r.lineRupees);
      groups.set(key, cur);
    }
    return Array.from(groups.values());
  }, [selectedRows]);

  const handleExportExcel = useCallback(() => {
    if (selectedRows.length === 0) {
      toast.info("Add at least one farmer row before exporting to Excel.");
      return;
    }

    const effectiveHolder = holderName.trim();
    const headers = [
      "#",
      "DATE",
      "VEHICLE NO.",
      "RICE MILL",
      "FARMER",
      "HOLDER (KAYIDHA)",
      "MODE (KG)",
      "BAGS",
      "ABOVE KG",
      "BAG VALUE",
      "TOTAL KG",
      "NET KATAS",
      "LINE ₹",
    ];

    const sheetData = effectiveHolder
      ? [["HOLDER NAME", effectiveHolder], [], headers]
      : [headers];
    const headerRowIndex = effectiveHolder ? 2 : 0;

    selectedRows.forEach((r, idx) => {
      sheetData.push([
        idx + 1,
        formatDateDisplay(r.date) !== "—" ? formatDateDisplay(r.date) : "",
        r.vehicleNo || "",
        r.riceMillName || "",
        r.farmerName || "",
        r.kayidhaName || "—",
        r.weightMode != null ? r.weightMode : "",
        numOrZero(r.bags),
        numOrZero(r.aboveKgs),
        r.bagValue != null ? r.bagValue : "",
        numOrZero(r.totalKg),
        numOrZero(r.netKatas),
        numOrZero(r.lineRupees),
      ]);
    });

    const totalRowIndex = headerRowIndex + 1 + selectedRows.length;
    sheetData.push([
      "Total (all rows above)",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.bags,
      totals.aboveKgs,
      "",
      totals.totalKg,
      totals.netKatas,
      totals.lineRupees,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 6 }, // #
      { wch: 13 }, // DATE
      { wch: 15 }, // VEHICLE NO.
      { wch: 28 }, // RICE MILL
      { wch: 24 }, // FARMER
      { wch: 22 }, // HOLDER (KAYIDHA)
      { wch: 11 }, // MODE
      { wch: 10 }, // BAGS
      { wch: 11 }, // ABOVE KG
      { wch: 12 }, // BAG VALUE
      { wch: 13 }, // TOTAL KG
      { wch: 14 }, // NET KATAS
      { wch: 16 }, // LINE ₹
    ];

    const merges = [
      { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 6 } },
    ];
    if (effectiveHolder) {
      merges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: 4 } });
    }
    ws["!merges"] = merges;

    if (effectiveHolder) {
      if (ws["A1"]) {
        ws["A1"].s = {
          fill: { fgColor: { rgb: "2D6A4F" }, patternType: "solid" },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      }
      if (ws["B1"]) {
        ws["B1"].s = {
          fill: { fgColor: { rgb: "E6F4EA" }, patternType: "solid" },
          font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "0F5132" } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      }
    }

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: headerRowIndex, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "2D6A4F" }, patternType: "solid" },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: "FFFFFF" },
          },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    for (let idx = 0; idx < selectedRows.length; idx++) {
      const rIdx = headerRowIndex + 1 + idx;
      const bvRef = XLSX.utils.encode_cell({ r: rIdx, c: 9 });
      const totKgRef = XLSX.utils.encode_cell({ r: rIdx, c: 10 });
      const nkRef = XLSX.utils.encode_cell({ r: rIdx, c: 11 });
      const amtRef = XLSX.utils.encode_cell({ r: rIdx, c: 12 });

      if (ws[bvRef] && typeof ws[bvRef].v === "number")
        ws[bvRef].z = '"₹"#,##0.00';
      if (ws[totKgRef]) ws[totKgRef].z = "#,##0.00";
      if (ws[nkRef]) ws[nkRef].z = "#,##0.0000";
      if (ws[amtRef]) ws[amtRef].z = '"₹"#,##0.00';
    }

    const totBagsRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 7 });
    const totAboveRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 8 });
    const totKgRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 10 });
    const totNkRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 11 });
    const totAmtRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 12 });

    if (ws[totBagsRef]) ws[totBagsRef].z = "#,##0";
    if (ws[totAboveRef]) ws[totAboveRef].z = "#,##0.00";
    if (ws[totKgRef]) ws[totKgRef].z = "#,##0.00";
    if (ws[totNkRef]) ws[totNkRef].z = "#,##0.0000";
    if (ws[totAmtRef]) ws[totAmtRef].z = '"₹"#,##0.00';

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "D1E7DD" }, patternType: "solid" },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: c >= 7 ? "DC2626" : "0F5132" },
          },
          alignment: { horizontal: "right", vertical: "center" },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Calculate Kayidha");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const safeHolder = effectiveHolder
      ? `_${effectiveHolder.replace(/[^a-zA-Z0-9_-]+/g, "_")}`
      : "";
    XLSX.writeFile(
      wb,
      `Calculate_Kayidha${safeHolder}_${yyyy}-${mm}-${dd}.xlsx`,
    );
    toast.success(`Exported ${selectedRows.length} row(s) to Excel.`);
  }, [selectedRows, totals, holderName]);

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              CALCULATE KAYIDHA
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Enter a custom Holder Name for whose Kayidha this belongs to,
              filter View Paddy farmer data by Farmer Name, and click any
              matching farmer row to add it into the Calculate Kayidha table
              below.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="Export Calculate Kayidha rows to Excel"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Export Excel</span>
          </button>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {/* Search / Filter Section (ViewPaddy Farmer Data Lookup) */}
        <div className="space-y-4 rounded-2xl border border-emerald-100/90 bg-white/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <ComboSearchInput
                label="Filter by Farmer Name"
                value={farmerQuery}
                onChange={setFarmerQuery}
                options={farmerNameOptions}
                placeholder="Type or select farmer…"
                emptyHint="No matching farmer names"
              />
              <div className="w-full min-w-64 sm:w-80">
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Holder Name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={holderName}
                    onChange={(e) => {
                      if (!isHolderSet) setHolderName(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isHolderSet) {
                        e.preventDefault();
                        handleSetHolder();
                      }
                    }}
                    readOnly={isHolderSet}
                    placeholder="Enter holder name…"
                    autoComplete="off"
                    className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm outline-none transition ${
                      isHolderSet
                        ? "cursor-default border-emerald-300 bg-emerald-50/80 font-semibold text-emerald-950"
                        : "border-emerald-100 bg-white text-zinc-900 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/25"
                    }`}
                  />
                  {!isHolderSet && (
                    <button
                      type="button"
                      onClick={handleSetHolder}
                      className="shrink-0 rounded-xl bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#245840] active:scale-[0.98]"
                    >
                      Set
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {!hasFilterText && (
                <button
                  type="button"
                  onClick={() => setShowAllMatching((v) => !v)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  {showAllMatching
                    ? "Hide list"
                    : `Show all (${allFarmerRows.length})`}
                </button>
              )}
              {(hasFilterText || showAllMatching) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Clear filters
                </button>
              )}
              {matchingRows.length > 0 && (
                <button
                  type="button"
                  onClick={addAllMatchingRows}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add all matching ({matchingRows.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Results Table */}
          {!hasFilterText && !showAllMatching ? (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 px-4 py-6 text-center text-sm text-zinc-600">
              Enter or select a{" "}
              <span className="font-semibold text-emerald-900">
                Farmer Name
              </span>{" "}
              above to list matching farmer paddy records from View Paddy.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-600">
                Found{" "}
                <span className="font-semibold text-zinc-900">
                  {matchingRows.length}
                </span>{" "}
                matching record{matchingRows.length === 1 ? "" : "s"} in View
                Paddy —{" "}
                <span className="text-emerald-800">
                  click any row to add it to Calculate Kayidha below.
                </span>
              </p>

              <div className="max-h-96 overflow-auto rounded-2xl border border-emerald-100/90 bg-white shadow-sm">
                <table className="w-full min-w-[1160px] border-collapse text-left text-xs text-zinc-800">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.65rem] font-bold uppercase tracking-wider text-white">
                      <th className="rounded-tl-xl border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        #
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Date
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Vehicle no.
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Rice mill
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Farmer
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Holder (Kayidha)
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Mode (kg)
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Bags
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Above kg
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Bag value
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Total kg
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Net katas
                      </th>
                      <th className="border-r border-[#467C64] px-2 py-2.5 whitespace-nowrap">
                        Line ₹
                      </th>
                      <th className="rounded-tr-xl px-2 py-2.5 text-center whitespace-nowrap">
                        Add
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchingRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={14}
                          className="px-4 py-8 text-center text-sm text-zinc-500"
                        >
                          No farmer records match the entered filter.
                        </td>
                      </tr>
                    ) : (
                      matchingRows.map((row, idx) => {
                        const isAdded = selectedKeySet.has(row.rowKey);
                        return (
                          <tr
                            key={row.rowKey}
                            onClick={() => addRowToCalculate(row)}
                            className={`cursor-pointer border-b border-zinc-200/80 transition-colors ${
                              isAdded
                                ? "bg-emerald-50/80 hover:bg-emerald-100/70"
                                : "odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/60"
                            }`}
                            title={
                              isAdded
                                ? "Already added to Calculate Kayidha"
                                : "Click to add this farmer row to Calculate Kayidha"
                            }
                          >
                            <td className="border-r border-zinc-200 px-2 py-2.5 text-center font-medium text-zinc-500">
                              {idx + 1}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 tabular-nums">
                              {formatDateDisplay(row.date)}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 font-medium">
                              {row.vehicleNo || "—"}
                            </td>
                            <td className="border-r border-zinc-200 max-w-44 truncate px-2 py-2.5">
                              {row.riceMillName || "—"}
                            </td>
                            <td className="border-r border-zinc-200 px-2 py-2.5 font-semibold text-zinc-900">
                              <div className="flex items-center gap-1.5">
                                <span>{row.farmerName}</span>
                                {row.isPaid && (
                                  <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-zinc-700">
                                    Paid
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="border-r border-zinc-200 px-2 py-2.5 font-medium text-emerald-900">
                              {row.kayidhaName || "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 tabular-nums">
                              {row.weightMode ?? "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 tabular-nums">
                              {row.bags ?? "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 tabular-nums">
                              {row.aboveKgs ?? "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 tabular-nums">
                              {row.bagValue ?? "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 font-mono tabular-nums">
                              {row.totalKg != null
                                ? row.totalKg.toFixed(2)
                                : "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 font-mono text-red-700 tabular-nums">
                              {row.netKatas != null
                                ? row.netKatas.toFixed(4)
                                : "—"}
                            </td>
                            <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-2.5 font-semibold text-emerald-800 tabular-nums">
                              {row.lineRupees != null
                                ? formatRupees(row.lineRupees)
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2.5 text-center">
                              {isAdded ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.65rem] font-semibold text-emerald-800">
                                  <Check className="h-3 w-3" />
                                  Added
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-[#2D6A4F] px-2.5 py-1 text-[0.65rem] font-semibold text-white">
                                  <Plus className="h-3 w-3" />
                                  Add
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Calculate Kayidha Selected Rows & Totals Section */}
        <div className="space-y-4 rounded-2xl border border-emerald-100/90 bg-white p-5 shadow-lg shadow-emerald-900/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-zinc-900">
                <span>Selected Rows — Calculate Kayidha</span>
                {isHolderSet && holderName && (
                  <span className="inline-flex items-center rounded-full bg-[#2D6A4F] px-3 py-0.5 text-xs font-semibold text-white">
                    Holder: {holderName}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                  {selectedRows.length}{" "}
                  {selectedRows.length === 1 ? "row" : "rows"}
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Combined paddy weight, net katas, and rupees calculation for
                all selected rows.
              </p>
            </div>
            {(selectedRows.length > 0 || isHolderSet) && (
              <button
                type="button"
                onClick={clearSelectedRows}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear all</span>
              </button>
            )}
          </div>

          {/* Summary Cards */}
          {selectedRows.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-800">
                  Total Bags
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-zinc-900 tabular-nums">
                  {totals.bags.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-800">
                  Total Weight (kg)
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-zinc-900 tabular-nums">
                  {totals.totalKg.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/40 p-3.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-red-700">
                  Total Net Katas
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-red-600 tabular-nums">
                  {totals.netKatas.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/40 p-3.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-red-700">
                  Total Amount (₹)
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-red-600 tabular-nums">
                  {formatRupees(totals.lineRupees)}
                </p>
              </div>
            </div>
          )}

          {/* Holder-wise (Kayidha) Breakdown */}
          {holderBreakdown.length > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-900">
                Holder (Kayidha) Breakdown
              </p>
              <div className="flex flex-wrap gap-2.5">
                {holderBreakdown.map((h) => (
                  <div
                    key={h.holderName}
                    className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2 text-xs shadow-xs"
                  >
                    <p className="font-semibold text-emerald-900">
                      {h.holderName}{" "}
                      <span className="font-normal text-zinc-500">
                        ({h.count} {h.count === 1 ? "row" : "rows"})
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-[0.7rem] text-zinc-700 tabular-nums">
                      Bags: <span className="font-semibold">{h.bags}</span> ·
                      Katas:{" "}
                      <span className="font-semibold text-red-600">
                        {h.netKatas.toFixed(4)}
                      </span>{" "}
                      · Amt:{" "}
                      <span className="font-semibold text-red-600">
                        {formatRupees(h.lineRupees)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Rows Table */}
          <div className="overflow-x-auto rounded-2xl border border-emerald-100/90 bg-white shadow-sm">
            <table className="w-full min-w-[1160px] border-collapse text-left text-xs text-zinc-800">
              <thead>
                <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.65rem] font-bold uppercase tracking-wider text-white">
                  <th className="rounded-tl-xl border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    #
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Date
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Vehicle no.
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Rice mill
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Farmer
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Holder (Kayidha)
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Mode (kg)
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Bags
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Above kg
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Bag value
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Total kg
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Net katas
                  </th>
                  <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                    Line ₹
                  </th>
                  <th className="rounded-tr-xl px-2 py-3 text-center whitespace-nowrap">
                    Remove
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-4 py-10 text-center text-sm text-zinc-500"
                    >
                      No farmer rows added yet. Search above and click any
                      farmer row to add it here.
                    </td>
                  </tr>
                ) : (
                  selectedRows.map((row, idx) => (
                    <tr
                      key={row.rowKey}
                      className="border-b border-zinc-200/80 transition-colors odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40"
                    >
                      <td className="border-r border-zinc-200 px-2 py-3 text-center font-medium text-zinc-500">
                        {idx + 1}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {formatDateDisplay(row.date)}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-medium">
                        {row.vehicleNo || "—"}
                      </td>
                      <td className="border-r border-zinc-200 max-w-44 truncate px-2 py-3">
                        {row.riceMillName || "—"}
                      </td>
                      <td className="border-r border-zinc-200 px-2 py-3 font-semibold text-zinc-900">
                        <div className="flex items-center gap-1.5">
                          <span>{row.farmerName}</span>
                          {row.isPaid && (
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-zinc-700">
                              Paid
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border-r border-zinc-200 px-2 py-3 font-medium text-emerald-900">
                        {row.kayidhaName || "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {row.weightMode ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {row.bags ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {row.aboveKgs ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {row.bagValue ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono tabular-nums">
                        {row.totalKg != null ? row.totalKg.toFixed(2) : "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono text-red-700 tabular-nums">
                        {row.netKatas != null ? row.netKatas.toFixed(4) : "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-semibold text-emerald-800 tabular-nums">
                        {row.lineRupees != null
                          ? formatRupees(row.lineRupees)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeSelectedRow(row.rowKey)}
                          className="inline-flex rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          title="Remove row from Calculate Kayidha"
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {selectedRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-emerald-300 bg-emerald-100/70 text-[0.7rem] font-semibold text-emerald-950">
                    <td
                      colSpan={7}
                      className="border-r border-zinc-300 bg-emerald-100/90 px-2 py-3 text-right"
                    >
                      Total (all rows above)
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                      {totals.bags.toLocaleString("en-IN")}
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                      {totals.aboveKgs.toFixed(2)}
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 text-zinc-400">
                      —
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                      {totals.totalKg.toFixed(2)}
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                      {totals.netKatas.toFixed(4)}
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-bold text-red-600 tabular-nums">
                      {formatRupees(totals.lineRupees)}
                    </td>
                    <td className="px-2 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={4000}
        closeOnClick
        pauseOnHover
        theme="light"
      />
    </div>
  );
}

export default CalculateKayidha;
