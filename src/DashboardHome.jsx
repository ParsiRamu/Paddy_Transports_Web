function DashboardHome() {
  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-400/75 bg-white/90 p-8 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16),0_4px_10px_-2px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-10">
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800">
          Overview
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Welcome back
        </h2>
        <p className="mt-3 leading-relaxed text-zinc-600">
          Open <span className="font-medium text-emerald-700">Paddy</span> in
          the sidebar to add or view records. Your workspace uses a clean white
          and green theme for focus and clarity.
        </p>
      </div>
    </div>
  );
}

export default DashboardHome;
