import Link from "next/link";

export default function FloatingRouteDeprecatedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="max-w-md rounded-3xl border border-cyan-400/20 bg-slate-900 p-6 text-center shadow-2xl shadow-cyan-950/30">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Heather Web Mode</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Desktop launcher removed</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Heather 1.0 is now a web-first assistant. Use the browser dashboard instead of the old floating desktop route.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950">
          Open Heather dashboard
        </Link>
      </section>
    </main>
  );
}
