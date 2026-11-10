import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { uploadPdfToCloudinary } from "./cloudinaryUpload";
import { formatRupees } from "./formatRupees";

/** Used when `config/truck_sheet` is missing or has no valid `quintalRate` */
const DEFAULT_QUINTAL_RATE = 2369;
const PTR_REGEX = /^\d{16}$/;
const MAX_ACCOUNTS = 50;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

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

async function isPtrNoTaken(ptrNo, excludeDocId) {
  const q = query(
    collection(db, "truck_sheets"),
    where("ptrNo", "==", ptrNo),
    limit(5),
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    if (d.id !== excludeDocId) return true;
  }
  return false;
}

/** Next integer S. no. = max existing numeric serialNo + 1 */
async function getNextTruckSheetSerial() {
  const snap = await getDocs(collection(db, "truck_sheets"));
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

function AddTruckSheet() {
  const { sheetId: editSheetId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(editSheetId);

  const [vehicles, setVehicles] = useState([]);
  const [riceMills, setRiceMills] = useState([]);
  const [loadError, setLoadError] = useState(null);
  /** Set when editing — preserved on update; new sheets get auto serial on save */
  const [existingSerialNo, setExistingSerialNo] = useState(null);
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [millId, setMillId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [ptrNo, setPtrNo] = useState("");
  const [ptrTouched, setPtrTouched] = useState(false);
  const [rsk, setRsk] = useState("");
  const [accountCount, setAccountCount] = useState(1);
  const [accountRows, setAccountRows] = useState([
    { accountName: "", quintals: "", isCompleted: false },
  ]);
  const [pdfFile, setPdfFile] = useState(null);
  const [existingPdfUrl, setExistingPdfUrl] = useState("");
  const [existingCloudinaryPublicId, setExistingCloudinaryPublicId] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetLoadError, setSheetLoadError] = useState(null);

  const [millModalOpen, setMillModalOpen] = useState(false);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [newMillName, setNewMillName] = useState("");
  const [newVehicleNo, setNewVehicleNo] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [millSearch, setMillSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  /** Distinct RSK values from existing truck sheets (for picker) */
  const [rskOptionsFromDb, setRskOptionsFromDb] = useState([]);
  const [rskSearch, setRskSearch] = useState("");
  const [rskModalOpen, setRskModalOpen] = useState(false);
  const [newRskName, setNewRskName] = useState("");
  /** Per-season rate from Firestore `config/truck_sheet` → `quintalRate` */
  const [quintalRate, setQuintalRate] = useState(DEFAULT_QUINTAL_RATE);

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
    return () => {
      unV();
      unM();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "truck_sheets"),
      (snap) => {
        const set = new Set();
        snap.docs.forEach((d) => {
          const v = String(d.data().rsk ?? "").trim();
          if (v) set.add(v);
        });
        setRskOptionsFromDb(
          Array.from(set).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" }),
          ),
        );
      },
      (err) => console.error(err),
    );
    return () => unsub();
  }, []);

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
    if (!editSheetId) {
      setSheetLoadError(null);
      setSheetLoading(false);
      return;
    }
    let cancelled = false;
    setSheetLoading(true);
    setSheetLoadError(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "truck_sheets", editSheetId));
        if (cancelled) return;
        if (!snap.exists()) {
          setSheetLoadError("Truck sheet not found.");
          setSheetLoading(false);
          return;
        }
        const data = snap.data();
        const [vehSnap, millSnap] = await Promise.all([
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "rice_mills")),
        ]);
        const vehList = vehSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const millList = millSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
        setPtrNo(String(data.ptrNo ?? "").replace(/\D/g, "").slice(0, 16));
        setRsk(String(data.rsk ?? "").trim());
        const acc = Array.isArray(data.accounts) ? data.accounts : [];
        const n = Math.max(1, Math.min(MAX_ACCOUNTS, acc.length || 1));
        setAccountCount(n);
        setAccountRows(
          Array.from({ length: n }, (_, i) => ({
            accountName:
              acc[i]?.accountName != null ? String(acc[i].accountName) : "",
            quintals:
              acc[i]?.quintals != null && acc[i].quintals !== ""
                ? String(acc[i].quintals)
                : "",
            isCompleted: Boolean(acc[i]?.isCompleted),
          })),
        );
        setExistingPdfUrl(String(data.pdfUrl ?? ""));
        setExistingCloudinaryPublicId(
          String(data.cloudinaryPublicId ?? "").trim(),
        );
        setPdfFile(null);
        setSheetLoadError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled)
          setSheetLoadError(err.message || "Failed to load truck sheet.");
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editSheetId]);

  useEffect(() => {
    const n = Math.max(1, Math.min(MAX_ACCOUNTS, Number(accountCount) || 1));
    setAccountRows((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push({ accountName: "", quintals: "", isCompleted: false });
      }
      return next;
    });
  }, [accountCount]);

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

  const rskPickerItems = useMemo(() => {
    const set = new Set(rskOptionsFromDb);
    const cur = String(rsk ?? "").trim();
    if (cur) set.add(cur);
    return Array.from(set)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      )
      .map((name) => ({ id: name, name }));
  }, [rskOptionsFromDb, rsk]);

  const ptrValid = PTR_REGEX.test(ptrNo);
  const ptrError =
    ptrTouched && ptrNo.length > 0 && !ptrValid
      ? "PTR no. must be exactly 16 digits."
      : "";

  const netQuintals = useMemo(() => {
    let sum = 0;
    for (const row of accountRows) {
      const q = row.quintals === "" ? NaN : Number(row.quintals);
      if (Number.isFinite(q) && q >= 0) sum += q;
    }
    return sum;
  }, [accountRows]);

  const amount = useMemo(
    () => Math.round(netQuintals * quintalRate * 100) / 100,
    [netQuintals, quintalRate],
  );

  const createVehicle = async (e) => {
    e.preventDefault();
    const number = newVehicleNo.trim();
    if (!number) return;
    setCreateBusy(true);
    try {
      const refDoc = await addDoc(collection(db, "vehicles"), {
        number,
        createdAt: serverTimestamp(),
      });
      setVehicleId(refDoc.id);
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
      const refDoc = await addDoc(collection(db, "rice_mills"), {
        name,
        createdAt: serverTimestamp(),
      });
      setMillId(refDoc.id);
      setNewMillName("");
      setMillModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Could not create rice mill");
    } finally {
      setCreateBusy(false);
    }
  };

  const onPtrInput = useCallback((raw) => {
    const digits = String(raw).replace(/\D/g, "").slice(0, 16);
    setPtrNo(digits);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPtrTouched(true);
    const riceMillName =
      riceMills.find((m) => m.id === millId)?.name?.trim() ?? "";
    const vehicleNo =
      vehicles.find((v) => v.id === vehicleId)?.number?.trim() ?? "";
    if (!riceMillName) {
      alert("Select or create a rice mill.");
      return;
    }
    if (!vehicleNo) {
      alert("Select or create a vehicle.");
      return;
    }
    if (!PTR_REGEX.test(ptrNo)) {
      alert("PTR no. must be exactly 16 digits (numbers only).");
      return;
    }
    if (!rsk.trim()) {
      alert("Enter RSK.");
      return;
    }
    const accountsPayload = [];
    for (let i = 0; i < accountRows.length; i++) {
      const row = accountRows[i];
      const name = row.accountName.trim();
      const qRaw = row.quintals === "" ? NaN : Number(row.quintals);
      if (!name) {
        alert(`Enter account name for row ${i + 1}.`);
        return;
      }
      if (!Number.isFinite(qRaw) || qRaw < 0) {
        alert(`Enter valid quintals (≥ 0) for account “${name}”.`);
        return;
      }
      const accEntry = { accountName: name, quintals: qRaw };
      if (isEditMode) accEntry.isCompleted = Boolean(row.isCompleted);
      accountsPayload.push(accEntry);
    }

    const taken = await isPtrNoTaken(ptrNo, isEditMode ? editSheetId : null);
    if (taken) {
      alert("This PTR number is already used on another truck sheet.");
      return;
    }

    if (pdfFile) {
      if (pdfFile.type !== "application/pdf") {
        alert("Upload must be a PDF file.");
        return;
      }
      if (pdfFile.size > MAX_PDF_BYTES) {
        alert("PDF must be 15 MB or smaller.");
        return;
      }
    }

    setSaving(true);
    try {
      const basePayload = {
        date,
        riceMillName,
        millId: millId || null,
        ptrNo,
        vehicleNo,
        vehicleId: vehicleId || null,
        rsk: rsk.trim(),
        accounts: accountsPayload,
        netQuintals,
        amount,
        ratePerQuintal: quintalRate,
      };

      if (!isEditMode) {
        basePayload.serialNo = await getNextTruckSheetSerial();
      } else if (
        existingSerialNo != null &&
        Number.isFinite(Number(existingSerialNo))
      ) {
        basePayload.serialNo = Number(existingSerialNo);
      }

      let pdfUrl = existingPdfUrl;
      let cloudinaryPublicId =
        existingCloudinaryPublicId.trim() || null;

      if (pdfFile) {
        const uploaded = await uploadPdfToCloudinary(pdfFile);
        pdfUrl = uploaded.secureUrl;
        cloudinaryPublicId = uploaded.publicId;
      }

      const pdfFields = {
        pdfUrl: pdfUrl || null,
        cloudinaryPublicId,
        pdfStoragePath: null,
      };

      if (isEditMode) {
        await updateDoc(doc(db, "truck_sheets", editSheetId), {
          ...basePayload,
          ...pdfFields,
          updatedAt: serverTimestamp(),
        });
        alert("Truck sheet updated.");
        navigate("/truck-sheet/view");
      } else {
        await addDoc(collection(db, "truck_sheets"), {
          ...basePayload,
          ...pdfFields,
          createdAt: serverTimestamp(),
        });
        alert("Truck sheet saved.");
        navigate("/truck-sheet/view");
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const formBlocked =
    isEditMode && (sheetLoading || Boolean(sheetLoadError));

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-emerald-100/90 bg-white/90 p-6 shadow-lg sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                {isEditMode ? "EDIT TRUCK SHEET" : "ADD TRUCK SHEET"}
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                S. no. is assigned automatically when you save. PTR no. is a
                unique 16-digit number. Amount = net quintals × the rate per
                quintal from the database (see Amount below).
              </p>
              {isEditMode && existingSerialNo != null && (
                <p className="mt-1 text-sm font-medium text-emerald-800">
                  Sheet S. no.: {existingSerialNo}
                </p>
              )}
            </div>
            {isEditMode && (
              <Link
                to="/truck-sheet/view"
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

        {isEditMode && sheetLoading && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
            Loading…
          </div>
        )}
        {isEditMode && sheetLoadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {sheetLoadError}{" "}
            <Link to="/truck-sheet/view" className="font-medium underline">
              Return to list
            </Link>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`space-y-8 rounded-2xl border border-emerald-100/90 bg-white/95 p-6 shadow-lg sm:p-8 ${formBlocked ? "pointer-events-none opacity-50" : ""}`}
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
                riceMills.length === 0
                  ? "No mills — + New"
                  : "No matches"
              }
              searchPlaceholder="Search mill…"
              onCreateClick={() => setMillModalOpen(true)}
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
                  ? "No vehicles — + New"
                  : "No matches"
              }
              searchPlaceholder="Search vehicle…"
              onCreateClick={() => setVehicleModalOpen(true)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              PTR no. (16 digits, unique)
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={16}
              value={ptrNo}
              onChange={(e) => onPtrInput(e.target.value)}
              onBlur={() => setPtrTouched(true)}
              placeholder="Enter 16 digits"
              className={`w-full max-w-md rounded-xl border px-3 py-2.5 font-mono text-sm tracking-wider outline-none focus:ring-2 focus:ring-emerald-500/25 ${
                ptrError ? "border-red-300 bg-red-50/50" : "border-emerald-100"
              }`}
            />
            {ptrError ? (
              <p className="mt-1 text-xs text-red-600">{ptrError}</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                {ptrNo.length}/16 digits
              </p>
            )}
          </div>

          <SearchEntityPicker
            label="RSK"
            items={rskPickerItems}
            selectedId={rsk.trim() ? rsk.trim() : null}
            onSelect={(id) => setRsk(String(id))}
            excludeIds={[]}
            search={rskSearch}
            onSearchChange={setRskSearch}
            emptyHint={
              rskPickerItems.length === 0
                ? "No RSK yet — + New"
                : "No matches — + New"
            }
            searchPlaceholder="Search RSK…"
            onCreateClick={() => setRskModalOpen(true)}
            disabled={formBlocked}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              No. of accounts
            </label>
            <input
              type="number"
              min={1}
              max={MAX_ACCOUNTS}
              value={accountCount || ""}
              onChange={(e) =>
                setAccountCount(
                  e.target.value === "" ? 1 : Number(e.target.value),
                )
              }
              className="w-32 rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-emerald-100">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#245840] bg-[#2D6A4F] text-xs font-bold uppercase tracking-wider text-white">
                  <th className="rounded-tl-xl border-r border-[#467C64] px-3 py-2">#</th>
                  <th className="border-r border-[#467C64] px-3 py-2">Account name</th>
                  <th className={`px-3 py-2 ${isEditMode ? "border-r border-[#467C64]" : "rounded-tr-xl"}`}>Quintals</th>
                  {isEditMode && (
                    <th className="rounded-tr-xl px-3 py-2 text-center whitespace-nowrap">
                      Completed
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {accountRows.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      row.isCompleted
                        ? "border-b border-zinc-200/80 bg-zinc-200/45 text-zinc-700"
                        : "border-b border-emerald-50"
                    }
                  >
                    <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.accountName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAccountRows((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], accountName: v };
                            return next;
                          });
                        }}
                        className="w-full rounded-lg border border-emerald-100 px-2 py-2"
                        placeholder="Account name"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={row.quintals}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAccountRows((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], quintals: v };
                            return next;
                          });
                        }}
                        className="w-full min-w-24 rounded-lg border border-emerald-100 px-2 py-2"
                        placeholder="0"
                      />
                    </td>
                    {isEditMode && (
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={Boolean(row.isCompleted)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAccountRows((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], isCompleted: checked };
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                          aria-label={`Account ${i + 1} completed`}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-8 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-4">
            <div>
              <p className="text-xs font-medium uppercase text-emerald-800">
                Net quintals
              </p>
              <p className="font-mono text-lg font-semibold text-zinc-900">
                {netQuintals.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-emerald-800">
                Amount (× {quintalRate})
              </p>
              <p className="text-lg font-semibold text-emerald-900">
                {formatRupees(amount)}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Upload PDF <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPdfFile(f || null);
              }}
              className="block w-full max-w-md text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
            />
            {isEditMode && existingPdfUrl && !pdfFile && (
              <p className="mt-2 text-sm">
                <a
                  href={existingPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-700 underline"
                >
                  Open current PDF
                </a>
                <span className="text-zinc-500">
                  {" "}
                  — choose a file above to replace it
                </span>
              </p>
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
                ? "Update truck sheet"
                : "Save truck sheet"}
          </button>
        </form>
      </div>

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

      {rskModalOpen && (
        <Modal
          title="New RSK"
          onClose={() => {
            setRskModalOpen(false);
            setNewRskName("");
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = newRskName.trim();
              if (!v) return;
              setRsk(v);
              setNewRskName("");
              setRskSearch("");
              setRskModalOpen(false);
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                RSK reference
              </label>
              <input
                autoFocus
                value={newRskName}
                onChange={(e) => setNewRskName(e.target.value)}
                className="w-full rounded-xl border border-emerald-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Enter RSK"
              />
            </div>
            <button
              type="submit"
              disabled={!newRskName.trim()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Use this RSK
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
    </div>
  );
}

export default AddTruckSheet;
