import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";
import {
  FarmersNestedTable,
  formatTotalNetKata,
  NameSearchFilter,
  sumKayidhaPaddyKgsForJourney,
} from "./paddyViewShared";

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

function ViewKayidhaPaddy() {
  const [journeys, setJourneys] = useState([]);
  const [workerMap, setWorkerMap] = useState({});
  const [farmerMap, setFarmerMap] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [selectedKayidhaName, setSelectedKayidhaName] = useState("");

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

  const kayidhaPaddyLineOptions = useMemo(() => {
    const set = new Set();
    journeys.forEach((j) => {
      const lines = Array.isArray(j.kayidhaPaddyLines)
        ? j.kayidhaPaddyLines
        : [];
      lines.forEach((line) => {
        const n =
          typeof line.kayidhaName === "string" ? line.kayidhaName.trim() : "";
        if (n) set.add(n);
      });
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [journeys]);

  const kayidhaSearchOptions = useMemo(
    () => kayidhaPaddyLineOptions.map((name) => ({ value: name, name })),
    [kayidhaPaddyLineOptions],
  );

  const filteredRows = useMemo(() => {
    if (!selectedKayidhaName) return [];
    return journeys
      .map((j) => ({
        j,
        lineKg: sumKayidhaPaddyKgsForJourney(j, selectedKayidhaName),
      }))
      .filter(({ lineKg }) => lineKg > 0);
  }, [journeys, selectedKayidhaName]);

  const totalKayidhaKgs = useMemo(
    () => filteredRows.reduce((acc, { lineKg }) => acc + lineKg, 0),
    [filteredRows],
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
            Individual kayidha paddy
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Pick a kayidha from kayidha paddy lines to list every journey that
            includes them, with kg for that kayidha per journey. Edit or delete
            journeys from View Paddy.
          </p>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-emerald-100/90 bg-white/95 p-4 shadow-sm">
          <NameSearchFilter
            label="Kayidha (from paddy lines)"
            options={kayidhaSearchOptions}
            selectedValue={selectedKayidhaName}
            onSelectedChange={setSelectedKayidhaName}
            placeholder="Search kayidha name…"
            emptyHint="No kayidhas in paddy lines"
          />
          <p className="text-sm text-zinc-500">
            {selectedKayidhaName ? (
              <>
                <span className="font-semibold text-zinc-800">
                  {filteredRows.length}
                </span>{" "}
                journey{filteredRows.length === 1 ? "" : "s"} with this kayidha
              </>
            ) : (
              "Select a kayidha to load journeys."
            )}
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-emerald-100/90 bg-white shadow-lg shadow-emerald-900/5">
          <table className="w-full min-w-[1340px] border-collapse text-left text-xs text-zinc-800">
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
                  Kayidha paddy (kg)
                </th>
                <th className="border-r border-[#467C64] px-2 py-3 whitespace-nowrap">
                  Total net kata
                </th>
                <th className="rounded-tr-xl px-2 py-3 whitespace-nowrap">
                  Grand total ₹
                </th>
              </tr>
            </thead>
            <tbody>
              {!selectedKayidhaName ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    Choose a kayidha above to see journeys and kg totals.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No journeys have this kayidha in kayidha paddy lines.
                  </td>
                </tr>
              ) : (
                <>
                  {filteredRows.map(({ j, lineKg }, i) => (
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
                      <td className="border-r border-zinc-200 px-2 py-3 text-[0.7rem] leading-snug">
                        {workerNames(j.workerIds)}
                      </td>
                      <td className="border-r border-zinc-200 min-w-[720px] px-2 py-3 align-top">
                        <FarmersNestedTable
                          farmers={j.farmers}
                          farmerMap={farmerMap}
                          filterFarmerId=""
                          filterKayidhaName=""
                        />
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono font-semibold tabular-nums text-emerald-900">
                        {lineKg.toFixed(2)}
                      </td>
                      <td className="border-r border-zinc-200 whitespace-nowrap px-2 py-3 font-mono font-semibold text-red-700">
                        {formatTotalNetKata(j.totalNetKatas)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 font-semibold text-emerald-800">
                        {j.grandTotal != null
                          ? formatRupees(j.grandTotal)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50/90 align-top">
                    <td
                      colSpan={8}
                      className="border-r border-zinc-300 px-2 py-3 text-right text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-900"
                    >
                      Total kg ({selectedKayidhaName})
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 font-mono text-sm font-bold tabular-nums text-emerald-900">
                      {totalKayidhaKgs.toFixed(2)}
                    </td>
                    <td className="border-r border-zinc-300 whitespace-nowrap px-2 py-3 text-zinc-300">
                      —
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-zinc-300">
                      —
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ViewKayidhaPaddy;
