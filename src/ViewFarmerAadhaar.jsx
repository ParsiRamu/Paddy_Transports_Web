import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { ToastContainer, toast } from "react-toastify";
import {
  Copy,
  Check,
  FileSpreadsheet,
  Search,
  RotateCcw,
  Plus,
  Edit2,
  Trash2,
  LayoutGrid,
  Table as TableIcon,
  CreditCard,
  User,
  ShieldCheck,
  Share2,
} from "lucide-react";
import { db } from "./firebase";
import "react-toastify/dist/ReactToastify.css";

function formatAadhaarDisplay(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

function formatDateDisplay(timestamp) {
  if (!timestamp) return "—";
  let dateObj = null;
  if (timestamp.toDate) {
    dateObj = timestamp.toDate();
  } else if (timestamp.seconds != null) {
    dateObj = new Date(timestamp.seconds * 1000);
  } else if (typeof timestamp === "string") {
    dateObj = new Date(timestamp);
  }
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "—";

  const dd = String(dateObj.getDate()).padStart(2, "0");
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export default function ViewFarmerAadhaar() {
  const [records, setRecords] = useState([]);
  const [loadError, setLoadError] = useState(null);

  // Filters & Controls
  const [filterFarmerName, setFilterFarmerName] = useState("");
  const [viewMode, setViewMode] = useState("table"); // 'table' (default) | 'cards'
  const [sortOrder, setSortOrder] = useState("newest"); // 'newest' | 'oldest' | 'alpha'
  const [copiedKey, setCopiedKey] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Real-time listener for farmer_aadhaar collection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "farmer_aadhaar"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRecords(list);
      },
      (err) => setLoadError(err.message || "Failed to load records."),
    );
    return () => unsub();
  }, []);

  // Filtered and sorted records
  const filteredRecords = useMemo(() => {
    const q = filterFarmerName.trim().toUpperCase();
    let list = records.filter((r) => {
      if (!q) return true;
      const name = String(r.farmerName ?? "").toUpperCase();
      const aadh = String(r.aadhaarNumber ?? "");
      return name.includes(q) || aadh.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sortOrder === "alpha") {
        const na = String(a.farmerName ?? "").toUpperCase();
        const nb = String(b.farmerName ?? "").toUpperCase();
        return na.localeCompare(nb);
      }
      const ta =
        a.createdAt?.seconds != null
          ? a.createdAt.seconds * 1000
          : a.createdAt?.toMillis?.() ?? 0;
      const tb =
        b.createdAt?.seconds != null
          ? b.createdAt.seconds * 1000
          : b.createdAt?.toMillis?.() ?? 0;

      return sortOrder === "oldest" ? ta - tb : tb - ta;
    });

    return list;
  }, [records, filterFarmerName, sortOrder]);

  // Copy Whole Farmer Name with Aadhaar (Entire Box)
  const handleCopyFullBox = useCallback((record, key) => {
    const name = String(record.farmerName ?? "").trim().toUpperCase();
    const aadhFormatted = formatAadhaarDisplay(record.aadhaarNumber);
    const textToCopy = `${name} - ${aadhFormatted}`;

    navigator.clipboard.writeText(textToCopy);
    setCopiedKey(key);
    toast.info(`Copied: ${textToCopy}`, { autoClose: 2000 });
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  // Copy just Aadhaar Number
  const handleCopyAadhaarOnly = useCallback((aadhaar, key) => {
    if (!aadhaar) return;
    navigator.clipboard.writeText(aadhaar);
    setCopiedKey(key);
    toast.info(`Copied Aadhaar: ${aadhaar}`, { autoClose: 1500 });
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  // Delete handler
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "farmer_aadhaar", deleteTarget.id));
      toast.success("Aadhaar record deleted.");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  // Export to Excel
  const handleExportExcel = useCallback(() => {
    if (filteredRecords.length === 0) {
      toast.info("No records to export with current filter.");
      return;
    }

    const headers = [
      "SNO:",
      "FARMER NAME",
      "AADHAAR NUMBER",
      "FORMATTED AADHAAR",
      "REGISTRATION DATE",
    ];

    const sheetData = [headers];

    filteredRecords.forEach((r, idx) => {
      const sno = idx + 1;
      const formatted = formatAadhaarDisplay(r.aadhaarNumber);
      const dateStr = formatDateDisplay(r.createdAt);

      sheetData.push([
        sno,
        String(r.farmerName ?? "").toUpperCase(),
        String(r.aadhaarNumber ?? ""),
        formatted,
        dateStr,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 8 },  // SNO:
      { wch: 38 }, // FARMER NAME
      { wch: 18 }, // AADHAAR NUMBER
      { wch: 22 }, // FORMATTED AADHAAR
      { wch: 20 }, // REGISTRATION DATE
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
          },
        };
      }
    }

    // Ensure Aadhaar numbers are stored as text string
    for (let rIdx = 1; rIdx <= filteredRecords.length; rIdx++) {
      const aadhRef = XLSX.utils.encode_cell({ r: rIdx, c: 2 });
      if (ws[aadhRef]) {
        ws[aadhRef].t = "s";
        ws[aadhRef].z = "@";
      }
    }

    // Enable auto-filter
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
    XLSX.utils.book_append_sheet(wb, ws, "Farmer Aadhaar");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `Farmer_Aadhaar_${yyyy}-${mm}-${dd}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${filteredRecords.length} Aadhaar record(s) to Excel.`);
  }, [filteredRecords]);

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <ToastContainer position="top-right" autoClose={3000} />

        {/* Top Header Card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-400/75 bg-white/90 p-6 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              FARMER AADHAAR — VIEW AADHAAR
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600">
              Access and search registered farmer Aadhaar records. Copy farmer name and Aadhaar number in one click.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/farmer-aadhaar/add"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-950/10 transition-all hover:bg-[#245840] hover:shadow-lg active:scale-[0.98]"
              title="Add a new farmer Aadhaar"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Add Aadhaar</span>
            </Link>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40"
              title="Export records to Excel"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {/* Filter & View Controls Bar */}
        <div className="space-y-4 rounded-2xl border border-zinc-400/75 bg-white/95 p-5 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Filter by Farmer Name */}
            <div className="w-full min-w-64 sm:w-80">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Filter by Farmer Name
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="search"
                  value={filterFarmerName}
                  onChange={(e) => setFilterFarmerName(e.target.value)}
                  placeholder="Search farmer name or Aadhaar…"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>
            </div>

            {/* Quick KPI Count & Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3.5 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase text-zinc-500">
                  Total Aadhaar
                </p>
                <p className="font-mono text-base font-bold text-zinc-800">
                  {records.length}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2 text-center">
                <p className="text-[0.65rem] font-semibold uppercase text-emerald-800">
                  Showing
                </p>
                <p className="font-mono text-base font-bold text-emerald-900">
                  {filteredRecords.length}
                </p>
              </div>

              {/* Sort Order Selector */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Sort
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="alpha">Farmer Name (A → Z)</option>
                </select>
              </div>

              {/* View Mode Toggle: Table (default) vs Cards */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  View
                </label>
                <div className="flex items-center rounded-xl border border-zinc-300 bg-zinc-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      viewMode === "table"
                        ? "bg-white text-emerald-950 font-semibold shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                    title="Table View (Default)"
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      viewMode === "cards"
                        ? "bg-white text-emerald-950 font-semibold shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                    title="Card / Box View"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Cards</span>
                  </button>
                </div>
              </div>

              {filterFarmerName && (
                <button
                  type="button"
                  onClick={() => setFilterFarmerName("")}
                  className="mt-5 inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                  title="Clear search filter"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content View: CARDS / BOXES VIEW */}
        {viewMode === "cards" ? (
          filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500 shadow-sm">
              <CreditCard className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
              <p className="font-semibold text-zinc-700">No Farmer Aadhaar records found.</p>
              <p className="mt-1 text-xs text-zinc-500">
                {filterFarmerName
                  ? `No records matching "${filterFarmerName}".`
                  : "Click 'Add Aadhaar' to create your first record."}
              </p>
              {filterFarmerName && (
                <button
                  type="button"
                  onClick={() => setFilterFarmerName("")}
                  className="mt-4 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-zinc-50"
                >
                  Reset filter
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredRecords.map((r, idx) => {
                const fullCopyKey = `box_${r.id}`;
                const aadhCopyKey = `aadh_${r.id}`;
                const isFullCopied = copiedKey === fullCopyKey;
                const isAadhCopied = copiedKey === aadhCopyKey;
                const formattedAadh = formatAadhaarDisplay(r.aadhaarNumber);

                return (
                  <div
                    key={r.id}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-300/80 bg-white p-5 shadow-[0_6px_20px_-4px_rgba(15,23,42,0.1)] transition-all hover:border-emerald-500/70 hover:shadow-[0_12px_28px_-4px_rgba(15,23,42,0.18)]"
                  >
                    {/* Aadhaar Card Header Badge */}
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                      <div className="flex items-center gap-1.5 text-[#2D6A4F]">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-800">
                          Farmer Aadhaar #{idx + 1}
                        </span>
                      </div>
                      <span className="text-[0.65rem] font-mono text-zinc-400">
                        {formatDateDisplay(r.createdAt)}
                      </span>
                    </div>

                    {/* Farmer Details Body */}
                    <div className="my-4 space-y-2">
                      <div>
                        <span className="text-[0.65rem] font-semibold uppercase text-zinc-400">
                          Farmer Name
                        </span>
                        <h4 className="text-base font-bold text-zinc-900 uppercase tracking-tight">
                          {r.farmerName}
                        </h4>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.65rem] font-semibold uppercase text-emerald-800">
                            Aadhaar Number
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyAadhaarOnly(r.aadhaarNumber, aadhCopyKey)
                            }
                            className="rounded p-1 text-zinc-400 hover:bg-emerald-100 hover:text-emerald-800 transition"
                            title="Copy 12-digit Aadhaar only"
                          >
                            {isAadhCopied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        <p className="mt-1 font-mono text-lg font-extrabold tracking-widest text-[#2D6A4F]">
                          {formattedAadh}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Action Section with Dedicated "Copy Entire Box" Button */}
                    <div className="border-t border-zinc-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                      {/* Copy Whole Farmer Name with Aadhaar (Entire Box) */}
                      <button
                        type="button"
                        onClick={() => handleCopyFullBox(r, fullCopyKey)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-xs transition active:scale-[0.98] ${
                          isFullCopied
                            ? "bg-emerald-600 text-white shadow-emerald-700/20"
                            : "bg-[#2D6A4F] text-white hover:bg-[#245840]"
                        }`}
                        title="Copy both farmer name and Aadhaar number to clipboard"
                      >
                        {isFullCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-white" />
                            <span>Copied Box!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="h-3.5 w-3.5" />
                            <span>Copy Name + Aadhaar</span>
                          </>
                        )}
                      </button>

                      {/* Edit & Delete Controls */}
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/farmer-aadhaar/edit/${r.id}`}
                          className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition"
                          title="Edit farmer Aadhaar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="rounded-lg border border-zinc-200 p-2 text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                          title="Delete Aadhaar record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* TABLE VIEW OPTION */
          <div className="overflow-hidden rounded-2xl border border-zinc-400/75 bg-white shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs text-zinc-800">
                <thead>
                  <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.7rem] font-bold uppercase tracking-wider text-white">
                    <th className="w-16 border-r border-[#467C64] px-3 py-3 text-center whitespace-nowrap">
                      SNO:
                    </th>
                    <th className="border-r border-[#467C64] px-4 py-3 whitespace-nowrap">
                      FARMER NAME
                    </th>
                    <th className="w-48 border-r border-[#467C64] px-3 py-3 font-mono whitespace-nowrap">
                      AADHAAR NUMBER
                    </th>
                    <th className="w-36 border-r border-[#467C64] px-3 py-3 text-center whitespace-nowrap">
                      ADDED DATE
                    </th>
                    <th className="w-56 border-r border-[#467C64] px-3 py-3 text-center whitespace-nowrap">
                      COPY WHOLE BOX
                    </th>
                    <th className="w-24 px-3 py-3 text-center whitespace-nowrap">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                        No farmer Aadhaar records found.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r, idx) => {
                      const sno = idx + 1;
                      const fullCopyKey = `tbl_box_${r.id}`;
                      const isFullCopied = copiedKey === fullCopyKey;
                      const formattedAadh = formatAadhaarDisplay(r.aadhaarNumber);

                      return (
                        <tr
                          key={r.id}
                          className="transition-colors odd:bg-white even:bg-zinc-50/60 hover:bg-emerald-50/40"
                        >
                          <td className="border-r border-zinc-200 px-3 py-2.5 text-center font-mono font-medium text-zinc-500">
                            {sno}
                          </td>
                          <td className="border-r border-zinc-200 px-4 py-2.5 font-bold uppercase text-zinc-900">
                            {r.farmerName}
                          </td>
                          <td className="border-r border-zinc-200 px-3 py-2.5 font-mono font-bold tracking-wider text-emerald-950">
                            {formattedAadh}
                          </td>
                          <td className="border-r border-zinc-200 px-3 py-2.5 text-center font-mono text-zinc-500">
                            {formatDateDisplay(r.createdAt)}
                          </td>
                          <td className="border-r border-zinc-200 px-3 py-2 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleCopyFullBox(r, fullCopyKey)}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-xs transition active:scale-[0.98] ${
                                isFullCopied
                                  ? "bg-emerald-600 text-white"
                                  : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300"
                              }`}
                              title="Copy Whole Farmer Name with Aadhaar"
                            >
                              {isFullCopied ? (
                                <>
                                  <Check className="h-3 w-3 text-white" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copy Name + Aadhaar</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <Link
                                to={`/farmer-aadhaar/edit/${r.id}`}
                                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                                title="Edit"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(r)}
                                className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
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

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-zinc-300 bg-white p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-zinc-900">
                Delete Farmer Aadhaar Record?
              </h3>
              <p className="text-sm text-zinc-600">
                Are you sure you want to delete the Aadhaar record for{" "}
                <strong className="text-zinc-900 uppercase">
                  {deleteTarget.farmerName}
                </strong>{" "}
                (Aadhaar:{" "}
                <span className="font-mono font-bold text-emerald-900">
                  {formatAadhaarDisplay(deleteTarget.aadhaarNumber)}
                </span>
                )? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                >
                  {deleting ? "Deleting…" : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
