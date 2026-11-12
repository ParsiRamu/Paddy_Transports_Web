import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import { NameSearchFilter } from "./paddyViewShared";
import {
  computeJourneyWorkerAmounts,
  formatDateDisplay,
  journeyDateKey,
  readStoredJsonMap,
  WORKER_PADDY_AMT_STORAGE_KEY,
  WORKER_RATES_STORAGE_KEY,
} from "./workersShared";
import "react-toastify/dist/ReactToastify.css";

function WorkersPay() {
  const [journeys, setJourneys] = useState([]);
  const [workerMap, setWorkerMap] = useState({});
  const [loadError, setLoadError] = useState(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterVehicleNo, setFilterVehicleNo] = useState("");
  const [filterWorkerId, setFilterWorkerId] = useState("");

  const [ratesByJourney, setRatesByJourney] = useState(() =>
    readStoredJsonMap(WORKER_RATES_STORAGE_KEY),
  );
  const [workerPaddyAmtByJourney, setWorkerPaddyAmtByJourney] = useState(() =>
    readStoredJsonMap(WORKER_PADDY_AMT_STORAGE_KEY),
  );

  // Sync rates and worker paddy amounts if updated from View Workers Data
  useEffect(() => {
    const syncFromStorage = () => {
      setRatesByJourney(readStoredJsonMap(WORKER_RATES_STORAGE_KEY));
      setWorkerPaddyAmtByJourney(
        readStoredJsonMap(WORKER_PADDY_AMT_STORAGE_KEY),
      );
    };
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
    };
  }, []);

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

    return () => {
      unsubJ();
      unsubW();
    };
  }, []);

  /** All unique workers included across View Workers Data journeys, sorted by name. */
  const workerColumns = useMemo(() => {
    const ids = new Set();
    journeys.forEach((j) => {
      (Array.isArray(j.workerIds) ? j.workerIds : []).forEach((id) => {
        if (id) ids.add(id);
      });
    });
    return Array.from(ids)
      .map((id) => ({
        id,
        name: String(workerMap[id] ?? "").trim() || id,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [journeys, workerMap]);

  const workerSearchOptions = useMemo(
    () => workerColumns.map((w) => ({ value: w.id, name: w.name })),
    [workerColumns],
  );

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
      if (filterWorkerId) {
        const ids = Array.isArray(j.workerIds) ? j.workerIds : [];
        if (!ids.includes(filterWorkerId)) return false;
      }
      return true;
    });
  }, [
    journeys,
    filterDateFrom,
    filterDateTo,
    filterVehicleNo,
    filterWorkerId,
  ]);

  /** Row computations + totals per worker column across filtered journeys. */
  const { rowDetails, totalBagsSum, workerTotalsById } = useMemo(() => {
    let bagsSum = 0;
    const totalsMap = {};
    for (const w of workerColumns) {
      totalsMap[w.id] = { sum: 0, presentCount: 0, hasComputedAmt: false };
    }

    const details = [];
    for (const j of filteredJourneys) {
      const bags =
        j.totalBagsCount != null && Number.isFinite(Number(j.totalBagsCount))
          ? Number(j.totalBagsCount)
          : 0;
      bagsSum += bags;

      const workerIdsSet = new Set(
        Array.isArray(j.workerIds) ? j.workerIds : [],
      );
      const { workerCount, amountPerWorker } = computeJourneyWorkerAmounts(
        j,
        ratesByJourney,
        workerPaddyAmtByJourney,
      );

      for (const id of workerIdsSet) {
        if (!totalsMap[id]) {
          totalsMap[id] = { sum: 0, presentCount: 0, hasComputedAmt: false };
        }
        totalsMap[id].presentCount += 1;
        if (amountPerWorker != null) {
          totalsMap[id].sum += amountPerWorker;
          totalsMap[id].hasComputedAmt = true;
        }
      }

      details.push({ j, workerIdsSet, workerCount, amountPerWorker });
    }

    return {
      rowDetails: details,
      totalBagsSum: bagsSum,
      workerTotalsById: totalsMap,
    };
  }, [
    filteredJourneys,
    workerColumns,
    ratesByJourney,
    workerPaddyAmtByJourney,
  ]);

  const clearAllFilters = useCallback(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterVehicleNo("");
    setFilterWorkerId("");
  }, []);

  const anyFilterActive = Boolean(
    filterDateFrom || filterDateTo || filterVehicleNo || filterWorkerId,
  );

  const handleExportExcel = useCallback(() => {
    if (rowDetails.length === 0) {
      toast.info("No worker pay records available to export.");
      return;
    }

    const fixedHeaders = [
      "#",
      "DATE",
      "VEHICLE NO.",
      "RICE MILL",
      "TOTAL BAGS",
      "WORKER COUNT",
    ];
    const workerHeaders = workerColumns.map((w) => w.name.toUpperCase());
    const headers = [...fixedHeaders, ...workerHeaders];

    const sheetData = [headers];

    rowDetails.forEach(
      ({ j, workerIdsSet, workerCount, amountPerWorker }, idx) => {
        const row = [
          idx + 1,
          formatDateDisplay(j.date) !== "—" ? formatDateDisplay(j.date) : "",
          String(j.vehicleNo ?? "").trim(),
          String(j.riceMillName ?? "").trim(),
          j.totalBagsCount != null ? Number(j.totalBagsCount) : "",
          workerCount,
        ];

        workerColumns.forEach((w) => {
          if (workerIdsSet.has(w.id)) {
            row.push(amountPerWorker != null ? amountPerWorker : 0);
          } else {
            row.push(0);
          }
        });

        sheetData.push(row);
      },
    );

    const totalRowIndex = rowDetails.length + 1;
    const totalRow = [
      "Total (all rows above)",
      "",
      "",
      "",
      totalBagsSum,
      "",
      ...workerColumns.map((w) => workerTotalsById[w.id]?.sum ?? 0),
    ];
    sheetData.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws["!cols"] = [
      { wch: 6 }, // #
      { wch: 13 }, // DATE
      { wch: 16 }, // VEHICLE NO.
      { wch: 30 }, // RICE MILL
      { wch: 12 }, // TOTAL BAGS
      { wch: 14 }, // WORKER COUNT
      ...workerColumns.map((w) => ({
        wch: Math.max(15, w.name.length + 4),
      })),
    ];

    ws["!merges"] = [
      { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 3 } },
    ];

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
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    // Format worker pay cells: currency when > 0, "×" when 0 (absent / unset)
    for (let rIdx = 1; rIdx <= rowDetails.length; rIdx++) {
      for (let wIdx = 0; wIdx < workerColumns.length; wIdx++) {
        const cIdx = fixedHeaders.length + wIdx;
        const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
        if (ws[ref] && typeof ws[ref].v === "number") {
          ws[ref].z = '"₹"#,##0.00;-"₹"#,##0.00;"×"';
        }
      }
    }

    const totBagsRef = XLSX.utils.encode_cell({ r: totalRowIndex, c: 4 });
    if (ws[totBagsRef]) ws[totBagsRef].z = "#,##0";

    for (let wIdx = 0; wIdx < workerColumns.length; wIdx++) {
      const cIdx = fixedHeaders.length + wIdx;
      const ref = XLSX.utils.encode_cell({ r: totalRowIndex, c: cIdx });
      if (ws[ref] && typeof ws[ref].v === "number") {
        ws[ref].z = '"₹"#,##0.00';
      }
    }

    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      if (ws[ref]) {
        ws[ref].s = {
          fill: { fgColor: { rgb: "D1E7DD" }, patternType: "solid" },
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: c >= 4 ? "DC2626" : "0F5132" },
          },
          alignment: { horizontal: "right", vertical: "center" },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Workers Pay");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, `Workers_Pay_${yyyy}-${mm}-${dd}.xlsx`);
    toast.success(`Exported ${rowDetails.length} row(s) to Excel.`);
  }, [rowDetails, workerColumns, totalBagsSum, workerTotalsById]);

  const totalColSpan = 6 + workerColumns.length;

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        {/* Header Card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-400/75 bg-white/90 p-6 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              WORKERS PAY
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Vehicle and date-wise payout matrix for every worker in View
              Workers Data. Absent workers on a vehicle/date are shown as{" "}
              <span className="font-bold text-zinc-800">×</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="Export Workers Pay table to Excel"
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
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-zinc-400/75 bg-white/95 p-4 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                From date
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-[0_2px_6px_-1px_rgba(15,23,42,0.08)] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
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
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-[0_2px_6px_-1px_rgba(15,23,42,0.08)] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
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

          <NameSearchFilter
            label="Filter by Worker Name"
            options={workerSearchOptions}
            selectedValue={filterWorkerId}
            onSelectedChange={setFilterWorkerId}
            placeholder="Search worker…"
            emptyHint="No workers in data"
          />

          <div className="flex flex-wrap items-end gap-3">
            <p className="text-sm text-zinc-500">
              Showing{" "}
              <span className="font-semibold text-zinc-800">
                {rowDetails.length}
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

        {/* Workers Pay Matrix Table */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-400/75 bg-white shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)]">
          <table className="w-full min-w-[960px] border-collapse text-left text-xs text-zinc-800">
            <thead>
              <tr className="border-b border-[#245840] bg-[#2D6A4F] text-[0.65rem] font-bold uppercase tracking-wider text-white">
                <th className="sticky left-0 z-10 rounded-tl-xl border-r border-[#467C64] bg-[#2D6A4F] px-2.5 py-3 text-white shadow-[1px_0_0_0_#467C64]">
                  #
                </th>
                <th className="border-r border-[#467C64] px-2.5 py-3 whitespace-nowrap">
                  Date
                </th>
                <th className="border-r border-[#467C64] px-2.5 py-3 whitespace-nowrap">
                  Vehicle no.
                </th>
                <th className="min-w-44 border-r border-[#467C64] px-2.5 py-3 whitespace-nowrap">
                  Rice mill
                </th>
                <th className="border-r border-[#467C64] px-2.5 py-3 whitespace-nowrap">
                  Total bags
                </th>
                <th
                  className={`px-2.5 py-3 whitespace-nowrap ${
                    workerColumns.length === 0
                      ? "rounded-tr-xl"
                      : "border-r border-[#467C64]"
                  }`}
                >
                  Worker count
                </th>
                {workerColumns.map((w, idx) => {
                  const isLast = idx === workerColumns.length - 1;
                  const isHighlighted = filterWorkerId === w.id;
                  return (
                    <th
                      key={w.id}
                      className={[
                        "min-w-28 px-2.5 py-3 text-right whitespace-nowrap",
                        isLast ? "rounded-tr-xl" : "border-r border-[#467C64]",
                        isHighlighted ? "bg-[#1f513b]" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {w.name}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rowDetails.length === 0 ? (
                <tr>
                  <td
                    colSpan={totalColSpan}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No journeys match the filters.
                  </td>
                </tr>
              ) : (
                rowDetails.map(
                  (
                    { j, workerIdsSet, workerCount, amountPerWorker },
                    idx,
                  ) => (
                    <tr
                      key={j.id}
                      className="border-b border-zinc-200/80 align-middle transition-colors odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40"
                    >
                      <td className="sticky left-0 z-1 border-r border-zinc-200 bg-inherit px-2.5 py-3 font-medium text-zinc-500 shadow-[2px_0_0_0_rgb(236,253,245)]">
                        {idx + 1}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2.5 py-3 tabular-nums">
                        {formatDateDisplay(j.date)}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2.5 py-3 font-medium">
                        {j.vehicleNo ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 min-w-44 px-2.5 py-3">
                        {j.riceMillName ?? "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2.5 py-3 tabular-nums">
                        {j.totalBagsCount != null ? j.totalBagsCount : "—"}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2.5 py-3 font-medium tabular-nums">
                        {workerCount}
                      </td>
                      {workerColumns.map((w, wIdx) => {
                        const isLast = wIdx === workerColumns.length - 1;
                        const isPresent = workerIdsSet.has(w.id);
                        const isHighlighted = filterWorkerId === w.id;
                        return (
                          <td
                            key={w.id}
                            className={[
                              "whitespace-nowrap px-2.5 py-3 text-right font-mono tabular-nums",
                              isLast ? "" : "border-r border-zinc-200",
                              isHighlighted ? "bg-emerald-50/50" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {isPresent ? (
                              amountPerWorker != null ? (
                                <span className="font-semibold text-emerald-800">
                                  {formatRupees(amountPerWorker)}
                                </span>
                              ) : (
                                <span
                                  className="text-amber-600"
                                  title="Present — set Rate or Worker Paddy Amt in View Workers Data"
                                >
                                  —
                                </span>
                              )
                            ) : (
                              <span
                                className="inline-block font-sans text-sm font-semibold text-zinc-400"
                                title="Absent on this date / vehicle"
                              >
                                ×
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ),
                )
              )}
            </tbody>
            {rowDetails.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-emerald-300 bg-emerald-100/70 text-[0.7rem] font-semibold text-emerald-950">
                  <td
                    colSpan={4}
                    className="border-r border-zinc-300 bg-emerald-100/90 px-2.5 py-3 text-right"
                  >
                    Total (all rows above)
                  </td>
                  <td className="border-r border-zinc-300 whitespace-nowrap px-2.5 py-3 font-mono font-bold text-red-600 tabular-nums">
                    {totalBagsSum.toLocaleString("en-IN")}
                  </td>
                  <td className="border-r border-zinc-300 px-2.5 py-3" />
                  {workerColumns.map((w, wIdx) => {
                    const isLast = wIdx === workerColumns.length - 1;
                    const stat = workerTotalsById[w.id];
                    return (
                      <td
                        key={w.id}
                        className={[
                          "whitespace-nowrap px-2.5 py-3 text-right font-mono font-bold text-red-600 tabular-nums",
                          isLast ? "" : "border-r border-zinc-300",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {stat?.hasComputedAmt
                          ? formatRupees(stat.sum)
                          : formatRupees(0)}
                      </td>
                    );
                  })}
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

export default WorkersPay;
