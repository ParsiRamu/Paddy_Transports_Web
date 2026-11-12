import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import { formatTotalNetKata, NameSearchFilter } from "./paddyViewShared";
import {
  computeJourneyWorkerAmounts,
  formatDateDisplay,
  journeyDateKey,
  readStoredJsonMap,
  WORKER_PADDY_AMT_STORAGE_KEY,
  WORKER_RATES_STORAGE_KEY,
} from "./workersShared";
import "react-toastify/dist/ReactToastify.css";

const RATE_OPTIONS = Array.from({ length: 16 }, (_, i) => 20 + i);

function farmerBagValue(f) {
  const v = f?.bagValue ?? f?.bagValuePerKata;
  return v != null && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
}

const WORKERS_FARMER_SUBTABLE_WRAP =
  "w-full min-w-[560px] overflow-x-auto rounded-lg border border-emerald-100 bg-white";
const WORKERS_FARMER_SUBTABLE_CLASS =
  "w-full min-w-[560px] table-fixed border-collapse text-left text-[0.7rem] text-zinc-800";

function WorkersFarmersNestedTable({ farmers, farmerMap }) {
  const entries = Array.isArray(farmers) ? farmers : [];
  if (entries.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }

  return (
    <div className={WORKERS_FARMER_SUBTABLE_WRAP}>
      <table className={WORKERS_FARMER_SUBTABLE_CLASS}>
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "16%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.6rem] font-bold uppercase tracking-wider text-white">
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">
              Farmer
            </th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">
              Mode (kg)
            </th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">
              Bags
            </th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">
              Above kg
            </th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">
              Bag value
            </th>
            <th className="border-r border-[#467C64] px-2 py-2 whitespace-nowrap">
              Total kg
            </th>
            <th className="px-2 py-2 whitespace-nowrap">Net katas</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((f, idx) => {
            const name = farmerMap[f.farmerId]?.trim()
              ? farmerMap[f.farmerId]
              : "—";
            const bv = farmerBagValue(f);
            const paid = Boolean(f.isPaid);
            return (
              <tr
                key={idx}
                className={[
                  "border-b border-zinc-200/80 last:border-0",
                  paid
                    ? "bg-zinc-200/70"
                    : "odd:bg-white even:bg-zinc-50/60",
                ].join(" ")}
              >
                <td className="border-r border-zinc-200 px-2 py-2 font-medium">
                  {name}
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
                <td className="px-2 py-2 whitespace-nowrap font-mono text-red-700">
                  {f.netKatas != null ? Number(f.netKatas).toFixed(4) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ViewWorkersData() {
  const [journeys, setJourneys] = useState([]);
  const [workerMap, setWorkerMap] = useState({});
  const [farmerMap, setFarmerMap] = useState({});
  const [loadError, setLoadError] = useState(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterVehicleNo, setFilterVehicleNo] = useState("");

  const [ratesByJourney, setRatesByJourney] = useState(() =>
    readStoredJsonMap(WORKER_RATES_STORAGE_KEY),
  );
  const [workerPaddyAmtByJourney, setWorkerPaddyAmtByJourney] = useState(() =>
    readStoredJsonMap(WORKER_PADDY_AMT_STORAGE_KEY),
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        WORKER_RATES_STORAGE_KEY,
        JSON.stringify(ratesByJourney),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [ratesByJourney]);

  useEffect(() => {
    try {
      localStorage.setItem(
        WORKER_PADDY_AMT_STORAGE_KEY,
        JSON.stringify(workerPaddyAmtByJourney),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [workerPaddyAmtByJourney]);

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

    const unsubW = onSnapshot(
      collection(db, "workers"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = String(d.data().name ?? "");
        });
        setWorkerMap(map);
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
      unsubW();
      unsubF();
    };
  }, []);

  const vehicleOptions = useMemo(() => {
    const set = new Set();
    journeys.forEach((j) => {
      const v = String(j.vehicleNo ?? "").trim();
      if (v) set.add(v);
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((v) => ({ value: v, name: v }));
  }, [journeys]);

  const filteredJourneys = useMemo(() => {
    return journeys.filter((j) => {
      if (filterDateFrom || filterDateTo) {
        const d = journeyDateKey(j);
        if (!d) return false;
        let from = filterDateFrom;
        let to = filterDateTo;
        if (from && to && from > to) [from, to] = [to, from];
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (
        filterVehicleNo &&
        String(j.vehicleNo ?? "").trim() !== filterVehicleNo
      ) {
        return false;
      }
      return true;
    });
  }, [journeys, filterDateFrom, filterDateTo, filterVehicleNo]);

  const setJourneyRate = useCallback((journeyId, rateVal) => {
    setRatesByJourney((prev) => {
      const next = { ...prev };
      if (rateVal === "") {
        delete next[journeyId];
      } else {
        next[journeyId] = Number(rateVal);
      }
      return next;
    });
  }, []);

  const setJourneyWorkerPaddyAmt = useCallback((journeyId, amtVal) => {
    setWorkerPaddyAmtByJourney((prev) => {
      const next = { ...prev };
      if (amtVal === "") {
        delete next[journeyId];
      } else {
        next[journeyId] = amtVal;
      }
      return next;
    });
  }, []);

  const computeRowAmounts = useCallback(
    (j) =>
      computeJourneyWorkerAmounts(j, ratesByJourney, workerPaddyAmtByJourney),
    [ratesByJourney, workerPaddyAmtByJourney],
  );

  const tableTotals = useMemo(() => {
    let sumNetKata = 0;
    let sumTlWorkerAmt = 0;
    let hasAnyTlAmt = false;
    let sumWorkerPaddyAmt = 0;
    let hasAnyPaddyAmt = false;

    for (const j of filteredJourneys) {
      const { totalNetKata, tlWorkerAmt, workerPaddyAmt } =
        computeRowAmounts(j);
      if (totalNetKata != null) sumNetKata += totalNetKata;
      if (tlWorkerAmt != null) {
        sumTlWorkerAmt += tlWorkerAmt;
        hasAnyTlAmt = true;
      }
      if (workerPaddyAmt != null) {
        sumWorkerPaddyAmt += workerPaddyAmt;
        hasAnyPaddyAmt = true;
      }
    }
    return {
      sumNetKata,
      sumTlWorkerAmt,
      hasAnyTlAmt,
      sumWorkerPaddyAmt,
      hasAnyPaddyAmt,
    };
  }, [filteredJourneys, computeRowAmounts]);

  const clearAllFilters = useCallback(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterVehicleNo("");
  }, []);

  const anyFilterActive = Boolean(
    filterDateFrom || filterDateTo || filterVehicleNo,
  );

  const workerNames = useCallback(
    (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return "—";
      return ids
        .map((id) => workerMap[id] || id)
        .filter(Boolean)
        .join(", ");
    },
    [workerMap],
  );

  const handleExportExcel = useCallback(() => {
    if (filteredJourneys.length === 0) {
      toast.info("No worker records available to export with the current filters.");
      return;
    }

    const headers = [
      "#",
      "DATE",
      "VEHICLE NO.",
      "RICE MILL",
      "TOTAL BAGS",
      "WORKER COUNT",
      "WORKERS",
      "FARMERS",
      "TOTAL NET KATA",
      "RATE",
      "TL WORKERS AMT",
      "WORKER PADDY AMT",
      "AMOUNT PER WORKER",
    ];

    const sheetData = [headers];

    filteredJourneys.forEach((j, idx) => {
      const {
        rate,
        totalNetKata,
        workerCount,
        tlWorkerAmt,
        workerPaddyAmt,
        amountPerWorker,
      } = computeRowAmounts(j);
      const farmersSummary = (Array.isArray(j.farmers) ? j.farmers : [])
        .map((f) => {
          const fname = farmerMap[f.farmerId]?.trim() || "Farmer";
          const nk =
            f.netKatas != null && Number.isFinite(Number(f.netKatas))
              ? Number(f.netKatas).toFixed(4)
              : "0";
          return `${fname} (${nk})`;
        })
        .join("; ");

      sheetData.push([
        idx + 1,
        formatDateDisplay(j.date) !== "—" ? formatDateDisplay(j.date) : "",
        String(j.vehicleNo ?? "").trim(),
        String(j.riceMillName ?? "").trim(),
        j.totalBagsCount != null ? Number(j.totalBagsCount) : "",
        workerCount,
        workerNames(j.workerIds),
        farmersSummary || "—",
        totalNetKata != null ? totalNetKata : "",
        rate != null ? rate : "",
        tlWorkerAmt != null ? tlWorkerAmt : "",
        workerPaddyAmt != null ? workerPaddyAmt : "",
        amountPerWorker != null ? amountPerWorker : "",
      ]);
    });

    const totalRowIndex = filteredJourneys.length + 1;
    sheetData.push([
      "Total (all rows above)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      tableTotals.sumNetKata,
      "",
      tableTotals.hasAnyTlAmt ? tableTotals.sumTlWorkerAmt : "",
      tableTotals.hasAnyPaddyAmt ? tableTotals.sumWorkerPaddyAmt : "",
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 6 },
      { wch: 13 },
      { wch: 16 },
      { wch: 28 },
      { wch: 12 },
      { wch: 14 },
      { wch: 28 },
      { wch: 40 },
      { wch: 16 },
      { wch: 10 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
    ];

    ws["!merges"] = [
      { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 7 } },
    ];

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "2D6A4F" }, patternType: "solid" },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    for (let rIdx = 1; rIdx <= filteredJourneys.length; rIdx++) {
      const nkRef = XLSX.utils.encode_cell({ r: rIdx, c: 8 });
      const tlRef = XLSX.utils.encode_cell({ r: rIdx, c: 10 });
      const paddyRef = XLSX.utils.encode_cell({ r: rIdx, c: 11 });
      const perRef = XLSX.utils.encode_cell({ r: rIdx, c: 12 });

      if (ws[nkRef] && typeof ws[nkRef].v === "number")
        ws[nkRef].z = "#,##0.0000";
      if (ws[tlRef] && typeof ws[tlRef].v === "number")
        ws[tlRef].z = '"₹"#,##0.00';
      if (ws[paddyRef] && typeof ws[paddyRef].v === "number")
        ws[paddyRef].z = '"₹"#,##0.00';
      if (ws[perRef] && typeof ws[perRef].v === "number")
        ws[perRef].z = '"₹"#,##0.00';
    }

    const totNkRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 8 });
    const totTlRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 10 });
    const totPaddyRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 11 });
    if (ws[totNkRef]) ws[totNkRef].z = "#,##0.0000";
    if (ws[totTlRef] && typeof ws[totTlRef].v === "number")
      ws[totTlRef].z = '"₹"#,##0.00';
    if (ws[totPaddyRef] && typeof ws[totPaddyRef].v === "number")
      ws[totPaddyRef].z = '"₹"#,##0.00';

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "D1E7DD" }, patternType: "solid" },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: c >= 8 ? "DC2626" : "0F5132" },
          },
          alignment: { horizontal: "right", vertical: "center" },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Workers Data");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, `Workers_Data_${yyyy}-${mm}-${dd}.xlsx`);
    toast.success(`Exported ${filteredJourneys.length} row(s) to Excel.`);
  }, [filteredJourneys, computeRowAmounts, farmerMap, workerNames, tableTotals]);

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              VIEW WORKERS DATA
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Filter journeys by Date or Vehicle No. Select a Rate (20–35) and
              enter Worker Paddy Amt to calculate TL Workers Amt and Amount per
              Worker.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="Export displayed workers data to Excel"
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

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-emerald-100/90 bg-white/95 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                From date
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
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
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="rounded-xl border border-emerald-100 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            {(filterDateFrom || filterDateTo) && (
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

          <NameSearchFilter
            label="Filter by Vehicle No."
            options={vehicleOptions}
            selectedValue={filterVehicleNo}
            onSelectedChange={setFilterVehicleNo}
            placeholder="Search vehicle no…"
            emptyHint="No vehicles in data"
          />

          <div className="flex flex-wrap items-end gap-3">
            <p className="text-sm text-zinc-500">
              Showing{" "}
              <span className="font-semibold text-zinc-800">
                {filteredJourneys.length}
              </span>{" "}
              of {journeys.length}
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

        {/* Main Table */}
        <div className="overflow-x-auto rounded-2xl border border-emerald-100/90 bg-white shadow-lg shadow-emerald-900/5">
          <table className="w-full min-w-[1580px] border-collapse text-left text-xs text-zinc-800">
            <thead>
              <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.65rem] font-bold uppercase tracking-wider text-white">
                <th className="sticky left-0 z-10 rounded-tl-xl border-r border-[#467C64] bg-[#2D6A4F] px-2 py-3 text-white shadow-[1px_0_0_0_#467C64]">
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
                  Total bags
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Worker count
                </th>
                <th className="min-w-40 border-r border-[#467C64] px-2 py-3">
                  Workers
                </th>
                <th className="min-w-[560px] border-r border-[#467C64] px-2 py-3">
                  Farmers
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Total net kata
                </th>
                <th className="min-w-24 border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Rate
                </th>
                <th className="min-w-36 border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  TL workers Amt
                </th>
                <th className="min-w-36 border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Worker Paddy Amt
                </th>
                <th className="min-w-36 rounded-tr-xl px-2 py-3 whitespace-nowrap">
                  Amount per Worker
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredJourneys.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No journeys match the filters.
                  </td>
                </tr>
              ) : (
                filteredJourneys.map((j, i) => {
                  const {
                    rate,
                    workerCount,
                    tlWorkerAmt,
                    rawWorkerPaddyAmt,
                    amountPerWorker,
                  } = computeRowAmounts(j);

                  return (
                    <tr
                      key={j.id}
                      className="border-b border-zinc-200/80 align-top transition-colors odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40"
                    >
                      <td className="sticky left-0 z-1 border-r border-zinc-200 bg-inherit px-2 py-3 font-medium text-zinc-500 shadow-[2px_0_0_0_rgb(236,253,245)]">
                        {i + 1}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {formatDateDisplay(j.date)}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-medium">
                        {j.vehicleNo ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 min-w-32 px-2 py-3">
                        {j.riceMillName ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 tabular-nums">
                        {j.totalBagsCount != null ? j.totalBagsCount : "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-medium tabular-nums">
                        {workerCount}
                      </td>
                      <td className="border-r border-zinc-200 min-w-40 px-2 py-3 text-[0.7rem] leading-snug">
                        {workerNames(j.workerIds)}
                      </td>
                      <td className="border-r border-zinc-200 min-w-[560px] px-2 py-3 align-top">
                        <WorkersFarmersNestedTable
                          farmers={j.farmers}
                          farmerMap={farmerMap}
                        />
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono font-semibold text-red-700 tabular-nums">
                        {formatTotalNetKata(j.totalNetKatas)}
                      </td>
                      <td className="border-r border-zinc-200 px-2 py-2.5">
                        <select
                          value={rate != null ? String(rate) : ""}
                          onChange={(e) => setJourneyRate(j.id, e.target.value)}
                          aria-label={`Rate for journey ${i + 1}`}
                          className="w-20 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-900 shadow-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25"
                        >
                          <option value="">Rate</option>
                          {RATE_OPTIONS.map((num) => (
                            <option key={num} value={num}>
                              {num}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-r border-zinc-200 px-2 py-2.5">
                        <input
                          type="text"
                          readOnly
                          value={
                            tlWorkerAmt != null ? formatRupees(tlWorkerAmt) : ""
                          }
                          placeholder="—"
                          aria-label={`TL worker amount for journey ${i + 1}`}
                          className="w-32 cursor-default rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-emerald-900 outline-none tabular-nums"
                        />
                      </td>
                      <td className="border-r border-zinc-200 px-2 py-2.5">
                        <div className="relative flex items-center">
                          <span className="pointer-events-none absolute left-2.5 text-xs font-semibold text-zinc-400">
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={rawWorkerPaddyAmt}
                            onChange={(e) =>
                              setJourneyWorkerPaddyAmt(j.id, e.target.value)
                            }
                            placeholder="0"
                            aria-label={`Worker paddy amount for journey ${i + 1}`}
                            className="w-32 rounded-lg border border-emerald-200 bg-white py-1.5 pl-6 pr-2.5 font-mono text-xs font-semibold text-zinc-900 shadow-xs outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 tabular-nums"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <input
                          type="text"
                          readOnly
                          value={
                            amountPerWorker != null
                              ? formatRupees(amountPerWorker)
                              : ""
                          }
                          placeholder={workerCount === 0 ? "0 workers" : "—"}
                          aria-label={`Amount per worker for journey ${i + 1}`}
                          className="w-32 cursor-default rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-blue-700 outline-none tabular-nums"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredJourneys.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-emerald-300 bg-emerald-100/70 text-[0.7rem] font-semibold text-emerald-950">
                  <td
                    colSpan={8}
                    className="border-r border-zinc-300 bg-emerald-100/90 px-2 py-3 text-right"
                  >
                    Total (all rows above)
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                    {tableTotals.sumNetKata.toFixed(4)}
                  </td>
                  <td className="border-r border-zinc-300 px-2 py-3" />
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                    {tableTotals.hasAnyTlAmt
                      ? formatRupees(tableTotals.sumTlWorkerAmt)
                      : "—"}
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono font-bold text-red-600 tabular-nums">
                    {tableTotals.hasAnyPaddyAmt
                      ? formatRupees(tableTotals.sumWorkerPaddyAmt)
                      : "—"}
                  </td>
                  <td className="px-2 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
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

export default ViewWorkersData;
