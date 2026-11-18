import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import {
  Copy,
  Check,
  FileSpreadsheet,
  RotateCcw,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  Search,
  Users,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import "react-toastify/dist/ReactToastify.css";

const FTO_LOCAL_STORAGE_KEY = "hari_fto_per_farmer_map";

function readLocalFtoMap() {
  try {
    const raw = localStorage.getItem(FTO_LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalFtoMap(map) {
  try {
    localStorage.setItem(FTO_LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore storage errors */
  }
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

function sheetDateKey(s) {
  const str = String(s.date ?? "").trim();
  if (!str) return "";
  return str.slice(0, 10);
}

function getGradeRate(gradeType, rates) {
  if (!rates) return null;
  const norm = String(gradeType || "").trim().toUpperCase();
  const common = Number(
    rates.commonRate != null ? rates.commonRate : rates.ratePerQuintal,
  );
  const gradeA = Number(rates.gradeARate);

  if (norm.includes("GRADE A")) {
    return Number.isFinite(gradeA) && gradeA > 0 ? gradeA : null;
  }
  return Number.isFinite(common) && common > 0 ? common : null;
}

function accountLineAmount(quintals, rates, gradeType) {
  const q = Number(quintals);
  if (!Number.isFinite(q) || q < 0) return null;
  const rate = getGradeRate(gradeType, rates);
  if (rate == null) return null;
  return Math.round(q * rate * 100) / 100;
}

function findDuplicateFto(candidateFto, excludeRowKey, sheets, localFtoMap) {
  if (!candidateFto || candidateFto.length !== 16) return null;

  // 1. Check all sheets and accounts loaded from Firestore
  for (const s of sheets) {
    const accounts = Array.isArray(s.accounts) ? s.accounts : [];
    for (let accIdx = 0; accIdx < accounts.length; accIdx++) {
      const a = accounts[accIdx];
      const rKey = `${s.id}_${accIdx}`;
      if (rKey === excludeRowKey) continue;

      const raw =
        typeof a.ftoNumber === "string" && a.ftoNumber.trim()
          ? a.ftoNumber.trim()
          : localFtoMap[rKey] || "";
      const cleaned = raw.replace(/\D/g, "").slice(0, 16);

      if (cleaned === candidateFto) {
        return {
          rowKey: rKey,
          farmerName:
            String(a.accountName ?? "").trim().toUpperCase() || "Unknown Farmer",
          rsk: String(s.rsk ?? "").trim() || "—",
          dateDisplay: formatDateDisplay(s.date),
        };
      }
    }
  }

  // 2. Check localFtoMap for any rows
  for (const [rKey, val] of Object.entries(localFtoMap)) {
    if (rKey === excludeRowKey) continue;
    const cleaned = String(val || "").replace(/\D/g, "").slice(0, 16);
    if (cleaned === candidateFto) {
      const [sId, aIdxStr] = rKey.split("_");
      const aIdx = parseInt(aIdxStr, 10);
      const s = sheets.find((item) => item.id === sId);
      const acc = s && Array.isArray(s.accounts) ? s.accounts[aIdx] : null;
      return {
        rowKey: rKey,
        farmerName:
          String(acc?.accountName ?? "").trim().toUpperCase() || "Another Farmer",
        rsk: String(s?.rsk ?? "").trim() || "—",
        dateDisplay: s ? formatDateDisplay(s.date) : "—",
      };
    }
  }

  return null;
}

export default function ViewFto() {
  const [sheets, setSheets] = useState([]);
  const [rates, setRates] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // Local per-row FTO caching & interaction state
  const [localFtoMap, setLocalFtoMap] = useState(readLocalFtoMap);
  const [draftFtos, setDraftFtos] = useState({});
  const [editingRows, setEditingRows] = useState({});
  const [savingRows, setSavingRows] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterRsk, setFilterRsk] = useState("");
  const [filterMill, setFilterMill] = useState("");
  const [filterAccountName, setFilterAccountName] = useState("");
  const [sortAscending, setSortAscending] = useState(true);

  // Multi-Farmer Filter State
  const [selectedFarmers, setSelectedFarmers] = useState([]);
  const [farmerDropdownOpen, setFarmerDropdownOpen] = useState(false);
  const [farmerSearchText, setFarmerSearchText] = useState("");
  const farmerDropdownRef = useRef(null);

  // Close multi-farmer dropdown on click outside
  useEffect(() => {
    if (!farmerDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (
        farmerDropdownRef.current &&
        !farmerDropdownRef.current.contains(e.target)
      ) {
        setFarmerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [farmerDropdownOpen]);

  // Listen to Firestore config/truck_sheet for live dynamic rates
  useEffect(() => {
    const ref = doc(db, "config", "truck_sheet");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRates(null);
          return;
        }
        const data = snap.data() || {};
        const cVal =
          data.commonRate != null ? data.commonRate : data.quintalRate;
        const c = Number(cVal);
        const g = Number(data.gradeARate);
        if (Number.isFinite(c) && c > 0 && Number.isFinite(g) && g > 0) {
          setRates({ commonRate: c, gradeARate: g });
        } else {
          setRates(null);
        }
      },
      () => setRates(null),
    );
    return () => unsub();
  }, []);

  // Listen to truck_sheets collection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "truck_sheets"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const da = String(a.date ?? "").trim();
          const dbStr = String(b.date ?? "").trim();
          return da.localeCompare(dbStr);
        });
        setSheets(list);
      },
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, []);

  // RSK filter options
  const rskOptions = useMemo(() => {
    const set = new Set();
    sheets.forEach((s) => {
      const n = String(s.rsk ?? "").trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [sheets]);

  // Mill filter options
  const millOptions = useMemo(() => {
    const set = new Set();
    sheets.forEach((s) => {
      const n = String(s.riceMillName ?? "").trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [sheets]);

  // Farmer options for "Filter Multiple Farmers"
  const farmerOptions = useMemo(() => {
    const map = new Map();
    sheets.forEach((s) => {
      const accounts = Array.isArray(s.accounts) ? s.accounts : [];
      accounts.forEach((a) => {
        const name = String(a.accountName ?? "").trim().toUpperCase();
        if (name) {
          map.set(name, (map.get(name) || 0) + 1);
        }
      });
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [sheets]);

  // Filtered farmer options based on search query inside the multi-select dropdown
  const filteredFarmerOptions = useMemo(() => {
    const q = farmerSearchText.trim().toUpperCase();
    if (!q) return farmerOptions;
    return farmerOptions.filter((f) => f.name.includes(q));
  }, [farmerOptions, farmerSearchText]);

  // Farmer selection handlers
  const handleToggleFarmer = useCallback((name) => {
    setSelectedFarmers((prev) =>
      prev.includes(name)
        ? prev.filter((item) => item !== name)
        : [...prev, name],
    );
  }, []);

  const handleRemoveFarmer = useCallback((name) => {
    setSelectedFarmers((prev) => prev.filter((item) => item !== name));
  }, []);

  const handleSelectAllFiltered = useCallback(() => {
    const matching = filteredFarmerOptions.map((o) => o.name);
    setSelectedFarmers((prev) => {
      const set = new Set([...prev, ...matching]);
      return Array.from(set);
    });
  }, [filteredFarmerOptions]);

  const handleClearAllFarmers = useCallback(() => {
    setSelectedFarmers([]);
  }, []);

  // Filter truck sheets
  const filteredSheets = useMemo(() => {
    return sheets.filter((s) => {
      if (filterDateFrom || filterDateTo) {
        const d = sheetDateKey(s);
        if (!d) return false;
        let from = filterDateFrom;
        let to = filterDateTo;
        if (from && to && from > to) [from, to] = [to, from];
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (filterRsk && String(s.rsk ?? "").trim() !== filterRsk) return false;
      if (filterMill && String(s.riceMillName ?? "").trim() !== filterMill)
        return false;
      return true;
    });
  }, [sheets, filterDateFrom, filterDateTo, filterRsk, filterMill]);

  // Flatten every account from filtered truck sheets into individual FTO rows
  const flattenedRows = useMemo(() => {
    const rows = [];
    const query = filterAccountName.trim().toUpperCase();
    const selectedSet = new Set(selectedFarmers.map((f) => f.toUpperCase()));
    const hasFarmerFilter = selectedSet.size > 0;

    filteredSheets.forEach((s) => {
      const accounts = Array.isArray(s.accounts) ? s.accounts : [];
      accounts.forEach((a, accIdx) => {
        const accName = String(a.accountName ?? "").trim();
        const accNameUpper = accName.toUpperCase();

        // Multi-farmer filter check
        if (hasFarmerFilter && !selectedSet.has(accNameUpper)) return;
        // Search text check
        if (query && !accNameUpper.includes(query)) return;

        const rowKey = `${s.id}_${accIdx}`;
        const rawFto =
          typeof a.ftoNumber === "string" && a.ftoNumber.trim()
            ? a.ftoNumber.trim()
            : localFtoMap[rowKey] || "";
        const ftoNumber = rawFto.replace(/\D/g, "").slice(0, 16);

        const qtl = Number(a.quintals);
        const validQtl = Number.isFinite(qtl) && qtl >= 0 ? qtl : 0;
        const lineAmt = accountLineAmount(validQtl, rates, a.gradeType);

        rows.push({
          rowKey,
          sheetId: s.id,
          accIndex: accIdx,
          date: s.date,
          dateDisplay: formatDateDisplay(s.date),
          rsk: String(s.rsk ?? "").trim() || "—",
          mill: String(s.riceMillName ?? "").trim() || "—",
          farmerName: accNameUpper || "—",
          ftoNumber,
          quintals: validQtl,
          gradeType:
            a.gradeType === "GRADE A" ? "GRADE A" : a.gradeType || "COMMON",
          amount: lineAmt != null ? lineAmt : 0,
        });
      });
    });

    // Sort rows (default ascending: oldest date first matching Excel sheet)
    rows.sort((a, b) => {
      const da = String(a.date ?? "");
      const dbStr = String(b.date ?? "");
      const cmp = da.localeCompare(dbStr);
      return sortAscending ? cmp : -cmp;
    });

    return rows;
  }, [
    filteredSheets,
    filterAccountName,
    selectedFarmers,
    rates,
    sortAscending,
    localFtoMap,
  ]);

  // Summary Totals
  const totals = useMemo(() => {
    let sumQuintals = 0;
    let sumAmount = 0;
    let setFtoCount = 0;

    flattenedRows.forEach((r) => {
      sumQuintals += r.quintals;
      sumAmount += r.amount;
      if (r.ftoNumber && r.ftoNumber.length === 16) {
        setFtoCount += 1;
      }
    });

    return {
      count: flattenedRows.length,
      setCount: setFtoCount,
      quintals: sumQuintals,
      amount: sumAmount,
    };
  }, [flattenedRows]);

  // Handle setting FTO number for an individual farmer row
  const handleSetRowFto = useCallback(
    async (row) => {
      const { rowKey, sheetId, accIndex, farmerName } = row;
      const inputVal =
        draftFtos[rowKey] !== undefined ? draftFtos[rowKey] : row.ftoNumber;
      const cleaned = String(inputVal || "").replace(/\D/g, "").slice(0, 16);

      if (cleaned.length !== 16) {
        toast.error("Please enter a complete 16-digit FTO number.");
        return;
      }

      // Check if this 16-digit FTO number is already assigned to another farmer row
      const duplicateOwner = findDuplicateFto(
        cleaned,
        rowKey,
        sheets,
        localFtoMap,
      );

      if (duplicateOwner) {
        const alertMsg =
          `⚠️ Duplicate FTO Number Alert!\n\n` +
          `The 16-digit FTO Number "${cleaned}" is already assigned to:\n` +
          `• Farmer Name: ${duplicateOwner.farmerName}\n` +
          `• RSK: ${duplicateOwner.rsk}\n` +
          `• Date: ${duplicateOwner.dateDisplay}\n\n` +
          `FTO Number must be unique for each farmer row. Please check and enter the correct unique FTO number.`;

        alert(alertMsg);
        toast.error(
          `Duplicate: FTO ${cleaned} is already used by ${duplicateOwner.farmerName}!`,
        );
        return;
      }

      setSavingRows((prev) => ({ ...prev, [rowKey]: true }));

      try {
        // Optimistically update local storage map
        const nextLocalMap = { ...localFtoMap, [rowKey]: cleaned };
        setLocalFtoMap(nextLocalMap);
        saveLocalFtoMap(nextLocalMap);

        // Update Firestore truck_sheets document
        const targetSheet = sheets.find((s) => s.id === sheetId);
        if (targetSheet) {
          const currentAccounts = Array.isArray(targetSheet.accounts)
            ? targetSheet.accounts.map((acc, i) =>
                i === accIndex ? { ...acc, ftoNumber: cleaned } : acc,
              )
            : [];

          await updateDoc(doc(db, "truck_sheets", sheetId), {
            accounts: currentAccounts,
          });
        }

        // Close editing mode for this row
        setEditingRows((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });

        // Clear draft state for this row
        setDraftFtos((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });

        toast.success(`FTO ${cleaned} saved for ${farmerName}.`);
      } catch (err) {
        console.error("Failed to save FTO:", err);
        toast.error(`Could not save FTO: ${err.message || "Unknown error"}`);
      } finally {
        setSavingRows((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });
      }
    },
    [draftFtos, sheets, localFtoMap],
  );

  // Check duplicate on blur to warn the user immediately if they enter a duplicate FTO
  const handleCheckDuplicateOnBlur = useCallback(
    (row, value) => {
      const cleaned = String(value || "").replace(/\D/g, "").slice(0, 16);
      if (cleaned.length === 16) {
        const dup = findDuplicateFto(cleaned, row.rowKey, sheets, localFtoMap);
        if (dup) {
          const alertMsg =
            `⚠️ Duplicate FTO Number Alert!\n\n` +
            `The 16-digit FTO Number "${cleaned}" is already assigned to:\n` +
            `• Farmer Name: ${dup.farmerName}\n` +
            `• RSK: ${dup.rsk}\n` +
            `• Date: ${dup.dateDisplay}\n\n` +
            `FTO Number must be unique for each farmer row. Please enter a unique FTO number.`;

          alert(alertMsg);
          toast.error(
            `Duplicate: FTO ${cleaned} is already used by ${dup.farmerName}!`,
          );
        }
      }
    },
    [sheets, localFtoMap],
  );

  // Handle clicking Edit on an existing row FTO
  const handleEditRowFto = useCallback((row) => {
    const { rowKey, ftoNumber } = row;
    setDraftFtos((prev) => ({ ...prev, [rowKey]: ftoNumber || "" }));
    setEditingRows((prev) => ({ ...prev, [rowKey]: true }));
  }, []);

  // Handle cancelling Edit mode on a row
  const handleCancelEditRowFto = useCallback((rowKey) => {
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setDraftFtos((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  }, []);

  // Clear filters handler
  const handleClearFilters = useCallback(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterRsk("");
    setFilterMill("");
    setFilterAccountName("");
    setSelectedFarmers([]);
    setFarmerSearchText("");
  }, []);

  const anyFilterActive = Boolean(
    filterDateFrom ||
      filterDateTo ||
      filterRsk ||
      filterMill ||
      filterAccountName ||
      selectedFarmers.length > 0,
  );

  // Copy FTO number to clipboard
  const handleCopyFto = useCallback((ftoVal, key) => {
    if (!ftoVal) return;
    navigator.clipboard.writeText(ftoVal);
    setCopiedKey(key);
    toast.info(`Copied: ${ftoVal}`, { autoClose: 1500 });
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  // Export to Excel
  const handleExportExcel = useCallback(() => {
    if (flattenedRows.length === 0) {
      toast.info("No rows available to export with current filters.");
      return;
    }

    const headers = [
      "SNO:",
      "DATE",
      "RSK",
      "FTO NUMBER",
      "FARMER NAME",
      "QUINTALS",
      "AMOUNT",
    ];

    const sheetData = [headers];

    flattenedRows.forEach((r, idx) => {
      const sno = idx + 1;
      const ftoVal = r.ftoNumber || "";
      sheetData.push([
        sno,
        r.dateDisplay !== "—" ? r.dateDisplay : "",
        r.rsk !== "—" ? r.rsk : "",
        ftoVal,
        r.farmerName,
        r.quintals,
        r.amount,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 10 }, // SNO:
      { wch: 14 }, // DATE
      { wch: 16 }, // RSK
      { wch: 24 }, // FTO NUMBER
      { wch: 36 }, // FARMER NAME
      { wch: 16 }, // QUINTALS
      { wch: 20 }, // AMOUNT
    ];

    // Header styling
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "2D6A4F" }, patternType: "solid" },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: "FFFFFF" },
          },
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
        };
      }
    }

    // Number formats on data rows
    for (let rIdx = 1; rIdx <= flattenedRows.length; rIdx++) {
      const ftoRef = XLSX.utils.encode_cell({ r: rIdx, c: 3 });
      const qtlRef = XLSX.utils.encode_cell({ r: rIdx, c: 5 });
      const amtRef = XLSX.utils.encode_cell({ r: rIdx, c: 6 });

      // Ensure 16-digit FTO numbers are exported as text string to preserve precision
      if (ws[ftoRef]) {
        ws[ftoRef].t = "s";
        ws[ftoRef].z = "@";
      }
      if (ws[qtlRef]) ws[qtlRef].z = "#,##0.0000";
      if (ws[amtRef]) ws[amtRef].z = '"₹"#,##0.00';
    }

    // Enable auto-filter across all columns
    if (sheetData.length > 1) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: sheetData.length - 1, c: headers.length - 1 },
        }),
      };
    }

    // Freeze header row
    ws["!views"] = [
      { state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2", activeCell: "A2" },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FTO Series");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `FTO_Series_${yyyy}-${mm}-${dd}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${flattenedRows.length} FTO row(s) to Excel.`);
  }, [flattenedRows]);

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        <ToastContainer position="top-right" autoClose={3000} />

        {/* Top Header Card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-400/75 bg-white/90 p-6 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              FTO SERIES — VIEW FTO
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Assign 16-digit unique FTO numbers for truck sheet accounts, filter by RSK, mill or dates, and export directly to Excel.
              {rates && (
                <span className="mt-1 block text-xs font-semibold text-emerald-800">
                  Active rates: Common: ₹{rates.commonRate.toLocaleString("en-IN")}/Qtl · Grade A: ₹{rates.gradeARate.toLocaleString("en-IN")}/Qtl
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="Export FTO series to Excel"
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

        {/* KPI Summary Cards & Filters */}
        <div className="space-y-4 rounded-2xl border border-zinc-400/75 bg-white/95 p-5 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Farmer FTO Overview
              </p>
              <h3 className="text-base font-semibold text-zinc-900">
                Individual Farmer FTO Records
              </h3>
            </div>

            {/* Quick KPI summary */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3.5 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase text-zinc-500">
                  Total Rows
                </p>
                <p className="font-mono text-base font-bold text-zinc-800">
                  {totals.count}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase text-emerald-800">
                  FTO Assigned
                </p>
                <p className="font-mono text-base font-bold text-emerald-900">
                  {totals.setCount} / {totals.count}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3.5 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase text-zinc-500">
                  Total Quintals
                </p>
                <p className="font-mono text-base font-bold text-emerald-800">
                  {totals.quintals.toFixed(4)}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3.5 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase text-zinc-500">
                  Total Amount
                </p>
                <p className="font-mono text-base font-bold text-blue-700">
                  {formatRupees(totals.amount)}
                </p>
              </div>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-end gap-3 border-t border-zinc-200/80 pt-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                From date
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                To date
              </label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Filter by RSK
              </label>
              <select
                value={filterRsk}
                onChange={(e) => setFilterRsk(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              >
                <option value="">All RSKs</option>
                {rskOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Filter by mill
              </label>
              <select
                value={filterMill}
                onChange={(e) => setFilterMill(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              >
                <option value="">All mills</option>
                {millOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Multiple Farmers */}
            <div
              className="relative min-w-56 sm:min-w-64"
              ref={farmerDropdownRef}
            >
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-600">
                  Filter multiple farmers
                </label>
                {selectedFarmers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllFarmers}
                    className="text-[0.65rem] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                  >
                    Clear ({selectedFarmers.length})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setFarmerDropdownOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Users className="h-4 w-4 shrink-0 text-emerald-700" />
                  {selectedFarmers.length === 0 ? (
                    <span className="text-sm text-zinc-500">
                      All farmers (Click to select…)
                    </span>
                  ) : (
                    <span className="font-semibold text-emerald-900">
                      {selectedFarmers.length} farmer
                      {selectedFarmers.length === 1 ? "" : "s"} selected
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                    farmerDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {farmerDropdownOpen && (
                <div className="absolute left-0 z-50 mt-1.5 w-72 sm:w-80 overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-[0_12px_32px_-4px_rgba(15,23,42,0.22)]">
                  {/* Dropdown Search & Actions Header */}
                  <div className="border-b border-zinc-200 bg-zinc-50 p-2.5 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        type="text"
                        value={farmerSearchText}
                        onChange={(e) => setFarmerSearchText(e.target.value)}
                        placeholder="Search farmer name…"
                        autoFocus
                        className="w-full rounded-lg border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[0.7rem]">
                      <span className="text-zinc-500 font-medium">
                        {filteredFarmerOptions.length} matching
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllFiltered}
                          className="font-semibold text-emerald-700 hover:underline"
                        >
                          Select All
                        </button>
                        <span className="text-zinc-300">|</span>
                        <button
                          type="button"
                          onClick={handleClearAllFarmers}
                          className="font-semibold text-zinc-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable List of Farmers with Checkboxes */}
                  <div className="max-h-52 overflow-y-auto p-1 divide-y divide-zinc-100">
                    {filteredFarmerOptions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-400">
                        No farmers found matching &quot;{farmerSearchText}&quot;
                      </div>
                    ) : (
                      filteredFarmerOptions.map((farmer) => {
                        const isChecked = selectedFarmers.includes(
                          farmer.name,
                        );
                        return (
                          <label
                            key={farmer.name}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                              isChecked
                                ? "bg-emerald-50 font-semibold text-emerald-950"
                                : "text-zinc-700 hover:bg-zinc-100"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  handleToggleFarmer(farmer.name)
                                }
                                className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="truncate">{farmer.name}</span>
                            </div>
                            <span className="shrink-0 text-[0.65rem] font-normal text-zinc-400">
                              {farmer.count}{" "}
                              {farmer.count === 1 ? "row" : "rows"}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="border-t border-zinc-200 bg-zinc-50 p-2 flex items-center justify-between text-xs">
                    <span className="text-[0.7rem] text-zinc-600 font-medium">
                      {selectedFarmers.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setFarmerDropdownOpen(false)}
                      className="rounded-lg bg-[#2D6A4F] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#245840]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Search Farmer Name
              </label>
              <input
                type="search"
                value={filterAccountName}
                onChange={(e) => setFilterAccountName(e.target.value)}
                placeholder="Search name…"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Date order
              </label>
              <button
                type="button"
                onClick={() => setSortAscending((prev) => !prev)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
              >
                {sortAscending ? "Oldest → Newest" : "Newest → Oldest"}
              </button>
            </div>

            {anyFilterActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear filters</span>
              </button>
            )}
          </div>

          {/* Selected Farmers Pill Chips */}
          {selectedFarmers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-200/80 pt-3">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-800">
                Filtered Farmers ({selectedFarmers.length}):
              </span>
              {selectedFarmers.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 shadow-2xs"
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFarmer(name)}
                    className="rounded-full p-0.5 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-950 transition"
                    title={`Remove ${name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={handleClearAllFarmers}
                className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* FTO Data Rows Table Matching Excel Spec */}
        <div className="overflow-hidden rounded-2xl border border-zinc-400/75 bg-white shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] border-collapse text-left text-xs text-zinc-800">
              <thead>
                <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.7rem] font-bold uppercase tracking-wider text-white">
                  <th className="w-16 border-r border-[#467C64] px-3 py-3 text-center whitespace-nowrap">
                    SNO:
                  </th>
                  <th className="w-28 border-r border-[#467C64] px-3 py-3 text-center whitespace-nowrap">
                    DATE
                  </th>
                  <th className="w-24 border-r border-[#467C64] px-3 py-3 whitespace-nowrap">
                    RSK
                  </th>
                  <th className="w-64 border-r border-[#467C64] px-3 py-3 whitespace-nowrap">
                    FTO NUMBER
                  </th>
                  <th className="border-r border-[#467C64] px-3 py-3 whitespace-nowrap">
                    FARMER NAME
                  </th>
                  <th className="w-32 border-r border-[#467C64] px-3 py-3 text-right whitespace-nowrap">
                    QUINTALS
                  </th>
                  <th className="w-36 px-3 py-3 text-right whitespace-nowrap font-bold">
                    AMOUNT
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {flattenedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-zinc-500"
                    >
                      No truck sheet account records found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  flattenedRows.map((row, idx) => {
                    const sno = idx + 1;
                    const { rowKey } = row;
                    const isEditing = Boolean(editingRows[rowKey]);
                    const isSaving = Boolean(savingRows[rowKey]);
                    const isSet = Boolean(
                      row.ftoNumber &&
                        row.ftoNumber.length === 16 &&
                        !isEditing,
                    );
                    const isCopied = copiedKey === rowKey;

                    // Current draft in input box
                    const currentDraft =
                      draftFtos[rowKey] !== undefined
                        ? draftFtos[rowKey]
                        : row.ftoNumber || "";

                    const dup =
                      currentDraft.length === 16
                        ? findDuplicateFto(
                            currentDraft,
                            rowKey,
                            sheets,
                            localFtoMap,
                          )
                        : null;

                    return (
                      <tr
                        key={`${row.sheetId}-${row.accIndex}-${idx}`}
                        className="transition-colors odd:bg-white even:bg-zinc-50/60 hover:bg-emerald-50/40"
                      >
                        <td className="border-r border-zinc-200 px-3 py-2.5 text-center font-mono font-medium text-zinc-500">
                          {sno}
                        </td>
                        <td className="border-r border-zinc-200 px-3 py-2.5 text-center font-mono whitespace-nowrap">
                          {row.dateDisplay}
                        </td>
                        <td className="border-r border-zinc-200 px-3 py-2.5 font-semibold text-zinc-800 whitespace-nowrap">
                          {row.rsk}
                        </td>

                        {/* FTO NUMBER Column with In-Row Input & Set Button */}
                        <td className="border-r border-zinc-200 px-3 py-2 font-mono whitespace-nowrap">
                          {isSet ? (
                            /* State 1: FTO is SET — Set button is GONE, display locked number + Copy + Edit */
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-emerald-950 tracking-wider">
                                {row.ftoNumber}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyFto(row.ftoNumber, rowKey)
                                  }
                                  className="rounded p-1 text-zinc-400 hover:bg-emerald-100 hover:text-emerald-800 transition"
                                  title="Copy FTO Number"
                                >
                                  {isCopied ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditRowFto(row)}
                                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.65rem] font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition border border-zinc-200"
                                  title="Edit FTO Number"
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                  <span>Edit</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* State 2: FTO is NOT SET (or in Edit mode) — Input (16 digits only) + Set button */
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={currentDraft}
                                  onChange={(e) => {
                                    const digitsOnly = e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 16);
                                    setDraftFtos((prev) => ({
                                      ...prev,
                                      [rowKey]: digitsOnly,
                                    }));
                                  }}
                                  onBlur={() =>
                                    handleCheckDuplicateOnBlur(row, currentDraft)
                                  }
                                  onKeyDown={(e) => {
                                    if (
                                      e.key === "Enter" &&
                                      currentDraft.length === 16 &&
                                      !isSaving
                                    ) {
                                      e.preventDefault();
                                      handleSetRowFto(row);
                                    }
                                  }}
                                  disabled={isSaving}
                                  placeholder="16 digits..."
                                  autoComplete="off"
                                  className={`w-36 rounded-lg border px-2 py-1 text-xs font-mono tracking-wider shadow-sm outline-none transition disabled:bg-zinc-100 ${
                                    dup
                                      ? "border-red-500 bg-red-50/70 font-bold text-red-950 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                      : "border-zinc-300 bg-white text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                  }`}
                                />
                                {dup ? (
                                  <span
                                    className="mt-0.5 flex max-w-[170px] items-center gap-0.5 truncate text-[0.62rem] font-bold text-red-600"
                                    title={`Duplicate! Already assigned to ${dup.farmerName} (RSK: ${dup.rsk}, Date: ${dup.dateDisplay})`}
                                  >
                                    <AlertTriangle className="inline h-2.5 w-2.5 shrink-0 text-red-600" />
                                    <span>Used: {dup.farmerName}</span>
                                  </span>
                                ) : currentDraft.length > 0 &&
                                  currentDraft.length < 16 ? (
                                  <span className="mt-0.5 block text-[0.6rem] font-mono text-zinc-400">
                                    {currentDraft.length}/16 digits
                                  </span>
                                ) : null}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSetRowFto(row)}
                                disabled={
                                  currentDraft.length !== 16 || isSaving
                                }
                                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] ${
                                  dup
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-[#2D6A4F] hover:bg-[#245840] disabled:cursor-not-allowed disabled:opacity-40"
                                }`}
                                title={
                                  dup
                                    ? `Cannot set: Already assigned to ${dup.farmerName}`
                                    : currentDraft.length === 16
                                      ? "Set this FTO number"
                                      : "Enter 16 digits to Set"
                                }
                              >
                                {isSaving ? "Saving…" : "Set"}
                              </button>

                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCancelEditRowFto(rowKey)
                                  }
                                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-[0.65rem] text-zinc-500 hover:bg-zinc-50"
                                  title="Cancel editing"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="border-r border-zinc-200 px-3 py-2.5 font-medium text-zinc-900">
                          <div className="flex items-center gap-1.5">
                            <span>{row.farmerName}</span>
                            {row.gradeType === "GRADE A" && (
                              <span className="rounded bg-amber-100 px-1 py-0.5 text-[0.6rem] font-bold text-amber-900 border border-amber-300">
                                A
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border-r border-zinc-200 px-3 py-2.5 text-right font-mono tabular-nums">
                          {row.quintals.toFixed(4)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-extrabold tabular-nums text-blue-700">
                          {formatRupees(row.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {flattenedRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-emerald-300 bg-emerald-100/70 text-[0.75rem] font-semibold text-emerald-950">
                    <td
                      colSpan={3}
                      className="border-r border-zinc-300 bg-emerald-100/90 px-3 py-3 text-right"
                    >
                      Total ({flattenedRows.length} Accounts)
                    </td>
                    <td className="border-r border-zinc-300 px-3 py-3 font-mono font-bold text-emerald-900">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                        <span>{totals.setCount} Assigned</span>
                      </div>
                    </td>
                    <td className="border-r border-zinc-300 px-3 py-3"></td>
                    <td className="border-r border-zinc-300 px-3 py-3 text-right font-mono font-bold">
                      {totals.quintals.toFixed(4)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-extrabold text-red-600">
                      {formatRupees(totals.amount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
