import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ToastContainer, toast } from "react-toastify";
import {
  CreditCard,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  List,
} from "lucide-react";
import { db } from "./firebase";
import "react-toastify/dist/ReactToastify.css";

function formatAadhaarDisplay(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

export default function AddFarmerAadhaar() {
  const { id: editDocId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(editDocId);

  const [farmerName, setFarmerName] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [existingRecords, setExistingRecords] = useState([]);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Real-time listener for existing farmer Aadhaar records to validate uniqueness
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "farmer_aadhaar"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExistingRecords(list);
      },
      (err) => console.error("Error loading farmer aadhaar records:", err),
    );
    return () => unsub();
  }, []);

  // If in edit mode, load the specific document
  useEffect(() => {
    if (!editDocId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "farmer_aadhaar", editDocId));
        if (cancelled) return;
        if (!snap.exists()) {
          setLoadError("Aadhaar record not found.");
          setLoading(false);
          return;
        }
        const data = snap.data();
        setFarmerName(data.farmerName || "");
        setAadhaarNumber(data.aadhaarNumber || "");
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || "Failed to load record.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editDocId]);

  // Clean raw 12-digit Aadhaar
  const cleanedAadhaar = aadhaarNumber.replace(/\D/g, "").slice(0, 12);

  // Check if Aadhaar number is already used by another record
  const duplicateRecord =
    cleanedAadhaar.length === 12
      ? existingRecords.find(
          (r) =>
            r.id !== editDocId &&
            String(r.aadhaarNumber || "").replace(/\D/g, "") === cleanedAadhaar,
        )
      : null;

  // Handle saving
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      const trimmedName = farmerName.trim().toUpperCase();
      if (!trimmedName) {
        alert("Please enter the Farmer Name.");
        return;
      }

      if (cleanedAadhaar.length !== 12) {
        alert("Aadhaar Number must be exactly 12 digits (numbers only).");
        return;
      }

      // Check for duplicate Aadhaar
      if (duplicateRecord) {
        const alertMsg =
          `⚠️ Duplicate Aadhaar Number Alert!\n\n` +
          `The Aadhaar number "${formatAadhaarDisplay(cleanedAadhaar)}" is already registered for:\n` +
          `• Farmer Name: ${duplicateRecord.farmerName}\n\n` +
          `Each farmer must have a unique 12-digit Aadhaar number. Please check and enter the correct Aadhaar.`;
        alert(alertMsg);
        toast.error(`Aadhaar already registered for ${duplicateRecord.farmerName}!`);
        return;
      }

      setSaving(true);
      try {
        if (isEditMode) {
          await updateDoc(doc(db, "farmer_aadhaar", editDocId), {
            farmerName: trimmedName,
            aadhaarNumber: cleanedAadhaar,
            updatedAt: serverTimestamp(),
          });
          toast.success(`Aadhaar updated for ${trimmedName}!`);
          navigate("/farmer-aadhaar/view");
        } else {
          await addDoc(collection(db, "farmer_aadhaar"), {
            farmerName: trimmedName,
            aadhaarNumber: cleanedAadhaar,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          toast.success(`Aadhaar saved for ${trimmedName}!`);
          setFarmerName("");
          setAadhaarNumber("");
        }
      } catch (err) {
        console.error("Save error:", err);
        alert(err.message || "Failed to save record.");
      } finally {
        setSaving(false);
      }
    },
    [
      farmerName,
      cleanedAadhaar,
      duplicateRecord,
      isEditMode,
      editDocId,
      navigate,
    ],
  );

  const handleReset = () => {
    setFarmerName("");
    setAadhaarNumber("");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center p-8 text-sm text-zinc-500">
        Loading Aadhaar record…
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <ToastContainer position="top-right" autoClose={3000} />

        {/* Top Header Card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-400/75 bg-white/90 p-6 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              {isEditMode ? "EDIT FARMER AADHAAR" : "ADD FARMER AADHAAR"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600">
              Register unique 12-digit Aadhaar details for each farmer.
            </p>
          </div>

          <Link
            to="/farmer-aadhaar/view"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-[#107C41] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition-all hover:bg-[#0b5a2f] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 sm:self-center"
            title="View all registered Aadhaar records"
          >
            <List className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>View Aadhaar</span>
          </Link>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {/* Form Container */}
        <div className="rounded-2xl border border-zinc-400/75 bg-white p-6 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Field 1: FARMER NAME (Manual Enter Name Only) */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-semibold tracking-wide text-zinc-700 uppercase">
                  Farmer Name <span className="text-red-500">*</span>
                </label>
                <span className="text-[0.65rem] text-zinc-400 font-medium">
                  Manual text entry
                </span>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className="h-4 w-4 text-zinc-400" />
                </div>
                <input
                  type="text"
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  placeholder="Enter farmer full name…"
                  autoComplete="off"
                  required
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-zinc-900 uppercase shadow-sm outline-none transition placeholder:normal-case placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                />
              </div>
              <p className="mt-1 text-[0.7rem] text-zinc-500">
                Type the farmer name as it appears on official records.
              </p>
            </div>

            {/* Field 2: AADHAAR NUMBER (Unique 12-Digit Aadhaar Input) */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-semibold tracking-wide text-zinc-700 uppercase">
                  Aadhaar Number <span className="text-red-500">*</span>
                </label>
                <span
                  className={`text-[0.7rem] font-mono font-semibold ${
                    cleanedAadhaar.length === 12
                      ? duplicateRecord
                        ? "text-red-600"
                        : "text-emerald-700"
                      : "text-zinc-400"
                  }`}
                >
                  {cleanedAadhaar.length} / 12 digits
                </span>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <CreditCard className="h-4 w-4 text-zinc-400" />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={aadhaarNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                    setAadhaarNumber(digits);
                  }}
                  placeholder="Enter 12-digit Aadhaar (e.g. 1234 5678 9012)"
                  autoComplete="off"
                  required
                  className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm font-mono tracking-wider shadow-sm outline-none transition ${
                    duplicateRecord
                      ? "border-red-500 bg-red-50/70 font-bold text-red-950 focus:border-red-500 focus:ring-2 focus:ring-red-500/25"
                      : "border-zinc-300 bg-white text-zinc-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                  }`}
                />
              </div>

              {/* Duplicate Aadhaar Warning */}
              {duplicateRecord ? (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>
                    <strong>Duplicate Aadhaar:</strong> Already registered for{" "}
                    <strong>{duplicateRecord.farmerName}</strong>. Aadhaar must be unique!
                  </span>
                </div>
              ) : cleanedAadhaar.length === 12 ? (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Valid 12-digit unique Aadhaar:{" "}
                    <strong>{formatAadhaarDisplay(cleanedAadhaar)}</strong>
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-[0.7rem] text-zinc-500">
                  Aadhaar numbers must be unique and contain exactly 12 numeric digits.
                </p>
              )}
            </div>

            {/* Live Card Preview Box */}
            {farmerName.trim() && cleanedAadhaar.length > 0 && (
              <div className="rounded-xl border border-emerald-300/80 bg-linear-to-br from-emerald-50/70 via-white to-emerald-50/30 p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                  <div className="flex items-center gap-1.5 text-emerald-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider">
                      Farmer Aadhaar Card Preview
                    </span>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-800">
                    Govt of India Spec
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-base font-bold text-zinc-900 uppercase">
                    {farmerName.trim()}
                  </p>
                  <p className="mt-1 font-mono text-lg font-extrabold tracking-widest text-[#2D6A4F]">
                    {formatAadhaarDisplay(cleanedAadhaar)}
                  </p>
                </div>
              </div>
            )}

            {/* Form Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-5">
              {!isEditMode && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98]"
                >
                  <RotateCcw className="h-4 w-4 text-zinc-400" />
                  <span>Reset</span>
                </button>
              )}

              <button
                type="submit"
                disabled={
                  saving ||
                  !farmerName.trim() ||
                  cleanedAadhaar.length !== 12 ||
                  Boolean(duplicateRecord)
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-950/10 transition-all hover:bg-[#245840] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {saving
                    ? "Saving…"
                    : isEditMode
                      ? "Update Aadhaar"
                      : "Save Aadhaar"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
