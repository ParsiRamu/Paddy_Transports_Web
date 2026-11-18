import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const SIDEBAR_COLLAPSED_KEY = "hari-dashboard-sidebar-collapsed";
const SIDEBAR_WIDTH_KEY = "hari-dashboard-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 260; // px
const MIN_SIDEBAR_WIDTH = 220; // px
const MAX_SIDEBAR_WIDTH = 420; // px

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function readStoredSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (
        Number.isFinite(parsed) &&
        parsed >= MIN_SIDEBAR_WIDTH &&
        parsed <= MAX_SIDEBAR_WIDTH
      ) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function SidebarSection({ title, open, onToggle, links }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-zinc-400/70 bg-white shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.08)] transition-all">
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
            "shrink-0 text-emerald-300 transition-transform duration-300 ease-out",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        className={[
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
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
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);

  const location = useLocation();
  const isPaddyActive = location.pathname.startsWith("/paddy");
  const isTruckSheetActive = location.pathname.startsWith("/truck-sheet");
  const isFtoActive = location.pathname.startsWith("/fto");
  const isDriversActive = location.pathname.startsWith("/drivers");
  const isWorkersActive = location.pathname.startsWith("/workers");
  const isFarmerAadhaarActive =
    location.pathname.startsWith("/farmer-aadhaar");

  const [paddyUserToggle, setPaddyUserToggle] = useState(null);
  const [truckSheetUserToggle, setTruckSheetUserToggle] = useState(null);
  const [ftoUserToggle, setFtoUserToggle] = useState(null);
  const [driversUserToggle, setDriversUserToggle] = useState(null);
  const [workersUserToggle, setWorkersUserToggle] = useState(null);
  const [farmerAadhaarUserToggle, setFarmerAadhaarUserToggle] = useState(null);

  const paddyOpen = paddyUserToggle !== null ? paddyUserToggle : isPaddyActive;
  const truckSheetOpen =
    truckSheetUserToggle !== null ? truckSheetUserToggle : isTruckSheetActive;
  const ftoOpen = ftoUserToggle !== null ? ftoUserToggle : isFtoActive;
  const driversOpen =
    driversUserToggle !== null ? driversUserToggle : isDriversActive;
  const workersOpen =
    workersUserToggle !== null ? workersUserToggle : isWorkersActive;
  const farmerAadhaarOpen =
    farmerAadhaarUserToggle !== null
      ? farmerAadhaarUserToggle
      : isFarmerAadhaarActive;

  // Collapse All / Expand All actions
  const handleCollapseAll = useCallback(() => {
    setPaddyUserToggle(false);
    setTruckSheetUserToggle(false);
    setDriversUserToggle(false);
    setWorkersUserToggle(false);
    setFtoUserToggle(false);
    setFarmerAadhaarUserToggle(false);
  }, []);

  const handleExpandAll = useCallback(() => {
    setPaddyUserToggle(true);
    setTruckSheetUserToggle(true);
    setDriversUserToggle(true);
    setWorkersUserToggle(true);
    setFtoUserToggle(true);
    setFarmerAadhaarUserToggle(true);
  }, []);

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

  // Draggable sidebar width resizing logic
  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const newWidth = Math.min(
        Math.max(e.clientX, MIN_SIDEBAR_WIDTH),
        MAX_SIDEBAR_WIDTH,
      );
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
      } catch {
        /* ignore */
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

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

      {/* Main Sidebar: Resizable, smooth sliding & non-squishing */}
      <aside
        style={{
          width: sidebarCollapsedDesktop ? 0 : `${sidebarWidth}px`,
        }}
        className={[
          "fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh shrink-0 flex-col overflow-hidden border-r border-zinc-300/90 bg-white/95 shadow-[6px_0_24px_-4px_rgba(15,23,42,0.14)] backdrop-blur-md transition-[transform,width] duration-300 ease-out",
          "lg:static lg:z-auto lg:h-full lg:max-h-none lg:translate-x-0 lg:shadow-[4px_0_18px_-4px_rgba(15,23,42,0.1)] lg:backdrop-blur-none",
          sidebarCollapsedDesktop
            ? "lg:w-0 lg:overflow-hidden lg:border-r-0 lg:opacity-0"
            : "lg:opacity-100",
          sidebarOpen ? "translate-x-0 w-[min(85vw,300px)]" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* Header Branding */}
        <div className="shrink-0 border-b border-zinc-300/80 bg-linear-to-r from-white to-emerald-50/50 px-4 py-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-600/90">
            Harikrishna
          </p>
          <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-zinc-900">
            Transports
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">Operations dashboard</p>
        </div>

        {/* Quick Menu Slide Controls */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/60 bg-zinc-50/80 px-3.5 py-1.5 text-[0.65rem] font-semibold text-zinc-500">
          <span className="uppercase tracking-wider text-emerald-800">
            Menu Navigation
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCollapseAll}
              className="text-zinc-500 transition hover:text-emerald-800 hover:underline"
              title="Slide all sections closed"
            >
              Collapse all
            </button>
            <span className="text-zinc-300">·</span>
            <button
              type="button"
              onClick={handleExpandAll}
              className="text-zinc-500 transition hover:text-emerald-800 hover:underline"
              title="Slide all sections open"
            >
              Expand all
            </button>
          </div>
        </div>

        {/* Navigation list with smooth custom scrollbar */}
        <nav className="sidebar-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain p-3">
          <SidebarSection
            title="Paddy"
            open={paddyOpen}
            onToggle={() => setPaddyUserToggle(!paddyOpen)}
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
            onToggle={() => setTruckSheetUserToggle(!truckSheetOpen)}
            links={[
              { to: "/truck-sheet/add", label: "Add truck sheet" },
              { to: "/truck-sheet/view", label: "View truck sheet" },
            ]}
          />
          <SidebarSection
            title="Drivers"
            open={driversOpen}
            onToggle={() => setDriversUserToggle(!driversOpen)}
            links={[
              { to: "/drivers/add", label: "Add driver data" },
              { to: "/drivers/view", label: "View driver data" },
            ]}
          />
          <SidebarSection
            title="Workers"
            open={workersOpen}
            onToggle={() => setWorkersUserToggle(!workersOpen)}
            links={[
              { to: "/workers/view", label: "View Workers Data" },
              { to: "/workers/pay", label: "Workers Pay" },
            ]}
          />
          <SidebarSection
            title="FTO SERIES"
            open={ftoOpen}
            onToggle={() => setFtoUserToggle(!ftoOpen)}
            links={[
              { to: "/fto/view", label: "View FTO" },
            ]}
          />
          <SidebarSection
            title="Farmer Aadhaar"
            open={farmerAadhaarOpen}
            onToggle={() =>
              setFarmerAadhaarUserToggle(!farmerAadhaarOpen)
            }
            links={[
              { to: "/farmer-aadhaar/add", label: "Add Aadhaar" },
              { to: "/farmer-aadhaar/view", label: "View Aadhaar" },
            ]}
          />
        </nav>

        {/* Logout Footer */}
        <div className="shrink-0 border-t border-zinc-300/80 bg-white/80 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.1)] transition-all hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.99]"
          >
            Log out
          </button>
        </div>

        {/* Draggable Desktop Resize Handle */}
        <div
          onMouseDown={startResizing}
          onDoubleClick={() => {
            setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
            try {
              localStorage.setItem(
                SIDEBAR_WIDTH_KEY,
                String(DEFAULT_SIDEBAR_WIDTH),
              );
            } catch {
              /* ignore */
            }
          }}
          title="Drag to adjust sidebar width · Double click to reset"
          className={`absolute inset-y-0 -right-1 z-50 hidden w-2.5 cursor-col-resize select-none transition-colors group hover:bg-emerald-500/30 active:bg-emerald-600 lg:block ${
            isResizing ? "bg-emerald-600 w-1" : "bg-transparent"
          }`}
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0.5 h-8 w-1 rounded-full bg-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex shrink-0 items-center gap-3 border-b border-zinc-300/90 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.1)] backdrop-blur-md">
          {/* Mobile menu button */}
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

          {/* Desktop sidebar toggle button */}
          <button
            type="button"
            aria-label={
              sidebarCollapsedDesktop ? "Show sidebar" : "Hide sidebar"
            }
            title={
              sidebarCollapsedDesktop
                ? "Show sidebar (expand)"
                : "Hide sidebar (collapse)"
            }
            onClick={toggleSidebarCollapsedDesktop}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-white text-emerald-800 shadow-sm shadow-zinc-900/10 transition-colors hover:bg-emerald-50 lg:inline-flex"
          >
            {sidebarCollapsedDesktop ? (
              /* When collapsed: arrow points right to expand */
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
            ) : (
              /* When open: arrow points left to collapse */
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
