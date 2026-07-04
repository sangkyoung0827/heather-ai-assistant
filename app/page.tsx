"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type LogItem = { id: string; title: string; detail: string; state: "ready" | "done" | "pending" };

const navItems = ["Dashboard", "Chat", "Projects", "Memory", "Settings"] as const;

const starterMessages: Message[] = [
  {
    id: "hello",
    role: "assistant",
    content:
      "Heather 1.0 Web Mode is online. I am a clean browser-first assistant shell for chat, projects, memory, settings, and action logging."
  }
];

const starterLog: LogItem[] = [
  {
    id: "boot",
    title: "Heather web shell loaded",
    detail: "Dashboard, sidebar, chat, placeholders, and API route are active.",
    state: "done"
  },
  {
    id: "web-mode",
    title: "Web Mode enabled",
    detail: "Desktop/Tauri behavior is intentionally excluded from Heather 1.0 MVP.",
    state: "ready"
  }
];

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function HomePage() {
  const [active, setActive] = useState<(typeof navItems)[number]>("Dashboard");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [log, setLog] = useState<LogItem[]>(starterLog);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setDraft("");
    setSending(true);
    setMessages((items) => [...items, { id: id("user"), role: "user", content: message }]);
    setLog((items) => [
      { id: id("request"), title: "Chat request sent", detail: message.slice(0, 120), state: "pending" },
      ...items
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = (await response.json()) as { message?: string; mode?: string; error?: string };
      setMessages((items) => [
        ...items,
        { id: id("assistant"), role: "assistant", content: data.message || data.error || "No response returned." }
      ]);
      setLog((items) => [
        {
          id: id("response"),
          title: "Assistant response received",
          detail: `Route: /api/chat · Mode: ${data.mode || "web-mvp"}`,
          state: response.ok ? "done" : "pending"
        },
        ...items
      ]);
    } catch {
      setMessages((items) => [
        ...items,
        { id: id("error"), role: "assistant", content: "The browser could not reach /api/chat." }
      ]);
      setLog((items) => [
        { id: id("failed"), title: "Chat request failed", detail: "Check the Next.js dev server.", state: "pending" },
        ...items
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.16),transparent_34%)]" />
      <div className="fixed inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 lg:flex-row">
        <aside className="rounded-3xl border border-cyan-400/20 bg-slate-900/85 p-4 shadow-2xl shadow-cyan-950/30 lg:w-72">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-300/10 text-xl font-black text-cyan-200">
              H
            </div>
            <p className="text-sm font-semibold text-cyan-200">Heather AI Assistant / 헤더</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Web-based Jarvis-like personal AI assistant</h1>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> Web Mode
            </span>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActive(item)}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  active === item
                    ? "border border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                    : "border border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <header className="rounded-3xl border border-cyan-400/20 bg-slate-900/85 p-6 shadow-2xl shadow-cyan-950/30">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Heather 1.0</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Clean web-first command center.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                A visible, deployable web MVP with dashboard, chat, left sidebar, Web Mode badge, Action Log, and placeholders for Projects, Memory, and Settings.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {[
                  ["Mode", "Web"],
                  ["Surface", "MVP"],
                  ["Desktop", "Off"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 font-semibold text-cyan-100">{value}</p>
                  </div>
                ))}
              </div>
            </header>

            <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-4 shadow-2xl shadow-slate-950/40">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-cyan-200">Chat Panel</p>
                  <h3 className="text-xl font-semibold text-white">Talk to Heather</h3>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">/api/chat</span>
              </div>

              <div className="h-[340px] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
                      message.role === "assistant"
                        ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
                        : "ml-auto border-slate-600 bg-slate-800 text-white"
                    }`}
                  >
                    <p className="mb-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {message.role === "assistant" ? "Heather" : "You"}
                    </p>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </article>
                ))}
              </div>

              <form onSubmit={sendMessage} className="mt-4 flex flex-col gap-3 md:flex-row">
                <textarea
                  value={draft}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
                  placeholder="Ask Heather about a project, memory, setting, or web action..."
                  className="min-h-24 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 md:w-32"
                >
                  {sending ? "Sending" : "Send"}
                </button>
              </form>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
              <Placeholder title="Projects" body="Placeholder for active builds, next actions, and deployment notes." />
              <Placeholder title="Memory" body="Placeholder for approved durable preferences and reusable context." />
              <Placeholder title="Settings" body="Placeholder for language, model routing, privacy, and confirmations." />
            </div>
          </div>

          <aside className="rounded-3xl border border-cyan-400/20 bg-slate-900/85 p-4 shadow-2xl shadow-cyan-950/30">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-cyan-200">Action Log</p>
                <h3 className="text-xl font-semibold text-white">Web activity</h3>
              </div>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs text-slate-400">{log.length} events</span>
            </div>
            <div className="space-y-3">
              {log.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p>
                    </div>
                    <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-200">
                      {item.state}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-slate-700 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/30">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Placeholder</p>
      <h3 className="mt-3 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
    </article>
  );
}
