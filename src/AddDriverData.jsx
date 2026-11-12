import { useEffect, useMemo, useRef, useState } from "react";
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

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
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
        {onCreateClick ? (
          <button
            type="button"
            onClick={onCreateClick}
            className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            + New
          </button>
        ) : null}
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

async function getNextDriverDataSerial() {
  const snap = await getDocs(collection(db, "driver_data"));
  let max = 0;
  snap.forEach((d) => {
    const v = d.data().serialNo;
    const n =
      typeof v === "number" && Number.isFinite(v)
        ? v
        : parseInt(String(v ?? "").replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max + 1;
}

function parseMoney(raw) {
  if (raw === "" || raw == null) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function parseKg(raw) {
  if (raw === "" || raw == null) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/** Picker id when saved driver name has no row in `drivers` collection */
const ID_SAVED_DRIVER = "__saved_driver__";

function AddDriverData() {
  const { recordId: editRecordId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(editRecordId);

  const [vehicles, setVehicles] = useState([]);
  const [riceMills, setRiceMills] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const [existingSerialNo, setExistingSerialNo] = useState(null);
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [millId, setMillId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [advanceAmt, setAdvanceAmt] = useState("");
  const [loadingAmt, setLoadingAmt] = useState("");
  const [millNetWtKgs, setMillNetWtKgs] = useState("");
  /** Optional rows: { reason, amount } — unbounded via Add row */
  const [otherRows, setOtherRows] = useState([]);

  const [millSearch, setMillSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  /** Edit: driver name on record but not found in `drivers` master */
  const [savedDriverNameOnly, setSavedDriverNameOnly] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordLoadError, setRecordLoadError] = useState(null);

  useEffect(() => {
    const unV = onSnapshot(
      collection(db, "vehicles"),
      (snap) => {
        setLoadError(null);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.number ?? "").localeCompare(String(b.number ?? "")),
        );
        setVehicles(list);
      },
      (err) => setLoadError(err.message),
    );
    const unM = onSnapshot(
      collection(db, "rice_mills"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? "")),
        );
        setRiceMills(list);
      },
      (err) => setLoadError(err.message),
    );
    const unD = onSnapshot(
      collection(db, "drivers"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? "")),
        );
        setDrivers(list);
      },
      (err) => setLoadError(err.message),
    );
    return () => {
      unV();
      unM();
      unD();
    };
  }, []);

  useEffect(() => {
    if (!savedDriverNameOnly || driverId !== ID_SAVED_DRIVER) return;
    const hit = drivers.find(
      (d) => normalizeName(String(d.name ?? "")) === normalizeName(savedDriverNameOnly),
    );
    if (hit) {
      setDriverId(hit.id);
      setSavedDriverNameOnly("");
    }
  }, [drivers, savedDriverNameOnly, driverId]);

  useEffect(() => {
    if (!editRecordId) {
      setRecordLoadError(null);
      setRecordLoading(false);
      setSavedDriverNameOnly("");
      setOtherRows([]);
      return;
    }
    let cancelled = false;
    setRecordLoading(true);
    setRecordLoadError(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "driver_data", editRecordId));
        if (cancelled) return;
        if (!snap.exists()) {
          setRecordLoadError("Record not found.");
          setRecordLoading(false);
          return;
        }
        const data = snap.data();
        const [vehSnap, millSnap, drvSnap] = await Promise.all([
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "rice_mills")),
          getDocs(collection(db, "drivers")),
        ]);
        const vehList = vehSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const millList = millSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const drvList = drvSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const rawSn = data.serialNo;
        if (typeof rawSn === "number" && Number.isFinite(rawSn)) {
          setExistingSerialNo(rawSn);
        } else if (rawSn != null && String(rawSn).trim() !== "") {
          const p = parseInt(String(rawSn).replace(/\D/g, ""), 10);
          setExistingSerialNo(Number.isFinite(p) ? p : null);
        } else {
          setExistingSerialNo(null);
        }

        const dStr = data.date;
        setDate(
          typeof dStr === "string" && dStr
            ? dStr.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        );

        const millName = String(data.riceMillName ?? "").trim();
        const mHit = millList.find(
          (x) => String(x.name ?? "").trim() === millName,
        );
        setMillId(mHit?.id ?? "");

        const vNo = String(data.vehicleNo ?? "").trim();
        const vHit = vehList.find(
          (x) => String(x.number ?? "").trim() === vNo,
        );
        setVehicleId(vHit?.id ?? "");

        const dName = String(data.driverName ?? "").trim();
        const dHit = drvList.find(
          (x) => String(x.name ?? "").trim() === dName,
        );
        if (dHit) {
          setDriverId(dHit.id);
          setSavedDriverNameOnly("");
        } else if (dName) {
          setDriverId(ID_SAVED_DRIVER);
          setSavedDriverNameOnly(dName);
        } else {
          setDriverId("");
          setSavedDriverNameOnly("");
        }

        setAdvanceAmt(
          data.advanceAmt != null && data.advanceAmt !== ""
            ? String(data.advanceAmt)
            : "",
        );
        setLoadingAmt(
          data.loadingAmt != null && data.loadingAmt !== ""
            ? String(data.loadingAmt)
            : "",
        );
        setMillNetWtKgs(
          data.millNetWtKgs != null && data.millNetWtKgs !== ""
            ? String(data.millNetWtKgs)
            : "",
        );
        const on = data.otherNecessities;
        if (Array.isArray(on) && on.length > 0) {
          setOtherRows(
            on.map((o) => ({
              reason: o?.reason != null ? String(o.reason) : "",
              amount:
                o?.amount != null && o?.amount !== ""
                  ? String(o.amount)
                  : "",
            })),
          );
        } else {
          setOtherRows([]);
        }
        setRecordLoadError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled)
          setRecordLoadError(err.message || "Failed to load record.");
      } finally {
        if (!cancelled) setRecordLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editRecordId]);

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

  const driverPickerItems = useMemo(() => {
    const base = drivers.map((d) => ({
      id: d.id,
      name: String(d.name ?? "").trim() || "(unnamed)",
    }));
    if (!savedDriverNameOnly) return base;
    const has = base.some(
      (x) => normalizeName(x.name) === normalizeName(savedDriverNameOnly),
    );
    if (has) return base;
    return [...base, { id: ID_SAVED_DRIVER, name: savedDriverNameOnly }];
  }, [drivers, savedDriverNameOnly]);

  const createDriver = async (e) => {
    e.preventDefault();
    const name = newDriverName.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      const refDoc = await addDoc(collection(db, "drivers"), {
        name,
        createdAt: serverTimestamp(),
      });
      setDriverId(refDoc.id);
      setSavedDriverNameOnly("");
      setNewDriverName("");
      setDriverModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create driver");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const riceMillName =
      riceMills.find((m) => m.id === millId)?.name?.trim() ?? "";
    const vehicleNo =
      vehicles.find((v) => v.id === vehicleId)?.number?.trim() ?? "";
    const pickedDriver = drivers.find((d) => d.id === driverId);
    let driverName = pickedDriver?.name?.trim() ?? "";
    let outDriverId = pickedDriver ? driverId : null;
    if (!driverName && driverId === ID_SAVED_DRIVER && savedDriverNameOnly) {
      driverName = savedDriverNameOnly.trim();
      outDriverId = null;
    }

    if (!riceMillName) {
      alert("Select a rice mill.");
      return;
    }
    if (!vehicleNo) {
      alert("Select a vehicle.");
      return;
    }
    if (!driverName) {
      alert("Select or create a driver.");
      return;
    }

    const adv = parseMoney(advanceAmt);
    const load = parseMoney(loadingAmt);
    const wt = parseKg(millNetWtKgs);
    if (!Number.isFinite(adv) || adv < 0) {
      alert("Enter a valid advance amount (≥ 0).");
      return;
    }
    if (!Number.isFinite(load) || load < 0) {
      alert("Enter a valid loading amount (≥ 0).");
      return;
    }
    if (!Number.isFinite(wt) || wt < 0) {
      alert("Enter a valid mill net weight in kg (≥ 0).");
      return;
    }

    const othersPayload = [];
    for (let i = 0; i < otherRows.length; i++) {
      const row = otherRows[i];
      const reason = String(row.reason ?? "").trim();
      const amtRaw = row.amount;
      const hasReason = reason !== "";
      const hasAmount =
        amtRaw !== "" && amtRaw != null && String(amtRaw).trim() !== "";
      if (!hasReason && !hasAmount) continue;
      if (!hasReason) {
        alert(`Enter a reason for other necessity row ${i + 1}.`);
        return;
      }
      const amt = parseMoney(amtRaw);
      if (!Number.isFinite(amt) || amt < 0) {
        alert(`Enter a valid amount (≥ 0) for “${reason}”.`);
        return;
      }
      othersPayload.push({ reason, amount: amt });
    }

    setSaving(true);
    try {
      const basePayload = {
        date,
        riceMillName,
        millId: millId || null,
        vehicleNo,
        vehicleId: vehicleId || null,
        driverName,
        driverId: outDriverId,
        advanceAmt: adv,
        loadingAmt: load,
        millNetWtKgs: wt,
        otherNecessities: othersPayload,
      };

      if (!isEditMode) {
        basePayload.serialNo = await getNextDriverDataSerial();
      } else if (
        existingSerialNo != null &&
        Number.isFinite(Number(existingSerialNo))
      ) {
        basePayload.serialNo = Number(existingSerialNo);
      }

      if (isEditMode) {
        await updateDoc(doc(db, "driver_data", editRecordId), {
          ...basePayload,
          updatedAt: serverTimestamp(),
        });
        alert("Driver data updated.");
        navigate("/drivers/view");
      } else {
        await addDoc(collection(db, "driver_data"), {
          ...basePayload,
          createdAt: serverTimestamp(),
        });
        alert("Driver data saved.");
        navigate("/drivers/view");
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const formBlocked =
    isEditMode && (recordLoading || Boolean(recordLoadError));

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-zinc-400/75 bg-white/90 p-6 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                {isEditMode ? "EDIT DRIVER DATA" : "ADD DRIVER DATA"}
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                S. no. is assigned automatically when you save (not shown on
                this form).
              </p>
              {isEditMode && existingSerialNo != null && (
                <p className="mt-1 text-sm font-medium text-emerald-800">
                  Record S. no.: {existingSerialNo}
                </p>
              )}
            </div>
            {isEditMode && (
              <Link
                to="/drivers/view"
                className="text-sm font-medium text-emerald-700 hover:underline"
              >
                ← Back to view
              </Link>
            )}
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {isEditMode && recordLoading && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
            Loading…
          </div>
        )}
        {isEditMode && recordLoadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {recordLoadError}{" "}
            <Link to="/drivers/view" className="font-medium underline">
              Return to list
            </Link>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`space-y-8 rounded-2xl border border-zinc-400/75 bg-white/95 p-6 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] sm:p-8 ${formBlocked ? "pointer-events-none opacity-50" : ""}`}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <SearchEntityPicker
              label="Mill name"
              items={millPickerItems}
              selectedId={millId}
              onSelect={setMillId}
              excludeIds={[]}
              search={millSearch}
              onSearchChange={setMillSearch}
              emptyHint={
                riceMills.length === 0 ? "No mills in database" : "No matches"
              }
              searchPlaceholder="Search mill…"
              disabled={formBlocked}
            />
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
                  ? "No vehicles in database"
                  : "No matches"
              }
              searchPlaceholder="Search vehicle…"
              disabled={formBlocked}
            />
          </div>

          <SearchEntityPicker
            label="Driver name"
            items={driverPickerItems}
            selectedId={driverId}
            onSelect={(id) => {
              setDriverId(id);
              if (id !== ID_SAVED_DRIVER) setSavedDriverNameOnly("");
            }}
            excludeIds={[]}
            search={driverSearch}
            onSearchChange={setDriverSearch}
            emptyHint={
              drivers.length === 0
                ? "No drivers — + New"
                : "No matches — + New"
            }
            searchPlaceholder="Search driver…"
            onCreateClick={() => setDriverModalOpen(true)}
            disabled={formBlocked}
          />

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Advance amount (₹)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                required
                value={advanceAmt}
                onChange={(e) => setAdvanceAmt(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Loading amount (₹)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                required
                value={loadingAmt}
                onChange={(e) => setLoadingAmt(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Mill net weight (kg)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                required
                value={millNetWtKgs}
                onChange={(e) => setMillNetWtKgs(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-zinc-600">
                Other necessities{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setOtherRows((prev) => [
                    ...prev,
                    { reason: "", amount: "" },
                  ])
                }
                disabled={formBlocked}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                + Add necessity
              </button>
            </div>
            {otherRows.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No extra items. Use “Add necessity” if needed.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-emerald-100">
                <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#245840] bg-[#2D6A4F] text-xs font-bold uppercase tracking-wider text-white">
                      <th className="rounded-tl-xl border-r border-[#467C64] px-3 py-2">#</th>
                      <th className="border-r border-[#467C64] px-3 py-2">Reason</th>
                      <th className="border-r border-[#467C64] px-3 py-2">Amount (₹)</th>
                      <th className="w-24 rounded-tr-xl px-3 py-2 text-center"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherRows.map((row, i) => (
                      <tr key={i} className="border-b border-emerald-50">
                        <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.reason}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOtherRows((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], reason: v };
                                return next;
                              });
                            }}
                            className="w-full rounded-lg border border-emerald-100 px-2 py-2"
                            placeholder="Reason"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOtherRows((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], amount: v };
                                return next;
                              });
                            }}
                            className="w-full min-w-24 rounded-lg border border-emerald-100 px-2 py-2"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setOtherRows((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || formBlocked}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : isEditMode
                ? "Update"
                : "Save driver data"}
          </button>
        </form>
      </div>

      {driverModalOpen && (
        <Modal
          title="New driver"
          onClose={() => {
            setDriverModalOpen(false);
            setNewDriverName("");
          }}
        >
          <form onSubmit={createDriver} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Driver name
              </label>
              <input
                autoFocus
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Full name"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy || !newDriverName.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Create driver"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default AddDriverData;
