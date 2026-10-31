function DashboardHome() {
  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-100/90 bg-white/80 p-8 shadow-lg shadow-emerald-900/[0.06] backdrop-blur-sm sm:p-10">
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
