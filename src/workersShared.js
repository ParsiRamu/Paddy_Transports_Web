/** Shared constants and calculation helpers for Workers Data & Workers Pay views. */

export const WORKER_RATES_STORAGE_KEY = "hari_workers_rates_by_journey";
export const WORKER_PADDY_AMT_STORAGE_KEY =
  "hari_workers_paddy_amt_by_journey";

export function journeyDateKey(j) {
  const s = String(j?.date ?? "").trim();
  if (!s) return "";
  return s.slice(0, 10);
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  const s = String(dateStr).trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${dd}-${mm}-${yyyy}`;
  }
  return s;
}

export function readStoredJsonMap(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Computes Rate, TL Workers Amt (totalNetKata * rate), Worker Paddy Amt,
 * and Amount per Worker ((tlWorkerAmt + workerPaddyAmt) / workerCount).
 */
export function computeJourneyWorkerAmounts(
  j,
  ratesByJourney,
  workerPaddyAmtByJourney,
) {
  const rawRate = ratesByJourney?.[j.id];
  const rate =
    rawRate != null && rawRate !== "" && Number.isFinite(Number(rawRate))
      ? Number(rawRate)
      : null;
  const totalNetKata =
    j?.totalNetKatas != null && Number.isFinite(Number(j.totalNetKatas))
      ? Number(j.totalNetKatas)
      : null;
  const workerCount = Array.isArray(j?.workerIds) ? j.workerIds.length : 0;

  const tlWorkerAmt =
    rate != null && totalNetKata != null ? totalNetKata * rate : null;

  const rawWorkerPaddyAmt = workerPaddyAmtByJourney?.[j.id] ?? "";
  const parsedPaddyNum = Number(rawWorkerPaddyAmt);
  const workerPaddyAmt =
    rawWorkerPaddyAmt !== "" &&
    Number.isFinite(parsedPaddyNum) &&
    parsedPaddyNum >= 0
      ? parsedPaddyNum
      : null;

  const hasAnyWorkerAmt = tlWorkerAmt != null || workerPaddyAmt != null;
  const amountPerWorker =
    hasAnyWorkerAmt && workerCount > 0
      ? ((tlWorkerAmt ?? 0) + (workerPaddyAmt ?? 0)) / workerCount
      : null;

  return {
    rate,
    totalNetKata,
    workerCount,
    tlWorkerAmt,
    rawWorkerPaddyAmt,
    workerPaddyAmt,
    amountPerWorker,
  };
}
