import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center">
        <p className="text-sm font-semibold text-cyan-200">Heather 1.0</p>
        <h1 className="mt-2 text-2xl font-bold text-white">헤더 앱으로 이동</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">요청한 경로를 찾지 못했습니다.</p>
        <Link href="/" className="mt-5 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950">
          대시보드 열기
        </Link>
      </section>
    </main>
  );
}
