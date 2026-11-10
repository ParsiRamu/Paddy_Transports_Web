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

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatKg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
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

function sumOtherNecessitiesAmounts(record) {
  const arr = Array.isArray(record.otherNecessities)
    ? record.otherNecessities
    : [];
  let s = 0;
  for (const o of arr) {
    s += numOrZero(o?.amount);
  }
  return s;
}

const OTHERS_SUB_WRAP =
  "w-full min-w-[200px] max-w-xs overflow-x-auto rounded-lg border border-emerald-100 bg-white";
const OTHERS_SUB_TABLE =
  "w-full border-collapse text-left text-[0.7rem] text-zinc-800";

function OthersNestedTable({ items }) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }
  const lineTotal = rows.reduce(
    (acc, o) => acc + numOrZero(o?.amount),
    0,
  );
  return (
    <div className={OTHERS_SUB_WRAP}>
      <table className={OTHERS_SUB_TABLE}>
        <thead>
          <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.6rem] font-bold uppercase tracking-wider text-white">
            <th className="border-r border-[#467C64] px-2 py-1.5 whitespace-nowrap">Reason</th>
            <th className="px-2 py-1.5 whitespace-nowrap text-right">Amt (₹)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o, idx) => (
            <tr
              key={idx}
              className="border-b border-zinc-200/80 last:border-0 odd:bg-white even:bg-zinc-50/60"
            >
              <td className="border-r border-zinc-200 px-2 py-1.5 font-medium">
                {String(o?.reason ?? "").trim() || "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-emerald-900">
                {formatRupees(o?.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-emerald-200 bg-emerald-100/50 text-[0.65rem] font-semibold text-emerald-950">
            <td className="border-r border-zinc-200 px-2 py-1.5">Subtotal</td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums">
              {formatRupees(lineTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ViewDriverData() {
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [filterMill, setFilterMill] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "driver_data"),
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
        setRows(list);
      },
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, []);

  const millOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      const n = String(r.riceMillName ?? "").trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [rows]);

  const driverOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      const n = String(r.driverName ?? "").trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [rows]);

  const driverSearchOptions = useMemo(
    () => driverOptions.map((name) => ({ value: name, name })),
    [driverOptions],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (
        filterMill &&
        String(r.riceMillName ?? "").trim() !== filterMill
      ) {
        return false;
      }
      if (
        filterDriver &&
        String(r.driverName ?? "").trim() !== filterDriver
      ) {
        return false;
      }
      return true;
    });
  }, [rows, filterMill, filterDriver]);

  const driverFilterTotals = useMemo(() => {
    if (!filterDriver) return null;
    let sumAdvance = 0;
    let sumLoading = 0;
    let sumOthers = 0;
    let sumNetWt = 0;
    for (const r of filteredRows) {
      sumAdvance += numOrZero(r.advanceAmt);
      sumLoading += numOrZero(r.loadingAmt);
      sumOthers += sumOtherNecessitiesAmounts(r);
      sumNetWt += numOrZero(r.millNetWtKgs);
    }
    return { sumAdvance, sumLoading, sumOthers, sumNetWt };
  }, [filteredRows, filterDriver]);

  const clearFilters = useCallback(() => {
    setFilterMill("");
    setFilterDriver("");
  }, []);

  const anyFilter = Boolean(filterMill || filterDriver);

  const openDeleteModal = useCallback((row) => {
    setDeleteTarget({
      id: row.id,
      label:
        `${String(row.driverName ?? "").trim() || "Driver"} · ${formatDateDisplay(row.date) !== "—" ? formatDateDisplay(row.date) : row.id}`,
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
      await deleteDoc(doc(db, "driver_data", deleteTarget.id));
      toast.success("Record deleted.");
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
    if (!filteredRows || filteredRows.length === 0) {
      toast.info("No driver records available to export with the current filters.");
      return;
    }

    const headers = [
      "S.NO.",
      "DATE",
      "MILL",
      "VEHICLE",
      "DRIVER",
      "MILL NET WT (KG)",
      "ADVANCE AMT",
      "LOADING AMT",
      "OTHER NECESSITIES",
    ];

    const sheetData = [headers];
    let sumAdvance = 0;
    let sumLoading = 0;
    let sumOthers = 0;
    let sumNetWt = 0;

    filteredRows.forEach((r, idx) => {
      const sn =
        r.serialNo != null && r.serialNo !== ""
          ? Number.isFinite(Number(r.serialNo))
            ? Number(r.serialNo)
            : String(r.serialNo)
          : idx + 1;
      const adv = numOrZero(r.advanceAmt);
      const loading = numOrZero(r.loadingAmt);
      const others = sumOtherNecessitiesAmounts(r);
      const netWt = numOrZero(r.millNetWtKgs);

      sumAdvance += adv;
      sumLoading += loading;
      sumOthers += others;
      sumNetWt += netWt;

      sheetData.push([
        sn,
        formatDateDisplay(r.date) !== "—" ? formatDateDisplay(r.date) : "",
        String(r.riceMillName ?? "").trim(),
        String(r.vehicleNo ?? "").trim(),
        String(r.driverName ?? "").trim(),
        netWt,
        adv,
        loading,
        others,
      ]);
    });

    // Totals row at the bottom
    const totalRowIndex = filteredRows.length + 1;
    sheetData.push([
      "Total (all rows above)",
      "",
      "",
      "",
      "",
      sumNetWt,
      sumAdvance,
      sumLoading,
      sumOthers,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Appropriate column widths
    ws["!cols"] = [
      { wch: 10 }, // S.NO.
      { wch: 14 }, // DATE
      { wch: 34 }, // MILL
      { wch: 16 }, // VEHICLE
      { wch: 24 }, // DRIVER
      { wch: 20 }, // MILL NET WT (KG)
      { wch: 16 }, // ADVANCE AMT
      { wch: 16 }, // LOADING AMT
      { wch: 20 }, // OTHER NECESSITIES
    ];

    // Merge A:E for totals row label
    ws["!merges"] = [
      { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 4 } },
    ];

    // Header styling
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

    // Data rows numeric formatting
    for (let rIdx = 1; rIdx <= filteredRows.length; rIdx++) {
      const wtRef = XLSX.utils.encode_cell({ r: rIdx, c: 5 });
      const advRef = XLSX.utils.encode_cell({ r: rIdx, c: 6 });
      const loadRef = XLSX.utils.encode_cell({ r: rIdx, c: 7 });
      const othersRef = XLSX.utils.encode_cell({ r: rIdx, c: 8 });

      if (ws[wtRef]) ws[wtRef].z = '#,##0.00';
      if (ws[advRef]) ws[advRef].z = '"₹"#,##0.00';
      if (ws[loadRef]) ws[loadRef].z = '"₹"#,##0.00';
      if (ws[othersRef]) ws[othersRef].z = '"₹"#,##0.00';
    }

    // Totals row numeric formatting and styling
    const totWtRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 5 });
    const totAdvRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 6 });
    const totLoadRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 7 });
    const totOthersRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 8 });

    if (ws[totWtRef]) ws[totWtRef].z = '#,##0.00';
    if (ws[totAdvRef]) ws[totAdvRef].z = '"₹"#,##0.00';
    if (ws[totLoadRef]) ws[totLoadRef].z = '"₹"#,##0.00';
    if (ws[totOthersRef]) ws[totOthersRef].z = '"₹"#,##0.00';

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "D1E7DD" }, patternType: "solid" },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: c >= 5 ? "DC2626" : "0F5132" },
          },
          alignment: { horizontal: c <= 4 ? "right" : "right", vertical: "center" },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Driver Data");

    // Dynamic filename using current date: Driver_Data_YYYY-MM-DD.xlsx
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `Driver_Data_${yyyy}-${mm}-${dd}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${filteredRows.length} driver record(s) to Excel.`);
  }, [filteredRows]);

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              VIEW DRIVER DATA
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Filter by mill or driver. Edit or delete (password required).
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="Export displayed driver records to Excel"
            aria-label="Export displayed driver records to Excel"
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
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Filter by mill
            </label>
            <select
              value={filterMill}
              onChange={(e) => setFilterMill(e.target.value)}
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
            label="Filter by driver name"
            options={driverSearchOptions}
            selectedValue={filterDriver}
            onSelectedChange={setFilterDriver}
            placeholder="Search driver…"
            emptyHint="No driver names in data"
          />
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-sm text-zinc-500">
              Showing{" "}
              <span className="font-semibold text-zinc-800">
                {filteredRows.length}
              </span>{" "}
              of {rows.length}
            </p>
            {anyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-emerald-100/90 bg-white shadow-lg">
          <table className="w-full min-w-[1280px] border-collapse text-left text-xs text-zinc-800">
            <thead>
              <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.65rem] font-bold uppercase tracking-wider text-white">
                <th className="rounded-tl-xl border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
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
                  Vehicle
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Driver
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Mill net wt (kg)
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Advance amt
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Loading amt
                </th>
                <th className="min-w-[220px] border-r border-[#467C64] px-2 py-3">
                  Other necessities
                </th>
                <th className="min-w-22 rounded-tr-xl px-2 py-3 text-center whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No records match the filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-200/80 align-top odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40 transition-colors"
                  >
                    <td className="border-r border-zinc-200 px-2 py-3 text-center font-medium text-zinc-500">
                      {i + 1}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                      {r.serialNo != null && r.serialNo !== ""
                        ? r.serialNo
                        : "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                      {formatDateDisplay(r.date)}
                    </td>
                    <td className="border-r border-zinc-200 max-w-40 px-2 py-3">
                      {r.riceMillName ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-medium">
                      {r.vehicleNo ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 max-w-36 px-2 py-3 font-medium">
                      {r.driverName ?? "—"}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono tabular-nums">
                      {formatKg(r.millNetWtKgs)}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-semibold text-emerald-900">
                      {formatRupees(r.advanceAmt)}
                    </td>
                    <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-semibold text-emerald-900">
                      {formatRupees(r.loadingAmt)}
                    </td>
                    <td className="border-r border-zinc-200 min-w-[220px] px-2 py-3 align-top">
                      <OthersNestedTable items={r.otherNecessities} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/drivers/edit/${r.id}`}
                          className="inline-flex rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100"
                          title="Edit"
                          aria-label="Edit record"
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
                          onClick={() => openDeleteModal(r)}
                          className="inline-flex rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          title="Delete"
                          aria-label="Delete record"
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
            {driverFilterTotals && filteredRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-emerald-300 bg-emerald-100/70 text-[0.7rem] font-semibold text-emerald-950">
                  <td colSpan={6} className="border-r border-zinc-300 bg-emerald-100/90 px-2 py-3 text-right">
                    Total (all rows above)
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                    {formatKg(driverFilterTotals.sumNetWt)}
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-bold text-red-600">
                    {formatRupees(driverFilterTotals.sumAdvance)}
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-bold text-red-600">
                    {formatRupees(driverFilterTotals.sumLoading)}
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-bold text-red-600">
                    {formatRupees(driverFilterTotals.sumOthers)}
                  </td>
                  <td className="px-2 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-driver-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={closeDeleteModal}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-xl">
            <h3
              id="delete-driver-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Delete driver record?
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
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

export default ViewDriverData;
