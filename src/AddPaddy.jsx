import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { formatRupees } from "./formatRupees";

const KATA_KG = 75;
const WEIGHT_MODES = [75, 70, 40];

/** Kg → kata (1 kata = 75 kg): value / 75 */
function kgToKata(kgRaw) {
  if (kgRaw === "" || kgRaw == null) return 0;
  const n = Number(kgRaw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n / KATA_KG;
}

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/** totalKg = bags * mode + aboveKgs; netKatas = totalKg / 75; amount = netKatas × bag value */
function computeFarmerLine(weightMode, bags, aboveKgs, valuePrice) {
  const m = Number(weightMode);
  const b = Number(bags);
  const a = Number(aboveKgs);
  const p = Number(valuePrice);
  if (
    ![75, 70, 40].includes(m) ||
    !Number.isFinite(b) ||
    !Number.isFinite(a) ||
    !Number.isFinite(p)
  ) {
    return null;
  }
  if (b < 0 || a < 0 || p < 0) return null;
  const totalKg = b * m + a;
  const netKatas = totalKg / KATA_KG;
  const lineTotal = netKatas * p;
  return { totalKg, netKatas, lineTotal };
}

function Modal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-6 shadow-xl shadow-emerald-900/15">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="modal-title" className="text-lg font-semibold text-zinc-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-emerald-50 hover:text-zinc-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SearchEntityPicker({
  label,
  items,
  selectedId,
  onSelect,
  excludeIds,
  search,
  onSearchChange,
  emptyHint,
  onCreateClick,
  disabled,
  searchPlaceholder = "Search by name…",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const exclude = useMemo(
    () => new Set(excludeIds.filter(Boolean)),
    [excludeIds],
  );
  const filtered = useMemo(() => {
    const q = normalizeName(search);
    return items.filter((it) => {
      if (exclude.has(it.id)) return false;
      if (!q) return true;
      return normalizeName(it.name).includes(q);
    });
  }, [items, exclude, search]);

  const selected = items.find((x) => x.id === selectedId);

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

  return (
    <div className="relative" ref={rootRef}>
      {label ? (
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          {label}
        </label>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[42px] flex-1 items-center justify-between rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-sm text-zinc-900 shadow-sm hover:border-emerald-200 disabled:opacity-50"
        >
          <span className={selected ? "font-medium" : "text-zinc-400"}>
            {selected ? selected.name : "Select…"}
          </span>
          <span className="text-zinc-400">▾</span>
        </button>
        <button
          type="button"
          onClick={onCreateClick}
          className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          + New
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-emerald-100 bg-white p-2 shadow-lg">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
            autoFocus
          />
          <ul className="max-h-48 overflow-auto text-sm">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-zinc-500">
                {emptyHint}
              </li>
            ) : (
              filtered.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-emerald-50"
                    onClick={() => {
                      onSelect(it.id);
                      setOpen(false);
                      onSearchChange("");
                    }}
                  >
                    {it.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function AddPaddy() {
  const { journeyId: editJourneyId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(editJourneyId);

  const [workers, setWorkers] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [riceMills, setRiceMills] = useState([]);
  const [kayidhas, setKayidhas] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyLoadError, setJourneyLoadError] = useState(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vehicleId, setVehicleId] = useState("");
  const [millId, setMillId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [millSearch, setMillSearch] = useState("");
  const [totalBagsCount, setTotalBagsCount] = useState("");
  const [jattuPaddyKgs, setJattuPaddyKgs] = useState("");
  const [kayidhaPaddyLineCount, setKayidhaPaddyLineCount] = useState(0);
  const [kayidhaPaddyLines, setKayidhaPaddyLines] = useState([]);
  const [kayidhaPaddySearchByLine, setKayidhaPaddySearchByLine] = useState(
    {},
  );

  const [workerCount, setWorkerCount] = useState(0);
  const [workerSlotIds, setWorkerSlotIds] = useState([]);
  const [workerSearchBySlot, setWorkerSearchBySlot] = useState({});

  const [farmerCount, setFarmerCount] = useState(0);
  const [farmerRows, setFarmerRows] = useState([]);
  const [farmerSearchByRow, setFarmerSearchByRow] = useState({});
  const [kayidhaSearchByRow, setKayidhaSearchByRow] = useState({});

  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [farmerModalOpen, setFarmerModalOpen] = useState(false);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [millModalOpen, setMillModalOpen] = useState(false);
  const [kayidhaModalOpen, setKayidhaModalOpen] = useState(false);
  const [kayidhaModalForRow, setKayidhaModalForRow] = useState(null);
  const [kayidhaModalForPaddyLineIdx, setKayidhaModalForPaddyLineIdx] =
    useState(null);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newFarmerName, setNewFarmerName] = useState("");
  const [newVehicleNo, setNewVehicleNo] = useState("");
  const [newMillName, setNewMillName] = useState("");
  const [newKayidhaName, setNewKayidhaName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const emptyWorkersPrompted = useRef(false);

  useEffect(() => {
    const unsubW = onSnapshot(
      collection(db, "workers"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          }),
        );
        setWorkers(list);
      },
      (err) => setLoadError(err.message),
    );
    const unsubF = onSnapshot(
      collection(db, "farmers"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          }),
        );
        setFarmers(list);
      },
      (err) => setLoadError(err.message),
    );
    const unsubVeh = onSnapshot(
      collection(db, "vehicles"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.number || "").localeCompare(
            String(b.number || ""),
            undefined,
            {
              sensitivity: "base",
            },
          ),
        );
        setVehicles(list);
      },
      (err) => setLoadError(err.message),
    );
    const unsubMill = onSnapshot(
      collection(db, "rice_mills"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          }),
        );
        setRiceMills(list);
      },
      (err) => setLoadError(err.message),
    );
    const unsubKay = onSnapshot(
      collection(db, "kayidhas"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          }),
        );
        setKayidhas(list);
      },
      (err) => setLoadError(err.message),
    );
    return () => {
      unsubW();
      unsubF();
      unsubVeh();
      unsubMill();
      unsubKay();
    };
  }, []);

  useEffect(() => {
    if (!editJourneyId) {
      setJourneyLoadError(null);
      setJourneyLoading(false);
      return;
    }
    let cancelled = false;
    setJourneyLoading(true);
    setJourneyLoadError(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "paddy_journeys", editJourneyId));
        if (cancelled) return;
        if (!snap.exists()) {
          setJourneyLoadError("This journey was not found.");
          setJourneyLoading(false);
          return;
        }
        const data = snap.data();
        const [vehSnap, millSnap] = await Promise.all([
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "rice_mills")),
        ]);
        const vehList = vehSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        const millList = millSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const dStr = data.date;
        setDate(
          typeof dStr === "string" && dStr
            ? dStr.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        );

        const vNo = String(data.vehicleNo ?? "").trim();
        const vHit = vehList.find(
          (x) => String(x.number ?? "").trim() === vNo,
        );
        setVehicleId(vHit?.id ?? "");

        const millName = String(data.riceMillName ?? "").trim();
        const mHit = millList.find(
          (x) => String(x.name ?? "").trim() === millName,
        );
        setMillId(mHit?.id ?? "");

        setTotalBagsCount(
          data.totalBagsCount != null ? String(data.totalBagsCount) : "",
        );
        setJattuPaddyKgs(
          data.jattuPaddyKgs != null ? String(data.jattuPaddyKgs) : "",
        );

        const wids = (
          Array.isArray(data.workerIds) ? data.workerIds : []
        )
          .filter(Boolean)
          .slice(0, 50);
        setWorkerSlotIds(wids.length ? [...wids] : []);
        setWorkerCount(wids.length);

        const farmersRaw = Array.isArray(data.farmers) ? data.farmers : [];
        const rows = farmersRaw.map((f) => ({
          farmerId: f.farmerId || "",
          kayidhaId: f.kayidhaId || "",
          weightMode: [75, 70, 40].includes(Number(f.weightMode))
            ? Number(f.weightMode)
            : 75,
          bags: f.bags != null ? String(f.bags) : "",
          aboveKgs: f.aboveKgs != null ? String(f.aboveKgs) : "",
          bagValue: f.bagValue != null ? String(f.bagValue) : "",
          isPaid: Boolean(f.isPaid),
        }));
        setFarmerRows(rows);
        setFarmerCount(rows.length);

        let kLines = [];
        if (
          Array.isArray(data.kayidhaPaddyLines) &&
          data.kayidhaPaddyLines.length > 0
        ) {
          kLines = data.kayidhaPaddyLines.map((l) => ({
            kayidhaId: l.kayidhaId || "",
            kgs: l.kgs != null ? String(l.kgs) : "",
          }));
        } else if (
          data.kayidhaPaddyKgs != null &&
          Number(data.kayidhaPaddyKgs) > 0
        ) {
          kLines = [{ kayidhaId: "", kgs: String(data.kayidhaPaddyKgs) }];
        }
        setKayidhaPaddyLines(kLines);
        setKayidhaPaddyLineCount(kLines.length);

        setJourneyLoadError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setJourneyLoadError(err.message || "Failed to load journey");
        }
      } finally {
        if (!cancelled) setJourneyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editJourneyId]);

  const vehiclePickerItems = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        name: String(v.number ?? "").trim() || "(no number)",
      })),
    [vehicles],
  );

  const millPickerItems = useMemo(
    () =>
      riceMills.map((m) => ({
        id: m.id,
        name: String(m.name ?? "").trim() || "(unnamed)",
      })),
    [riceMills],
  );

  const kayidhaPickerItems = useMemo(
    () =>
      kayidhas.map((k) => ({
        id: k.id,
        name: String(k.name ?? "").trim() || "(unnamed)",
      })),
    [kayidhas],
  );

  useEffect(() => {
    setWorkerSlotIds((prev) => {
      const n = Math.max(0, Math.min(50, Number(workerCount) || 0));
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
  }, [workerCount]);

  useEffect(() => {
    setFarmerRows((prev) => {
      const n = Math.max(0, Math.min(100, Number(farmerCount) || 0));
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push({
          farmerId: "",
          kayidhaId: "",
          weightMode: 75,
          bags: "",
          aboveKgs: "",
          bagValue: "",
          isPaid: false,
        });
      }
      return next;
    });
  }, [farmerCount]);

  useEffect(() => {
    setKayidhaPaddyLines((prev) => {
      const n = Math.max(0, Math.min(20, Number(kayidhaPaddyLineCount) || 0));
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push({ kayidhaId: "", kgs: "" });
      }
      return next;
    });
  }, [kayidhaPaddyLineCount]);

  useEffect(() => {
    const n = Math.max(0, Math.min(50, Number(workerCount) || 0));
    if (n > 0 && workers.length === 0 && !emptyWorkersPrompted.current) {
      emptyWorkersPrompted.current = true;
      setWorkerModalOpen(true);
    }
    if (workers.length > 0) emptyWorkersPrompted.current = false;
  }, [workerCount, workers.length]);

  const setSlotWorker = useCallback((index, id) => {
    setWorkerSlotIds((prev) => {
      const next = [...prev];
      next[index] = id;
      return next;
    });
  }, []);

  const updateFarmerRow = useCallback((index, patch) => {
    setFarmerRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const updateKayidhaPaddyLine = useCallback((index, patch) => {
    setKayidhaPaddyLines((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const farmerSummaries = useMemo(() => {
    return farmerRows.map((row, i) => {
      const hasFarmer = Boolean(row.farmerId);
      const filled =
        hasFarmer &&
        row.bags !== "" &&
        row.aboveKgs !== "" &&
        row.bagValue !== "" &&
        [75, 70, 40].includes(Number(row.weightMode));
      const calc = filled
        ? computeFarmerLine(
            row.weightMode,
            row.bags,
            row.aboveKgs,
            row.bagValue,
          )
        : null;
      return { filled, calc, row, i };
    });
  }, [farmerRows]);

  const grandTotal = useMemo(() => {
    return farmerSummaries.reduce((sum, s) => {
      if (s.calc && Number.isFinite(s.calc.lineTotal))
        return sum + s.calc.lineTotal;
      return sum;
    }, 0);
  }, [farmerSummaries]);

  const sumFarmerNetKatas = useMemo(() => {
    return farmerSummaries.reduce((sum, s) => {
      const k = s.calc?.netKatas;
      return sum + (k != null && Number.isFinite(k) ? k : 0);
    }, 0);
  }, [farmerSummaries]);

  const journeyJattuPaddyNetKatas = useMemo(
    () => kgToKata(jattuPaddyKgs),
    [jattuPaddyKgs],
  );

  const journeyKayidhaPaddyNetKatas = useMemo(
    () =>
      kayidhaPaddyLines.reduce((sum, line) => sum + kgToKata(line.kgs), 0),
    [kayidhaPaddyLines],
  );

  const kayidhaPaddyTotalKgs = useMemo(() => {
    return kayidhaPaddyLines.reduce((sum, line) => {
      if (line.kgs === "") return sum;
      const n = Number(line.kgs);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }, [kayidhaPaddyLines]);

  const anyKayidhaPaddyKgs = kayidhaPaddyTotalKgs > 0;

  const totalNetKataJourney = useMemo(
    () =>
      sumFarmerNetKatas +
      journeyJattuPaddyNetKatas +
      journeyKayidhaPaddyNetKatas,
    [
      sumFarmerNetKatas,
      journeyJattuPaddyNetKatas,
      journeyKayidhaPaddyNetKatas,
    ],
  );

  const createWorker = async (e) => {
    e.preventDefault();
    const name = newWorkerName.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      await addDoc(collection(db, "workers"), {
        name,
        createdAt: serverTimestamp(),
      });
      setNewWorkerName("");
      setWorkerModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create worker");
    } finally {
      setCreateBusy(false);
    }
  };

  const createFarmer = async (e) => {
    e.preventDefault();
    const name = newFarmerName.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      await addDoc(collection(db, "farmers"), {
        name,
        createdAt: serverTimestamp(),
      });
      setNewFarmerName("");
      setFarmerModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create farmer");
    } finally {
      setCreateBusy(false);
    }
  };

  const createVehicle = async (e) => {
    e.preventDefault();
    const number = newVehicleNo.trim();
    if (!number) return;
    setCreateBusy(true);
    try {
      const ref = await addDoc(collection(db, "vehicles"), {
        number,
        createdAt: serverTimestamp(),
      });
      setVehicleId(ref.id);
      setNewVehicleNo("");
      setVehicleModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create vehicle");
    } finally {
      setCreateBusy(false);
    }
  };

  const createMill = async (e) => {
    e.preventDefault();
    const name = newMillName.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      const ref = await addDoc(collection(db, "rice_mills"), {
        name,
        createdAt: serverTimestamp(),
      });
      setMillId(ref.id);
      setNewMillName("");
      setMillModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create rice mill");
    } finally {
      setCreateBusy(false);
    }
  };

  const createKayidha = async (e) => {
    e.preventDefault();
    const name = newKayidhaName.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      const ref = await addDoc(collection(db, "kayidhas"), {
        name,
        createdAt: serverTimestamp(),
      });
      const rowIdx = kayidhaModalForRow;
      const paddyIdx = kayidhaModalForPaddyLineIdx;
      if (rowIdx != null && rowIdx >= 0) {
        updateFarmerRow(rowIdx, { kayidhaId: ref.id });
      } else if (paddyIdx != null && paddyIdx >= 0) {
        updateKayidhaPaddyLine(paddyIdx, { kayidhaId: ref.id });
      }
      setNewKayidhaName("");
      setKayidhaModalOpen(false);
      setKayidhaModalForRow(null);
      setKayidhaModalForPaddyLineIdx(null);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create kayidha");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vehicleNo =
      vehicles.find((v) => v.id === vehicleId)?.number?.trim() ?? "";
    const riceMillName =
      riceMills.find((m) => m.id === millId)?.name?.trim() ?? "";
    if (!vehicleNo) {
      alert("Select or create a vehicle.");
      return;
    }
    if (!riceMillName) {
      alert("Select or create a rice mill.");
      return;
    }
    const nWorkers = Math.max(0, Math.min(50, Number(workerCount) || 0));
    if (nWorkers > 0 && workerSlotIds.slice(0, nWorkers).some((id) => !id)) {
      alert("Select a worker for each slot, or reduce worker count.");
      return;
    }
    const dup = new Set(workerSlotIds.filter(Boolean));
    if (dup.size !== workerSlotIds.filter(Boolean).length) {
      alert("Each worker can only be selected once.");
      return;
    }

    setSaving(true);
    try {
      const farmerPayload = farmerSummaries.map((s) => {
        const kayidhaName =
          kayidhas.find((k) => k.id === s.row.kayidhaId)?.name?.trim() ?? null;
        const line = {
          farmerId: s.row.farmerId,
          kayidhaId: s.row.kayidhaId || null,
          kayidhaName: kayidhaName || null,
          weightMode: Number(s.row.weightMode),
          bags: Number(s.row.bags),
          aboveKgs: Number(s.row.aboveKgs),
          bagValue: Number(s.row.bagValue),
          totalKg: s.calc?.totalKg ?? null,
          netKatas: s.calc?.netKatas ?? null,
          rupees: s.calc?.lineTotal ?? null,
        };
        if (isEditMode) line.isPaid = Boolean(s.row.isPaid);
        return line;
      });

      const jJ = jattuPaddyKgs === "" ? null : Number(jattuPaddyKgs);
      const kayidhaPaddyLinePayload = kayidhaPaddyLines.map((line) => {
        const kgs = line.kgs === "" ? null : Number(line.kgs);
        const kgsOk = kgs != null && Number.isFinite(kgs) && kgs >= 0;
        return {
          kayidhaId: line.kayidhaId || null,
          kayidhaName:
            kayidhas.find((k) => k.id === line.kayidhaId)?.name?.trim() ??
            null,
          kgs: kgsOk ? kgs : null,
          netKatas: kgsOk ? kgToKata(line.kgs) : null,
        };
      });

      const payload = {
        date,
        vehicleNo,
        riceMillName,
        totalBagsCount: totalBagsCount === "" ? null : Number(totalBagsCount),
        jattuPaddyKgs: jJ,
        kayidhaPaddyKgs: anyKayidhaPaddyKgs ? kayidhaPaddyTotalKgs : null,
        kayidhaPaddyLines: kayidhaPaddyLinePayload,
        jattuPaddyNetKatas:
          jattuPaddyKgs === "" ? null : journeyJattuPaddyNetKatas,
        kayidhaPaddyNetKatas: anyKayidhaPaddyKgs
          ? journeyKayidhaPaddyNetKatas
          : null,
        totalNetKatas: totalNetKataJourney,
        workerIds: workerSlotIds.slice(0, nWorkers).filter(Boolean),
        farmers: farmerPayload,
        grandTotal,
      };

      if (isEditMode) {
        await updateDoc(doc(db, "paddy_journeys", editJourneyId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        alert("Journey updated.");
        navigate("/paddy/view");
      } else {
        await addDoc(collection(db, "paddy_journeys"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        alert("Journey saved.");
        setVehicleId("");
        setMillId("");
        setTotalBagsCount("");
        setJattuPaddyKgs("");
        setKayidhaPaddyLineCount(0);
        setKayidhaPaddyLines([]);
        setKayidhaPaddySearchByLine({});
        setWorkerCount(0);
        setWorkerSlotIds([]);
        setFarmerCount(0);
        setFarmerRows([]);
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const nWorkerSlots = Math.max(0, Math.min(50, Number(workerCount) || 0));

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                {isEditMode
                  ? "EDIT PADDY — Transport journey"
                  : "ADD PADDY— Transport journey"}
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                1 kata = {KATA_KG} kg (fixed). Net katas per farmer:{" "}
                <span className="font-mono text-xs text-emerald-800">
                  (bags × weight mode + above kg) ÷ 75
                </span>
                . Amount = net katas × bag value.
              </p>
            </div>
            {isEditMode && (
              <Link
                to="/paddy/view"
                className="text-sm font-medium text-emerald-700 hover:underline"
              >
                ← Back to View Paddy
              </Link>
            )}
          </div>
        </div>

        {isEditMode && journeyLoading && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
            Loading journey…
          </div>
        )}
        {isEditMode && journeyLoadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {journeyLoadError}{" "}
            <Link to="/paddy/view" className="font-medium underline">
              Return to list
            </Link>
          </div>
        )}

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`space-y-8 rounded-2xl border border-emerald-100/90 bg-white/95 p-6 shadow-lg shadow-emerald-900/5 sm:p-8 ${
            isEditMode && (journeyLoading || journeyLoadError)
              ? "pointer-events-none opacity-50"
              : ""
          }`}
        >
          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-emerald-800">
              Journey details
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <SearchEntityPicker
                  label="Vehicle no."
                  items={vehiclePickerItems}
                  selectedId={vehicleId}
                  onSelect={setVehicleId}
                  excludeIds={[]}
                  search={vehicleSearch}
                  onSearchChange={setVehicleSearch}
                  emptyHint={
                    vehicles.length === 0
                      ? "No vehicles — tap + New"
                      : "No matches"
                  }
                  searchPlaceholder="Search vehicle no…"
                  onCreateClick={() => setVehicleModalOpen(true)}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <SearchEntityPicker
                  label="Rice mill name"
                  items={millPickerItems}
                  selectedId={millId}
                  onSelect={setMillId}
                  excludeIds={[]}
                  search={millSearch}
                  onSearchChange={setMillSearch}
                  emptyHint={
                    riceMills.length === 0
                      ? "No mills — tap + New"
                      : "No matches"
                  }
                  searchPlaceholder="Search mill name…"
                  onCreateClick={() => setMillModalOpen(true)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Total bags count
                </label>
                <input
                  type="number"
                  min={0}
                  value={totalBagsCount}
                  onChange={(e) => setTotalBagsCount(e.target.value)}
                  placeholder="Trip total bags"
                  className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
                  Workers
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Each slot is unique — the same worker cannot be chosen twice.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-zinc-600">
                  No. of workers
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={workerCount || ""}
                  onChange={(e) =>
                    setWorkerCount(
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                  className="w-20 rounded-xl border border-emerald-100 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setWorkerModalOpen(true)}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  + Create worker
                </button>
              </div>
            </div>
            {nWorkerSlots > 0 && workers.length === 0 && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No workers in database. Create one with{" "}
                <strong>+ Create worker</strong>.
              </p>
            )}
            <div className="flex flex-col gap-4 sm:max-w-md">
              {Array.from({ length: nWorkerSlots }, (_, i) => {
                const excludeIds = workerSlotIds.filter(
                  (id, j) => id && j !== i,
                );
                return (
                  <SearchEntityPicker
                    key={i}
                    label={`Worker ${i + 1}`}
                    items={workers}
                    selectedId={workerSlotIds[i] || ""}
                    onSelect={(id) => setSlotWorker(i, id)}
                    excludeIds={excludeIds}
                    search={workerSearchBySlot[i] || ""}
                    onSearchChange={(v) =>
                      setWorkerSearchBySlot((prev) => ({ ...prev, [i]: v }))
                    }
                    emptyHint={
                      workers.length === 0
                        ? "No workers — tap + New"
                        : "No matches"
                    }
                    onCreateClick={() => setWorkerModalOpen(true)}
                  />
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
                  Farmers (loads)
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Per-farmer net katas from bags. Below the table, add journey
                  Jattu paddy (kg) and Kayidha paddy: set how many Kayidha lines
                  you need, then pick each kayidha and enter kgs (net kata = kg ÷
                  75). Total net kata includes all farmers, jattu, and every
                  Kayidha line.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-zinc-600">
                  Farmers count
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={farmerCount || ""}
                  onChange={(e) =>
                    setFarmerCount(
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                  className="w-20 rounded-xl border border-emerald-100 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setFarmerModalOpen(true)}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  + Create farmer
                </button>
              </div>
            </div>

            {farmerCount > 0 && (
              <div className="overflow-x-auto rounded-xl border border-emerald-100">
                <table
                  className={`w-full border-collapse text-left text-sm ${isEditMode ? "min-w-[1040px]" : "min-w-[960px]"}`}
                >
                  <thead>
                    <tr className="border-b border-[#245840] bg-[#2D6A4F] text-xs font-bold uppercase tracking-wider text-white">
                      <th className="rounded-tl-xl border-r border-[#467C64] px-3 py-3">#</th>
                      <th className="min-w-[200px] border-r border-[#467C64] px-3 py-3">Farmer</th>
                      <th className="border-r border-[#467C64] px-3 py-3">Mode (kg/bag)</th>
                      <th className="border-r border-[#467C64] px-3 py-3">Bags</th>
                      <th className="border-r border-[#467C64] px-3 py-3">Above kg</th>
                      <th className="border-r border-[#467C64] px-3 py-3">Bag value</th>
                      <th className="border-r border-[#467C64] px-3 py-3">Net katas</th>
                      <th className="border-r border-[#467C64] px-3 py-3">Rupees</th>
                      <th className={`min-w-[180px] px-3 py-3 ${isEditMode ? "border-r border-[#467C64]" : "rounded-tr-xl"}`}>Kayidha</th>
                      {isEditMode ? (
                        <th
                          className="w-24 rounded-tr-xl whitespace-nowrap px-3 py-3"
                          title="Check when amount has been paid to this farmer"
                        >
                          Paid
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {farmerRows.map((row, i) => {
                      const sum = farmerSummaries[i];
                      const calc = sum?.calc;
                      return (
                        <tr
                          key={i}
                          className={[
                            "border-b border-emerald-50 align-top last:border-0",
                            isEditMode && row.isPaid
                              ? "bg-zinc-200/70"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <td className="px-3 py-3 text-zinc-500">{i + 1}</td>
                          <td className="px-3 py-3">
                            <SearchEntityPicker
                              label=""
                              items={farmers}
                              selectedId={row.farmerId}
                              onSelect={(id) =>
                                updateFarmerRow(i, { farmerId: id })
                              }
                              excludeIds={[]}
                              search={farmerSearchByRow[i] || ""}
                              onSearchChange={(v) =>
                                setFarmerSearchByRow((prev) => ({
                                  ...prev,
                                  [i]: v,
                                }))
                              }
                              emptyHint={
                                farmers.length === 0
                                  ? "No farmers — + New"
                                  : "No matches"
                              }
                              onCreateClick={() => setFarmerModalOpen(true)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <select
                              value={row.weightMode}
                              onChange={(e) =>
                                updateFarmerRow(i, {
                                  weightMode: Number(e.target.value),
                                })
                              }
                              className="w-full rounded-lg border border-emerald-100 px-2 py-2 text-sm"
                            >
                              {WEIGHT_MODES.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min={0}
                              inputMode="decimal"
                              value={row.bags}
                              onChange={(e) =>
                                updateFarmerRow(i, { bags: e.target.value })
                              }
                              className="w-full min-w-16 rounded-lg border border-emerald-100 px-2 py-2"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min={0}
                              inputMode="decimal"
                              value={row.aboveKgs}
                              onChange={(e) =>
                                updateFarmerRow(i, {
                                  aboveKgs: e.target.value,
                                })
                              }
                              placeholder="0"
                              className="w-full min-w-16 rounded-lg border border-emerald-100 px-2 py-2"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={row.bagValue}
                              onChange={(e) =>
                                updateFarmerRow(i, { bagValue: e.target.value })
                              }
                              placeholder="Bag value"
                              className="w-full min-w-20 rounded-lg border border-emerald-100 px-2 py-2"
                            />
                          </td>
                          <td className="px-3 py-3 font-mono text-sm font-bold text-red-600">
                            {calc ? calc.netKatas.toFixed(4) : "—"}
                          </td>
                          <td className="px-3 py-3 font-medium text-emerald-800">
                            {calc ? formatRupees(calc.lineTotal) : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <SearchEntityPicker
                              label=""
                              items={kayidhaPickerItems}
                              selectedId={row.kayidhaId || ""}
                              onSelect={(id) =>
                                updateFarmerRow(i, { kayidhaId: id })
                              }
                              excludeIds={[]}
                              search={kayidhaSearchByRow[i] || ""}
                              onSearchChange={(v) =>
                                setKayidhaSearchByRow((prev) => ({
                                  ...prev,
                                  [i]: v,
                                }))
                              }
                              emptyHint={
                                kayidhas.length === 0
                                  ? "No kayidhas — + New"
                                  : "No matches"
                              }
                              searchPlaceholder="Search kayidha…"
                              onCreateClick={() => {
                                setKayidhaModalForPaddyLineIdx(null);
                                setKayidhaModalForRow(i);
                                setKayidhaModalOpen(true);
                              }}
                            />
                          </td>
                          {isEditMode ? (
                            <td className="px-3 py-3 align-middle">
                              <label className="flex cursor-pointer items-center justify-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.isPaid)}
                                  onChange={(e) =>
                                    updateFarmerRow(i, {
                                      isPaid: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500/30"
                                  title="Paid to farmer"
                                />
                                <span className="sr-only">Paid to farmer</span>
                              </label>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-emerald-200 bg-emerald-50/50">
                      <td
                        colSpan={6}
                        className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-emerald-900"
                      >
                        Subtotal — farmers net katas
                      </td>
                      <td className="px-3 py-3 font-mono text-sm font-bold text-red-600">
                        {sumFarmerNetKatas.toFixed(4)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-xs font-medium uppercase text-emerald-800">
                          Grand total (₹)
                        </p>
                        <p className="text-xl font-semibold tracking-tight text-emerald-900 sm:text-2xl">
                          {formatRupees(grandTotal)}
                        </p>
                      </td>
                      <td className="px-3 py-3" />
                      {isEditMode ? <td className="px-3 py-3" /> : null}
                    </tr>
                    <tr className="border-b border-emerald-50 bg-emerald-50/40">
                      <td
                        colSpan={isEditMode ? 10 : 9}
                        className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800"
                      >
                        Journey paddy (whole load)
                      </td>
                    </tr>
                    <tr className="border-b border-emerald-50 align-top">
                      <td colSpan={6} className="px-3 py-3">
                        <label className="mb-1 block text-xs font-medium text-zinc-600">
                          Jattu paddy (kgs)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={jattuPaddyKgs}
                          onChange={(e) => setJattuPaddyKgs(e.target.value)}
                          placeholder="0"
                          className="w-full max-w-md rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-sm font-bold text-red-600">
                        <p className="mb-1 text-xs font-medium font-sans text-zinc-600">
                          Net katas (jattu)
                        </p>
                        {journeyJattuPaddyNetKatas.toFixed(4)}
                        <p className="mt-0.5 text-[0.65rem] font-sans font-normal text-zinc-400">
                          kg ÷ 75
                        </p>
                      </td>
                      <td
                        colSpan={isEditMode ? 3 : 2}
                        className="px-3 py-3"
                      />
                    </tr>
                    <tr className="border-b border-emerald-50 align-top">
                      <td colSpan={6} className="px-3 py-3">
                        <label className="mb-1 block text-xs font-medium text-zinc-600">
                          No. of Kayidha paddy (kgs) lines
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={kayidhaPaddyLineCount || ""}
                          onChange={(e) =>
                            setKayidhaPaddyLineCount(
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value),
                            )
                          }
                          className="w-full max-w-40 rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                        />
                        <p className="mt-1 text-[0.65rem] text-zinc-500">
                          One row each: choose kayidha, enter kgs, see net katas.
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-sm font-bold text-red-600">
                        {kayidhaPaddyLines.length > 0 ? (
                          <>
                            <p className="mb-1 text-xs font-medium font-sans text-zinc-600">
                              Σ Kayidha paddy katas
                            </p>
                            {journeyKayidhaPaddyNetKatas.toFixed(4)}
                            <p className="mt-0.5 text-[0.65rem] font-sans font-normal text-zinc-400">
                              all lines, kg ÷ 75
                            </p>
                          </>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td
                        colSpan={isEditMode ? 3 : 2}
                        className="px-3 py-3"
                      />
                    </tr>
                    {kayidhaPaddyLines.map((paddyLine, ki) => {
                      const lineKata = kgToKata(paddyLine.kgs);
                      return (
                        <tr
                          key={ki}
                          className="border-b border-emerald-50 align-top bg-white"
                        >
                          <td colSpan={6} className="px-3 py-3">
                            <p className="mb-2 text-xs font-semibold text-emerald-800">
                              Kayidha paddy line {ki + 1}
                            </p>
                            <div className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
                              <div className="min-w-0 flex-1">
                                <SearchEntityPicker
                                  label=""
                                  items={kayidhaPickerItems}
                                  selectedId={paddyLine.kayidhaId || ""}
                                  onSelect={(id) =>
                                    updateKayidhaPaddyLine(ki, {
                                      kayidhaId: id,
                                    })
                                  }
                                  excludeIds={[]}
                                  search={kayidhaPaddySearchByLine[ki] || ""}
                                  onSearchChange={(v) =>
                                    setKayidhaPaddySearchByLine((prev) => ({
                                      ...prev,
                                      [ki]: v,
                                    }))
                                  }
                                  emptyHint={
                                    kayidhas.length === 0
                                      ? "No kayidhas — + New"
                                      : "No matches"
                                  }
                                  searchPlaceholder="Search kayidha…"
                                  onCreateClick={() => {
                                    setKayidhaModalForRow(null);
                                    setKayidhaModalForPaddyLineIdx(ki);
                                    setKayidhaModalOpen(true);
                                  }}
                                />
                              </div>
                              <div className="w-full shrink-0 sm:w-36">
                                <label className="mb-1 block text-xs font-medium text-zinc-600">
                                  Kgs
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  inputMode="decimal"
                                  value={paddyLine.kgs}
                                  onChange={(e) =>
                                    updateKayidhaPaddyLine(ki, {
                                      kgs: e.target.value,
                                    })
                                  }
                                  placeholder="0"
                                  className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-sm font-bold text-red-600">
                            <p className="mb-1 text-xs font-medium font-sans text-zinc-600">
                              Net katas
                            </p>
                            {paddyLine.kgs === "" ? (
                              "—"
                            ) : (
                              lineKata.toFixed(4)
                            )}
                            <p className="mt-0.5 text-[0.65rem] font-sans font-normal text-zinc-400">
                              kg ÷ 75
                            </p>
                          </td>
                          <td
                            colSpan={isEditMode ? 3 : 2}
                            className="px-3 py-3"
                          />
                        </tr>
                      );
                    })}
                    <tr className="border-b border-emerald-100 bg-emerald-50/30 align-top">
                      <td colSpan={6} className="px-3 py-3">
                        <span className="text-sm font-semibold uppercase tracking-wide text-emerald-900">
                          Total net kata
                        </span>
                        <p className="mt-1 text-[0.7rem] text-zinc-500">
                          Farmers subtotal + jattu katas + all Kayidha paddy lines
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-base font-bold text-red-600">
                        {totalNetKataJourney.toFixed(4)}
                      </td>
                      <td
                        colSpan={isEditMode ? 3 : 2}
                        className="px-3 py-3"
                      />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-3 border-t border-emerald-100 pt-6">
            <button
              type="submit"
              disabled={
                saving ||
                (isEditMode && (journeyLoading || Boolean(journeyLoadError)))
              }
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving
                ? isEditMode
                  ? "Updating…"
                  : "Saving…"
                : isEditMode
                  ? "Update journey"
                  : "Save journey"}
            </button>
          </div>
        </form>
      </div>

      {workerModalOpen && (
        <Modal title="New worker" onClose={() => setWorkerModalOpen(false)}>
          <form onSubmit={createWorker} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Name
              </label>
              <input
                autoFocus
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Worker name"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy || !newWorkerName.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Create worker"}
            </button>
          </form>
        </Modal>
      )}

      {farmerModalOpen && (
        <Modal title="New farmer" onClose={() => setFarmerModalOpen(false)}>
          <form onSubmit={createFarmer} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Name
              </label>
              <input
                autoFocus
                value={newFarmerName}
                onChange={(e) => setNewFarmerName(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Farmer name"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy || !newFarmerName.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Create farmer"}
            </button>
          </form>
        </Modal>
      )}

      {vehicleModalOpen && (
        <Modal title="New vehicle" onClose={() => setVehicleModalOpen(false)}>
          <form onSubmit={createVehicle} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Vehicle number
              </label>
              <input
                autoFocus
                value={newVehicleNo}
                onChange={(e) => setNewVehicleNo(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="e.g. AP 12 AB 1234"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy || !newVehicleNo.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Create vehicle"}
            </button>
          </form>
        </Modal>
      )}

      {millModalOpen && (
        <Modal title="New rice mill" onClose={() => setMillModalOpen(false)}>
          <form onSubmit={createMill} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Mill name
              </label>
              <input
                autoFocus
                value={newMillName}
                onChange={(e) => setNewMillName(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Rice mill name"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy || !newMillName.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Create rice mill"}
            </button>
          </form>
        </Modal>
      )}

      {kayidhaModalOpen && (
        <Modal
          title="New kayidha"
          onClose={() => {
            setKayidhaModalOpen(false);
            setKayidhaModalForRow(null);
            setKayidhaModalForPaddyLineIdx(null);
          }}
        >
          <form onSubmit={createKayidha} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Kayidha name
              </label>
              <input
                autoFocus
                value={newKayidhaName}
                onChange={(e) => setNewKayidhaName(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Kayidha name"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy || !newKayidhaName.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Create kayidha"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default AddPaddy;
