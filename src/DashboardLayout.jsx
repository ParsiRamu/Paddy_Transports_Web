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

function SidebarSection({ title, open, onToggle, links }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-400/70 bg-white shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.08)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 bg-linear-to-r from-[#263C35] to-[#2E483F] px-3.5 py-3 text-left text-sm font-bold tracking-wide text-[#EEF6F2] transition-all hover:from-[#2B453D] hover:to-[#355349]"
      >
        <span>{title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={[
            "shrink-0 text-emerald-300 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="space-y-1 border-t border-zinc-300/80 bg-zinc-50/75 px-2.5 py-2">
            {links.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive: linkActive }) =>
                    [
                      "block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      linkActive
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                        : "text-zinc-700 hover:bg-emerald-100/70 hover:text-emerald-900",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DashboardLayout({ onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] = useState(
    readSidebarCollapsed,
  );
  const [paddyOpen, setPaddyOpen] = useState(false);
  const [truckSheetOpen, setTruckSheetOpen] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const [workersOpen, setWorkersOpen] = useState(false);
  const location = useLocation();
  const isPaddyActive = location.pathname.startsWith("/paddy");
  const isTruckSheetActive = location.pathname.startsWith("/truck-sheet");
  const isDriversActive = location.pathname.startsWith("/drivers");
  const isWorkersActive = location.pathname.startsWith("/workers");

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

  useEffect(() => {
    if (isWorkersActive) setWorkersOpen(true);
  }, [isWorkersActive]);

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
          "fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-[min(85vw,260px)] shrink-0 flex-col overflow-hidden border-r border-zinc-300/90 bg-white/95 shadow-[6px_0_24px_-4px_rgba(15,23,42,0.14)] backdrop-blur-md transition-transform duration-300 ease-out",
          "lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-[20%] lg:min-w-44 lg:max-w-xs lg:translate-x-0 lg:shadow-[4px_0_18px_-4px_rgba(15,23,42,0.1)] lg:backdrop-blur-none",
          sidebarCollapsedDesktop ? "lg:hidden" : "",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="shrink-0 border-b border-zinc-300/80 bg-linear-to-r from-white to-emerald-50/50 px-4 py-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-600/90">
            Harikrishna
          </p>
          <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-zinc-900">
            Transports
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">Operations dashboard</p>
        </div>

        <nav className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
          <SidebarSection
            title="Paddy"
            open={paddyOpen}
            onToggle={() => setPaddyOpen((o) => !o)}
            links={[
              { to: "/paddy/add", label: "Add Paddy" },
              { to: "/paddy/view", label: "View Paddy" },
              { to: "/paddy/kayidha-paddy", label: "Individual kayidha paddy" },
              { to: "/paddy/calculate-kayidha", label: "Calculate Kayidha" },
            ]}
          />
          <SidebarSection
            title="Truck sheet"
            open={truckSheetOpen}
            onToggle={() => setTruckSheetOpen((o) => !o)}
            links={[
              { to: "/truck-sheet/add", label: "Add truck sheet" },
              { to: "/truck-sheet/view", label: "View truck sheet" },
            ]}
          />
          <SidebarSection
            title="Drivers"
            open={driversOpen}
            onToggle={() => setDriversOpen((o) => !o)}
            links={[
              { to: "/drivers/add", label: "Add driver data" },
              { to: "/drivers/view", label: "View driver data" },
            ]}
          />
          <SidebarSection
            title="Workers"
            open={workersOpen}
            onToggle={() => setWorkersOpen((o) => !o)}
            links={[
              { to: "/workers/view", label: "View Workers Data" },
              { to: "/workers/pay", label: "Workers Pay" },
            ]}
          />
        </nav>

        <div className="shrink-0 border-t border-zinc-300/80 bg-white/80 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.1)] transition-all hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.99]"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex shrink-0 items-center gap-3 border-b border-zinc-300/90 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.1)] backdrop-blur-md">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-white text-emerald-800 shadow-sm shadow-zinc-900/10 transition-colors hover:bg-emerald-50 lg:hidden"
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
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-white text-emerald-800 shadow-sm shadow-zinc-900/10 transition-colors hover:bg-emerald-50 lg:inline-flex"
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
