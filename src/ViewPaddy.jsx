import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { ToastContainer, toast } from "react-toastify";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import {
  FarmerColumnTotalsFooter,
  FarmersNestedTable,
  farmerLineRupees,
  farmerRowMatchesFilters,
  formatTotalNetKata,
  NameSearchFilter,
} from "./paddyViewShared";
import "react-toastify/dist/ReactToastify.css";

function journeyDateKey(j) {
  const s = String(j.date ?? "").trim();
  if (!s) return "";
  return s.slice(0, 10);
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

function ViewPaddy() {
  const [journeys, setJourneys] = useState([]);
  const [workerMap, setWorkerMap] = useState({});
  const [farmerMap, setFarmerMap] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMill, setFilterMill] = useState("");
  const [filterFarmerId, setFilterFarmerId] = useState("");
  const [filterKayidhaName, setFilterKayidhaName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const openDeleteModal = useCallback((j) => {
    setDeleteTarget({
      id: j.id,
      label: String(j.date ?? "").trim() || j.id,
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

  const confirmDeleteJourney = useCallback(async () => {
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
      const expected = authSnap.data()?.password;
      if (deletePassword !== expected) {
        setDeleteError("Incorrect password.");
        return;
      }
      await deleteDoc(doc(db, "paddy_journeys", deleteTarget.id));
      toast.success("Journey deleted.");
      setDeleteTarget(null);
      setDeletePassword("");
    } catch (err) {
      console.error(err);
      setDeleteError(err.message || "Could not delete journey.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, deletePassword]);

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

  const millOptions = useMemo(() => {
    const set = new Set();
    journeys.forEach((j) => {
      const n = String(j.riceMillName ?? "").trim();
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [journeys]);

  const farmerFilterOptions = useMemo(() => {
    const ids = new Set();
    journeys.forEach((j) => {
      (Array.isArray(j.farmers) ? j.farmers : []).forEach((f) => {
        if (f?.farmerId) ids.add(f.farmerId);
      });
    });
    return Array.from(ids)
      .map((id) => ({
        id,
        name: String(farmerMap[id] ?? "").trim() || id,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [journeys, farmerMap]);

  const kayidhaFilterOptions = useMemo(() => {
    const set = new Set();
    journeys.forEach((j) => {
      (Array.isArray(j.farmers) ? j.farmers : []).forEach((f) => {
        const n =
          typeof f.kayidhaName === "string" ? f.kayidhaName.trim() : "";
        if (n) set.add(n);
      });
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [journeys]);

  const farmerSearchOptions = useMemo(
    () =>
      farmerFilterOptions.map(({ id, name }) => ({ value: id, name })),
    [farmerFilterOptions],
  );
  const kayidhaSearchOptions = useMemo(
    () => kayidhaFilterOptions.map((name) => ({ value: name, name })),
    [kayidhaFilterOptions],
  );

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
      if (filterMill && String(j.riceMillName ?? "").trim() !== filterMill)
        return false;
      if (filterFarmerId || filterKayidhaName) {
        const farmers = Array.isArray(j.farmers) ? j.farmers : [];
        if (
          !farmers.some((f) =>
            farmerRowMatchesFilters(f, filterFarmerId, filterKayidhaName),
          )
        )
          return false;
      }
      return true;
    });
  }, [
    journeys,
    filterDateFrom,
    filterDateTo,
    filterMill,
    filterFarmerId,
    filterKayidhaName,
  ]);

  /** Farmer filter → sum line ₹; else kayidha → sum net katas; else mill → sum journey totalNetKatas. */
  const filterAggregate = useMemo(() => {
    if (filterFarmerId) {
      let sum = 0;
      for (const j of filteredJourneys) {
        const farmers = Array.isArray(j.farmers) ? j.farmers : [];
        for (const f of farmers) {
          if (
            !farmerRowMatchesFilters(f, filterFarmerId, filterKayidhaName)
          )
            continue;
          const r = farmerLineRupees(f);
          if (r != null && Number.isFinite(r)) sum += r;
        }
      }
      return { kind: "lineRupees", sum, display: formatRupees(sum) };
    }
    if (filterKayidhaName) {
      let sum = 0;
      for (const j of filteredJourneys) {
        const farmers = Array.isArray(j.farmers) ? j.farmers : [];
        for (const f of farmers) {
          if (
            !farmerRowMatchesFilters(f, filterFarmerId, filterKayidhaName)
          )
            continue;
          const nk = f.netKatas;
          if (nk != null && Number.isFinite(Number(nk))) sum += Number(nk);
        }
      }
      return { kind: "netKatas", sum, display: sum.toFixed(4) };
    }
    if (filterMill) {
      let sum = 0;
      for (const j of filteredJourneys) {
        const v = j.totalNetKatas;
        if (v != null && Number.isFinite(Number(v))) sum += Number(v);
      }
      return { kind: "totalNetKata", sum, display: sum.toFixed(4) };
    }
    return null;
  }, [
    filteredJourneys,
    filterFarmerId,
    filterKayidhaName,
    filterMill,
  ]);

  const clearAllFilters = useCallback(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMill("");
    setFilterFarmerId("");
    setFilterKayidhaName("");
  }, []);

  const dateRangeFilterActive = Boolean(filterDateFrom || filterDateTo);

  const notifyIfOtherFilters = useCallback(
    (except, applyingNonEmpty) => {
      if (!applyingNonEmpty) return;
      const otherActive =
        (except !== "date" && dateRangeFilterActive) ||
        (except !== "mill" && Boolean(filterMill)) ||
        (except !== "farmer" && Boolean(filterFarmerId)) ||
        (except !== "kayidha" && Boolean(filterKayidhaName));
      if (otherActive) {
        toast.info(
          "Other filters are already applied. Please clear all filters if you want to reset your selection.",
          { toastId: "multi-filter-hint" },
        );
      }
    },
    [
      dateRangeFilterActive,
      filterMill,
      filterFarmerId,
      filterKayidhaName,
    ],
  );

  const anyFilterActive = Boolean(
    dateRangeFilterActive || filterMill || filterFarmerId || filterKayidhaName,
  );

  const workerNames = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return "—";
    return ids
      .map((id) => workerMap[id] || id)
      .filter(Boolean)
      .join(", ");
  };

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-full space-y-6">
        <div className="rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            View Paddy — Journeys
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            One row per saved journey with full details. Filter by date range,
            rice mill, or search farmer / kayidha by name.
          </p>
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
              Filter by rice mill
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
            label="Filter by farmer"
            options={farmerSearchOptions}
            selectedValue={filterFarmerId}
            onSelectedChange={(id) => {
              notifyIfOtherFilters("farmer", Boolean(id));
              setFilterFarmerId(id);
            }}
            placeholder="Type farmer name…"
            emptyHint="No farmers match"
          />
          <NameSearchFilter
            label="Filter by kayidha"
            options={kayidhaSearchOptions}
            selectedValue={filterKayidhaName}
            onSelectedChange={(name) => {
              notifyIfOtherFilters("kayidha", Boolean(name));
              setFilterKayidhaName(name);
            }}
            placeholder="Type kayidha name…"
            emptyHint="No kayidhas match"
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

        <div className="overflow-x-auto rounded-2xl border border-emerald-100/90 bg-white shadow-lg shadow-emerald-900/5">
          <table className="w-full min-w-[1240px] border-collapse text-left text-xs text-zinc-800">
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
                <th className="min-w-[720px] border-r border-[#467C64] px-2 py-3">
                  Farmers
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Total net kata
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Grand total ₹
                </th>
                <th className="min-w-22 rounded-tr-xl px-2 py-3 text-center whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredJourneys.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No journeys match the filters.
                  </td>
                </tr>
              ) : (
                <>
                  {filteredJourneys.map((j, i) => (
                    <tr
                      key={j.id}
                      className="border-b border-zinc-200/80 align-top odd:bg-white even:bg-zinc-50/50 hover:bg-emerald-50/40 transition-colors"
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
                        {Array.isArray(j.workerIds) ? j.workerIds.length : 0}
                      </td>
                      <td className="border-r border-zinc-200 min-w-40 px-2 py-3 text-[0.7rem] leading-snug">
                        {workerNames(j.workerIds)}
                      </td>
                      <td className="border-r border-zinc-200 min-w-[720px] px-2 py-3 align-top">
                        <FarmersNestedTable
                          farmers={j.farmers}
                          farmerMap={farmerMap}
                          filterFarmerId={filterFarmerId}
                          filterKayidhaName={filterKayidhaName}
                        />
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono font-semibold text-red-700">
                        {formatTotalNetKata(j.totalNetKatas)}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-semibold text-emerald-800">
                        {j.grandTotal != null
                          ? formatRupees(j.grandTotal)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/paddy/edit/${j.id}`}
                            className="inline-flex rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100"
                            title="Edit journey"
                            aria-label="Edit journey"
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
                            onClick={() => openDeleteModal(j)}
                            className="inline-flex rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                            title="Delete journey"
                            aria-label="Delete journey"
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
                  ))}
                  {filterAggregate &&
                    (filterAggregate.kind === "lineRupees" ||
                      filterAggregate.kind === "netKatas") && (
                      <tr className="border-t-2 border-emerald-200 bg-emerald-50/30 align-top">
                        <td
                          colSpan={7}
                          className="border-r border-zinc-300 px-2 py-3 text-[0.65rem] font-medium text-zinc-500"
                        />
                        <td className="min-w-[720px] border-r border-zinc-300 px-2 py-3 align-top">
                          <FarmerColumnTotalsFooter
                            kind={filterAggregate.kind}
                            display={filterAggregate.display}
                          />
                        </td>
                        <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 text-zinc-300">
                          —
                        </td>
                        <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 text-zinc-300">
                          —
                        </td>
                        <td className="px-2 py-3" />
                      </tr>
                    )}
                </>
              )}
            </tbody>
            {filterAggregate?.kind === "totalNetKata" &&
              filteredJourneys.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50/90 align-top">
                    <td colSpan={8} className="border-r border-zinc-300 px-2 py-2.5" />
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-2.5">
                      <div>
                        <p className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-900">
                          Sum of total net kata
                        </p>
                        <p className="font-mono text-sm font-semibold text-red-700 tabular-nums">
                          {filterAggregate.display}
                        </p>
                      </div>
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-2.5 text-zinc-300">
                      —
                    </td>
                    <td className="px-2 py-2.5" />
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
          aria-labelledby="delete-journey-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={closeDeleteModal}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-xl shadow-zinc-900/15">
            <h3
              id="delete-journey-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Delete journey?
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              This removes the journey for{" "}
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
                onClick={confirmDeleteJourney}
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

export default ViewPaddy;
