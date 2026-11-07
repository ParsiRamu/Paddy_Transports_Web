import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import { NameSearchFilter } from "./paddyViewShared";
import "react-toastify/dist/ReactToastify.css";

function sheetDateKey(s) {
  const str = String(s.date ?? "").trim();
  if (!str) return "";
  return str.slice(0, 10);
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

/** Matches AddTruckSheet when `config/truck_sheet` is missing or invalid */
const DEFAULT_QUINTAL_RATE = 2369;

const ACCOUNTS_SUB_WRAP =
  "w-full min-w-[380px] overflow-x-auto rounded-lg border border-emerald-100 bg-white";
const ACCOUNTS_SUB_TABLE =
  "w-full min-w-[380px] table-fixed border-collapse text-left text-[0.7rem] text-zinc-800";

function accountLineAmount(quintals, quintalRate) {
  const q = Number(quintals);
  const r = Number(quintalRate);
  if (!Number.isFinite(q) || !Number.isFinite(r) || r <= 0) return null;
  return Math.round(q * r * 100) / 100;
}

/** Trim + uppercase so "Kundlachandrarao" and "kundlachandrarao" match. */
function normalizeAccountKey(name) {
  return String(name ?? "").trim().toUpperCase();
}

function sheetHasAccountName(s, accountFilterUpper) {
  if (!accountFilterUpper) return true;
  const arr = Array.isArray(s.accounts) ? s.accounts : [];
  return arr.some(
    (a) => normalizeAccountKey(a.accountName) === accountFilterUpper,
  );
}

/** When `accountFilterUpper` is set, only rows matching that key (uppercase). */
function accountsForDisplay(accounts, accountFilterUpper) {
  const arr = Array.isArray(accounts) ? accounts : [];
  if (!accountFilterUpper) return arr;
  return arr.filter(
    (a) => normalizeAccountKey(a.accountName) === accountFilterUpper,
  );
}

function AccountsNestedTable({ accounts, quintalRate }) {
  const rows = Array.isArray(accounts) ? accounts : [];
  if (rows.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <div className={ACCOUNTS_SUB_WRAP}>
      <table className={ACCOUNTS_SUB_TABLE}>
        <thead>
          <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.6rem] font-bold uppercase tracking-wider text-white">
            <th className="w-[10%] border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Line</th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Account name</th>
            <th className="w-[18%] border-r border-[#467C64] px-2 py-2 whitespace-nowrap">Quintals</th>
            <th className="w-[22%] border-r border-[#467C64] px-2 py-2 whitespace-nowrap text-right font-bold">
              Amount (₹)
            </th>
            <th className="w-[12%] px-2 py-2 whitespace-nowrap text-center">
              Done
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, idx) => {
            const done = Boolean(a.isCompleted);
            const lineAmt = accountLineAmount(a.quintals, quintalRate);
            return (
              <tr
                key={idx}
                className={
                  done
                    ? "border-b border-zinc-200/80 bg-zinc-200/45 text-zinc-600 last:border-0"
                    : "border-b border-zinc-200/80 last:border-0 odd:bg-white even:bg-zinc-50/60"
                }
              >
                <td className="border-r border-zinc-200 px-2 py-2 font-medium text-zinc-500">
                  {idx + 1}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 font-medium">
                  {normalizeAccountKey(a.accountName) || "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 font-mono tabular-nums">
                  {a.quintals != null && Number.isFinite(Number(a.quintals))
                    ? Number(a.quintals).toFixed(4)
                    : "—"}
                </td>
                <td className="border-r border-zinc-200 px-2 py-2 text-right font-mono tabular-nums font-extrabold text-blue-600">
                  {lineAmt != null ? formatRupees(lineAmt) : "—"}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {done ? "✓" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ViewTruckSheet() {
  const [sheets, setSheets] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMill, setFilterMill] = useState("");
  const [filterRsk, setFilterRsk] = useState("");
  const [filterAccountName, setFilterAccountName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [pdfViewer, setPdfViewer] = useState(null);
  const [quintalRate, setQuintalRate] = useState(DEFAULT_QUINTAL_RATE);

  useEffect(() => {
    const ref = doc(db, "config", "truck_sheet");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const raw = snap.data()?.quintalRate;
        const n = Number(raw);
        setQuintalRate(
          Number.isFinite(n) && n > 0 ? n : DEFAULT_QUINTAL_RATE,
        );
      },
      () => setQuintalRate(DEFAULT_QUINTAL_RATE),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "truck_sheets"),
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
        setSheets(list);
      },
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, []);

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

  const rskSearchOptions = useMemo(
    () => rskOptions.map((name) => ({ value: name, name })),
    [rskOptions],
  );

  const accountNameOptions = useMemo(() => {
    const set = new Set();
    sheets.forEach((s) => {
      const arr = Array.isArray(s.accounts) ? s.accounts : [];
      arr.forEach((a) => {
        const key = normalizeAccountKey(a.accountName);
        if (key) set.add(key);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sheets]);

  const accountSearchOptions = useMemo(
    () => accountNameOptions.map((name) => ({ value: name, name })),
    [accountNameOptions],
  );

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
      if (filterMill && String(s.riceMillName ?? "").trim() !== filterMill)
        return false;
      if (filterRsk && String(s.rsk ?? "").trim() !== filterRsk) return false;
      if (!sheetHasAccountName(s, filterAccountName)) return false;
      return true;
    });
  }, [
    sheets,
    filterDateFrom,
    filterDateTo,
    filterMill,
    filterRsk,
    filterAccountName,
  ]);

  /** Shown when mill or RSK filter is active: totals over currently listed sheets */
  const millOrRskFilterTotals = useMemo(() => {
    if (!filterMill && !filterRsk) return null;
    let totalQuintals = 0;
    let totalAmount = 0;
    for (const s of filteredSheets) {
      const q = s.netQuintals;
      if (q != null && Number.isFinite(Number(q))) totalQuintals += Number(q);
      const amt = s.amount;
      if (amt != null && Number.isFinite(Number(amt))) totalAmount += Number(amt);
    }
    return { totalQuintals, totalAmount };
  }, [filteredSheets, filterMill, filterRsk]);

  const dateRangeFilterActive = Boolean(filterDateFrom || filterDateTo);
  const anyFilterActive = Boolean(
    dateRangeFilterActive ||
      filterMill ||
      filterRsk ||
      filterAccountName,
  );

  const clearAllFilters = useCallback(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMill("");
    setFilterRsk("");
    setFilterAccountName("");
  }, []);

  const notifyIfOtherFilters = useCallback(
    (except, applyingNonEmpty) => {
      if (!applyingNonEmpty) return;
      const otherActive =
        (except !== "date" && dateRangeFilterActive) ||
        (except !== "mill" && Boolean(filterMill)) ||
        (except !== "rsk" && Boolean(filterRsk)) ||
        (except !== "account" && Boolean(filterAccountName));
      if (otherActive) {
        toast.info(
          "Other filters are already applied. Please clear all filters if you want to reset your selection.",
          { toastId: "multi-filter-truck" },
        );
      }
    },
    [dateRangeFilterActive, filterMill, filterRsk, filterAccountName],
  );

  const openDeleteModal = useCallback((row) => {
    setDeleteTarget({
      id: row.id,
      label: String(row.ptrNo ?? row.date ?? "").trim() || row.id,
    });
    setDeletePassword("");
    setDeleteError(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeletePassword("");
    setDeleteError(null);
  }, [deleteBusy]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const authRef = doc(db, "config", "auth");
      const authSnap = await getDoc(authRef);
      if (!authSnap.exists()) {
        setDeleteError("No auth config found.");
        return;
      }
      if (deletePassword !== authSnap.data()?.password) {
        setDeleteError("Incorrect password.");
        return;
      }
      await deleteDoc(doc(db, "truck_sheets", deleteTarget.id));
      toast.success("Truck sheet deleted.");
      setDeleteTarget(null);
      setDeletePassword("");
    } catch (err) {
      console.error(err);
      setDeleteError(err.message || "Could not delete.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, deletePassword]);

  const handleExportExcel = useCallback(() => {
    if (!filteredSheets || filteredSheets.length === 0) {
      toast.info("No truck sheets available to export with the current filters.");
      return;
    }

    const headers = [
      "S.NO.",
      "DATE",
      "MILL",
      "PTR NO.",
      "VEHICLE",
      "RSK",
      "ACCOUNTS",
      "NET QTL",
      "AMOUNT",
    ];

    const sheetData = [headers];
    let sumNetQtl = 0;
    let sumAmount = 0;

    filteredSheets.forEach((s, idx) => {
      const sn =
        s.serialNo != null && s.serialNo !== ""
          ? Number.isFinite(Number(s.serialNo))
            ? Number(s.serialNo)
            : String(s.serialNo)
          : idx + 1;
      const qtl = Number(s.netQuintals);
      const amt = Number(s.amount);
      const validQtl = Number.isFinite(qtl) ? qtl : 0;
      const validAmt = Number.isFinite(amt) ? amt : 0;

      sumNetQtl += validQtl;
      sumAmount += validAmt;

      const accList = accountsForDisplay(s.accounts, filterAccountName);
      const accountsSummary = accList
        .map(
          (a) =>
            `${normalizeAccountKey(a.accountName) || "Account"}: ${Number(a.quintals || 0).toFixed(2)} Qtl`,
        )
        .join("; ");

      sheetData.push([
        sn,
        formatDateDisplay(s.date) !== "—" ? formatDateDisplay(s.date) : "",
        String(s.riceMillName ?? "").trim(),
        String(s.ptrNo ?? "").trim(),
        String(s.vehicleNo ?? "").trim(),
        String(s.rsk ?? "").trim(),
        accountsSummary || "—",
        validQtl,
        validAmt,
      ]);
    });

    const totalRowIndex = filteredSheets.length + 1;
    sheetData.push([
      "Total (all rows above)",
      "",
      "",
      "",
      "",
      "",
      "",
      sumNetQtl,
      sumAmount,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 10 }, // S.NO.
      { wch: 14 }, // DATE
      { wch: 34 }, // MILL
      { wch: 16 }, // PTR NO.
      { wch: 16 }, // VEHICLE
      { wch: 20 }, // RSK
      { wch: 40 }, // ACCOUNTS
      { wch: 16 }, // NET QTL
      { wch: 20 }, // AMOUNT
    ];

    ws["!merges"] = [
      { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 6 } },
    ];

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "2D6A4F" }, patternType: "solid" },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      }
    }

    for (let rIdx = 1; rIdx <= filteredSheets.length; rIdx++) {
      const qtlRef = XLSX.utils.encode_cell({ r: rIdx, c: 7 });
      const amtRef = XLSX.utils.encode_cell({ r: rIdx, c: 8 });

      if (ws[qtlRef]) ws[qtlRef].z = "#,##0.0000";
      if (ws[amtRef]) ws[amtRef].z = '"₹"#,##0.00';
    }

    const totQtlRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 7 });
    const totAmtRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 8 });

    if (ws[totQtlRef]) ws[totQtlRef].z = "#,##0.0000";
    if (ws[totAmtRef]) ws[totAmtRef].z = '"₹"#,##0.00';

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "D1E7DD" }, patternType: "solid" },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "0F5132" } },
          alignment: { horizontal: c <= 6 ? "right" : "right", vertical: "center" },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Truck Sheet");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `Truck_Sheet_${yyyy}-${mm}-${dd}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${filteredSheets.length} truck sheet(s) to Excel.`);
  }, [filteredSheets, filterAccountName]);

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              View truck sheets
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Filter by date range, mill, RSK, or account name (accounts column
              shows only that name). Open PDFs, edit, or delete (password
              required).
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="Export displayed truck sheets to Excel"
            aria-label="Export displayed truck sheets to Excel"
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

        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-emerald-100/90 bg-white/95 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                From date
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => {
                  const v = e.target.value;
                  notifyIfOtherFilters("date", Boolean(v));
                  setFilterDateFrom(v);
                }}
                className="rounded-xl border border-emerald-100 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                To date
              </label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => {
                  const v = e.target.value;
                  notifyIfOtherFilters("date", Boolean(v));
                  setFilterDateTo(v);
                }}
                className="rounded-xl border border-emerald-100 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            {dateRangeFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setFilterDateFrom("");
                  setFilterDateTo("");
                }}
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                Clear dates
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Filter by mill
            </label>
            <select
              value={filterMill}
              onChange={(e) => {
                const v = e.target.value;
                notifyIfOtherFilters("mill", Boolean(v));
                setFilterMill(v);
              }}
              className="min-w-48 rounded-xl border border-emerald-100 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
            >
              <option value="">All mills</option>
              {millOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <NameSearchFilter
            label="Filter by RSK"
            options={rskSearchOptions}
            selectedValue={filterRsk}
            onSelectedChange={(v) => {
              notifyIfOtherFilters("rsk", Boolean(v));
              setFilterRsk(v);
            }}
            placeholder="Search RSK…"
            emptyHint="No RSK values in data"
          />
          <NameSearchFilter
            label="Filter by account name"
            options={accountSearchOptions}
            selectedValue={filterAccountName}
            onSelectedChange={(v) => {
              notifyIfOtherFilters("account", Boolean(v));
              setFilterAccountName(v);
            }}
            placeholder="Search account…"
            emptyHint="No account names in data"
          />
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-sm text-zinc-500">
              Showing{" "}
              <span className="font-semibold text-zinc-800">
                {filteredSheets.length}
              </span>{" "}
              of {sheets.length}
            </p>
            {anyFilterActive && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-emerald-100/90 bg-white shadow-lg">
          <table className="w-full min-w-[1360px] border-collapse text-left text-xs text-zinc-800">
            <thead>
              <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.65rem] font-bold uppercase tracking-wider text-white">
                <th className="sticky left-0 z-10 rounded-tl-xl border-r border-[#467C64] bg-[#2D6A4F] px-2 py-3 text-white shadow-[1px_0_0_0_#467C64]">
                  #
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  S. no.
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Date
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Mill
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  PTR no.
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Vehicle
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  RSK
                </th>
                <th className="min-w-[380px] border-r border-[#467C64] px-2 py-3">
                  Accounts
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Net Qtl
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap font-bold">
                  Amount
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  PDF
                </th>
                <th className="min-w-22 rounded-tr-xl px-2 py-3 text-center whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSheets.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No truck sheets match the filters.
                  </td>
                </tr>
              ) : (
                filteredSheets.map((s, i) => (
                  <tr
                    key={s.id}
                    className="border-b border-zinc-200/80 align-top odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40 transition-colors"
                  >
                    <td className="sticky left-0 z-1 border-r border-zinc-200 bg-inherit px-2 py-3 font-medium text-zinc-500 shadow-[2px_0_0_0_rgb(236,253,245)]">
                      {i + 1}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                      {s.serialNo != null && s.serialNo !== "" ? s.serialNo : "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                      {formatDateDisplay(s.date)}
                    </td>
                    <td className="border-r border-zinc-200 max-w-36 px-2 py-3">
                      {s.riceMillName ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono text-[0.65rem]">
                      {s.ptrNo ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-medium">
                      {s.vehicleNo ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 max-w-28 truncate px-2 py-3" title={s.rsk}>
                      {s.rsk ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 min-w-[380px] px-2 py-3 align-top">
                      <AccountsNestedTable
                        accounts={accountsForDisplay(
                          s.accounts,
                          filterAccountName,
                        )}
                        quintalRate={quintalRate}
                      />
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono font-semibold">
                      {s.netQuintals != null
                        ? Number(s.netQuintals).toFixed(4)
                        : "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-extrabold text-blue-600">
                      {s.amount != null ? formatRupees(s.amount) : "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 text-center">
                      {s.pdfUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPdfViewer({
                              url: s.pdfUrl,
                              title: String(s.ptrNo ?? s.date ?? "Truck sheet"),
                            })
                          }
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                        >
                          View PDF
                        </button>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/truck-sheet/edit/${s.id}`}
                          className="inline-flex rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100"
                          title="Edit"
                          aria-label="Edit truck sheet"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                            aria-hidden
                          >
                            <path d="M2.695 14.295L11 6.09l2.121 2.121-8.305 8.205a1 1 0 01-.465.263l-2.358.471.471-2.358a1 1 0 01.263-.465zM14.12 2.88l2.998 2.998a1 1 0 010 1.414l-1.586 1.586a1 1 0 01-1.414 0L11.12 6.88a1 1 0 010-1.414l1.586-1.586a1 1 0 011.414 0z" />
                          </svg>
                        </Link>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(s)}
                          className="inline-flex rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          title="Delete"
                          aria-label="Delete truck sheet"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                            aria-hidden
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A1.75 1.75 0 007.596 19h4.807a1.75 1.75 0 001.741-1.513l.841-10.52.149.023a.75.75 0 10-.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.224 0 .422.15.486.364l.008.014v.004a.75.75 0 01-.493.687L10 5H8a.75.75 0 01-.75-.75v-.5c0-.414.336-.75.75-.75h2z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {millOrRskFilterTotals && filteredSheets.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-emerald-300 bg-emerald-100/70 text-[0.7rem] font-semibold text-emerald-950">
                  <td colSpan={8} className="border-r border-zinc-300 bg-emerald-100/90 px-2 py-3 text-right">
                    Total (all rows above)
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono">
                    {millOrRskFilterTotals.totalQuintals.toFixed(4)}
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-extrabold text-red-600">
                    {formatRupees(millOrRskFilterTotals.totalAmount)}
                  </td>
                  <td colSpan={2} className="px-2 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {pdfViewer && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdf-viewer-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            aria-label="Close PDF viewer"
            onClick={() => setPdfViewer(null)}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
              <h3
                id="pdf-viewer-title"
                className="text-sm font-semibold text-zinc-900"
              >
                PDF — {pdfViewer.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={pdfViewer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-emerald-700 underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setPdfViewer(null)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              title="Truck sheet PDF"
              src={pdfViewer.url}
              className="min-h-[70vh] w-full flex-1 border-0 bg-zinc-100"
            />
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-truck-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={closeDeleteModal}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-xl">
            <h3
              id="delete-truck-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Delete truck sheet?
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              PTR / ref:{" "}
              <span className="font-medium text-zinc-800">
                {deleteTarget.label}
              </span>
              . Enter your app password to confirm.
            </p>
            <label className="mt-4 block text-xs font-medium text-zinc-600">
              Password
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteError(null);
                }}
                className="mt-1 w-full rounded-xl border border-emerald-100 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                autoComplete="current-password"
                disabled={deleteBusy}
              />
            </label>
            {deleteError && (
              <p className="mt-2 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteBusy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteBusy || !deletePassword.trim()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer
        position="top-right"
        autoClose={5000}
        closeOnClick
        pauseOnHover
        theme="light"
      />
    </div>
  );
}

export default ViewTruckSheet;
