import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const SIDEBAR_COLLAPSED_KEY = "hari-dashboard-sidebar-collapsed";

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function DashboardLayout({ onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] = useState(
    readSidebarCollapsed,
  );
  const [paddyOpen, setPaddyOpen] = useState(false);
  const [truckSheetOpen, setTruckSheetOpen] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const location = useLocation();
  const isPaddyActive = location.pathname.startsWith("/paddy");
  const isTruckSheetActive = location.pathname.startsWith("/truck-sheet");
  const isDriversActive = location.pathname.startsWith("/drivers");

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isPaddyActive) setPaddyOpen(true);
  }, [isPaddyActive]);

  useEffect(() => {
    if (isTruckSheetActive) setTruckSheetOpen(true);
  }, [isTruckSheetActive]);

  useEffect(() => {
    if (isDriversActive) setDriversOpen(true);
  }, [isDriversActive]);

  const toggleSidebarCollapsedDesktop = useCallback(() => {
    setSidebarCollapsedDesktop((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-dvh max-h-dvh w-full overflow-hidden bg-linear-to-br from-white via-emerald-50/40 to-white">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-[min(85vw,260px)] shrink-0 flex-col overflow-hidden border-r border-emerald-100/80 bg-white/95 shadow-xl shadow-emerald-900/5 backdrop-blur-md transition-transform duration-300 ease-out",
          "lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-[20%] lg:min-w-44 lg:max-w-xs lg:translate-x-0 lg:shadow-none lg:backdrop-blur-none",
          sidebarCollapsedDesktop ? "lg:hidden" : "",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="shrink-0 border-b border-emerald-100/90 bg-linear-to-r from-white to-emerald-50/50 px-4 py-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-600/90">
            Harikrishna
          </p>
          <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-zinc-900">
            Transports
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">Operations dashboard</p>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          <div className="overflow-hidden rounded-xl border border-emerald-100/80 bg-white shadow-sm shadow-emerald-900/3">
            <button
              type="button"
              onClick={() => setPaddyOpen((o) => !o)}
              aria-expanded={paddyOpen}
              className={[
                "flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-sm font-semibold transition-colors",
                isPaddyActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-zinc-800 hover:bg-emerald-50/60",
              ].join(" ")}
            >
              <span>Paddy</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={[
                  "shrink-0 text-emerald-600 transition-transform duration-200",
                  paddyOpen ? "rotate-180" : "",
                ].join(" ")}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div
              className={[
                "grid transition-[grid-template-rows] duration-200 ease-out",
                paddyOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              ].join(" ")}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="space-y-0.5 border-t border-emerald-50 px-2 py-2">
                  <li>
                    <NavLink
                      to="/paddy/add"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      Add Paddy
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/paddy/view"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      View Paddy
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/paddy/kayidha-paddy"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      Individual kayidha paddy
                    </NavLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-emerald-100/80 bg-white shadow-sm shadow-emerald-900/3">
            <button
              type="button"
              onClick={() => setTruckSheetOpen((o) => !o)}
              aria-expanded={truckSheetOpen}
              className={[
                "flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-sm font-semibold transition-colors",
                isTruckSheetActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-zinc-800 hover:bg-emerald-50/60",
              ].join(" ")}
            >
              <span>Truck sheet</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={[
                  "shrink-0 text-emerald-600 transition-transform duration-200",
                  truckSheetOpen ? "rotate-180" : "",
                ].join(" ")}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div
              className={[
                "grid transition-[grid-template-rows] duration-200 ease-out",
                truckSheetOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              ].join(" ")}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="space-y-0.5 border-t border-emerald-50 px-2 py-2">
                  <li>
                    <NavLink
                      to="/truck-sheet/add"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      Add truck sheet
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/truck-sheet/view"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      View truck sheet
                    </NavLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-emerald-100/80 bg-white shadow-sm shadow-emerald-900/3">
            <button
              type="button"
              onClick={() => setDriversOpen((o) => !o)}
              aria-expanded={driversOpen}
              className={[
                "flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-sm font-semibold transition-colors",
                isDriversActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-zinc-800 hover:bg-emerald-50/60",
              ].join(" ")}
            >
              <span>Drivers</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={[
                  "shrink-0 text-emerald-600 transition-transform duration-200",
                  driversOpen ? "rotate-180" : "",
                ].join(" ")}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div
              className={[
                "grid transition-[grid-template-rows] duration-200 ease-out",
                driversOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              ].join(" ")}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="space-y-0.5 border-t border-emerald-50 px-2 py-2">
                  <li>
                    <NavLink
                      to="/drivers/add"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      Add driver data
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/drivers/view"
                      className={({ isActive }) =>
                        [
                          "block rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800",
                        ].join(" ")
                      }
                    >
                      View driver data
                    </NavLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </nav>

        <div className="shrink-0 border-t border-emerald-100/90 bg-white/80 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.99]"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex shrink-0 items-center gap-3 border-b border-emerald-100/80 bg-white/90 px-4 py-3.5 shadow-sm shadow-emerald-900/4 backdrop-blur-md">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-800 shadow-sm transition-colors hover:bg-emerald-50 lg:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={
              sidebarCollapsedDesktop ? "Show sidebar" : "Hide sidebar"
            }
            title={
              sidebarCollapsedDesktop ? "Show sidebar" : "Hide sidebar"
            }
            onClick={toggleSidebarCollapsedDesktop}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-800 shadow-sm transition-colors hover:bg-emerald-50 lg:inline-flex"
          >
            {sidebarCollapsedDesktop ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m11 19-7-7 7-7" />
                <path d="m18 19-7-7 7-7" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m13 19 7-7-7-7" />
                <path d="m6 19 7-7-7-7" />
              </svg>
            )}
          </button>
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-zinc-800 lg:hidden">
            Menu
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
