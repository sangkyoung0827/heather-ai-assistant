"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type View = "dashboard" | "chat" | "memory" | "directCommands";
type ChatRoute = "direct_command" | "api";

type DirectCommand = {
  id: string;
  title: string;
  question: string;
  response: string;
  enabled: boolean;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: ChatRoute;
  provider?: string;
  model?: string;
};

type DirectCommandDraft = Omit<DirectCommand, "id">;

type ApiResponse = {
  message?: string;
  route?: ChatRoute;
  provider?: string;
  model?: string;
  error?: string;
};

const STORAGE_KEY = "heather.directCommands.v1";

const MENU_ITEMS: { id: View; label: string }[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "chat", label: "채팅" },
  { id: "memory", label: "메모리" },
  { id: "directCommands", label: "직접명령등록" }
];

const EMPTY_COMMAND: DirectCommandDraft = {
  title: "",
  question: "",
  response: "",
  enabled: true
};

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadDirectCommands(): DirectCommand[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DirectCommand[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (command) =>
        typeof command.id === "string" &&
        typeof command.title === "string" &&
        typeof command.question === "string" &&
        typeof command.response === "string" &&
        typeof command.enabled === "boolean"
    );
  } catch {
    return [];
  }
}

function saveDirectCommands(commands: DirectCommand[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

export default function HomePage() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [commands, setCommands] = useState<DirectCommand[]>([]);
  const [commandDraft, setCommandDraft] = useState<DirectCommandDraft>(EMPTY_COMMAND);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "직접명령을 등록한 뒤 채팅에서 정확히 같은 문장을 보내면 저장된 답변을 그대로 반환합니다.",
      route: "api",
      provider: "mock",
      model: "mock-fallback"
    }
  ]);

  useEffect(() => {
    setCommands(loadDirectCommands());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      saveDirectCommands(commands);
    }
  }, [commands]);

  const enabledCommandCount = useMemo(() => commands.filter((command) => command.enabled).length, [commands]);

  function resetCommandForm() {
    setCommandDraft(EMPTY_COMMAND);
    setEditingId(null);
  }

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = commandDraft.title.trim();
    const question = commandDraft.question.trim();

    if (!title || !question || !commandDraft.response) return;

    if (editingId) {
      setCommands((current) =>
        current.map((command) =>
          command.id === editingId
            ? { ...command, title, question, response: commandDraft.response, enabled: commandDraft.enabled }
            : command
        )
      );
    } else {
      setCommands((current) => [
        ...current,
        { id: createId(), title, question, response: commandDraft.response, enabled: commandDraft.enabled }
      ]);
    }

    resetCommandForm();
  }

  function editCommand(command: DirectCommand) {
    setCommandDraft({
      title: command.title,
      question: command.question,
      response: command.response,
      enabled: command.enabled
    });
    setEditingId(command.id);
  }

  function deleteCommand(commandId: string) {
    setCommands((current) => current.filter((command) => command.id !== commandId));
    if (editingId === commandId) resetCommandForm();
  }

  function toggleCommand(commandId: string) {
    setCommands((current) =>
      current.map((command) =>
        command.id === commandId ? { ...command, enabled: !command.enabled } : command
      )
    );
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || sending) return;

    setChatInput("");
    const userMessage: Message = { id: createId(), role: "user", content: question };
    setMessages((current) => [...current, userMessage]);

    const directCommand = commands.find(
      (command) => command.enabled && command.question.trim() === question
    );

    if (directCommand) {
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: directCommand.response,
          route: "direct_command",
          provider: "none",
          model: "none"
        }
      ]);
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question })
      });
      const data = (await response.json()) as ApiResponse;

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: data.message || data.error || "등록된 직접명령이 없어 API 응답으로 처리해야 합니다.",
          route: "api",
          provider: data.provider || "mock",
          model: data.model || "mock-fallback"
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: "등록된 직접명령이 없어 API 응답으로 처리해야 합니다.",
          route: "api",
          provider: "mock",
          model: "mock-fallback"
        }
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:flex-row">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-4 md:w-64">
          <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <p className="text-sm font-semibold text-cyan-200">Heather 1.0</p>
            <h1 className="mt-1 text-2xl font-bold text-white">헤더</h1>
          </div>
          <nav className="space-y-2">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  activeView === item.id
                    ? "bg-cyan-300 text-slate-950"
                    : "bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1 rounded-3xl border border-slate-800 bg-slate-900 p-4 md:p-6">
          {activeView === "dashboard" && (
            <Dashboard commandCount={commands.length} enabledCommandCount={enabledCommandCount} />
          )}
          {activeView === "chat" && (
            <ChatView
              chatInput={chatInput}
              messages={messages}
              sending={sending}
              onInputChange={setChatInput}
              onSubmit={handleChatSubmit}
            />
          )}
          {activeView === "memory" && <MemoryView />}
          {activeView === "directCommands" && (
            <DirectCommandsView
              commands={commands}
              commandDraft={commandDraft}
              editingId={editingId}
              onDraftChange={setCommandDraft}
              onSubmit={handleCommandSubmit}
              onEdit={editCommand}
              onDelete={deleteCommand}
              onToggle={toggleCommand}
              onCancel={resetCommandForm}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function Dashboard({ commandCount, enabledCommandCount }: { commandCount: number; enabledCommandCount: number }) {
  return (
    <div>
      <p className="text-sm font-semibold text-cyan-200">대시보드</p>
      <h2 className="mt-2 text-3xl font-bold text-white">Heather 1.0</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <SummaryCard label="직접명령 매칭" value="활성화" />
        <SummaryCard label="API fallback" value="활성화" />
        <SummaryCard label="등록된 직접명령" value={`${commandCount}개`} />
        <SummaryCard label="활성 직접명령" value={`${enabledCommandCount}개`} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </article>
  );
}

function ChatView({
  chatInput,
  messages,
  sending,
  onInputChange,
  onSubmit
}: {
  chatInput: string;
  messages: Message[];
  sending: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-cyan-200">채팅</p>
      <h2 className="mt-2 text-3xl font-bold text-white">Heather Chat</h2>
      <div className="mt-6 h-[460px] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-4">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[90%] rounded-2xl border px-4 py-3 ${
              message.role === "user"
                ? "ml-auto border-cyan-300/30 bg-cyan-300/10"
                : "border-slate-700 bg-slate-900"
            }`}
          >
            <p className="whitespace-pre-wrap text-sm leading-6 text-white">{message.content}</p>
            {message.role === "assistant" && message.route && (
              <p className="mt-2 text-xs text-slate-500">
                route: {message.route}
                {message.route === "api" ? ` · provider: ${message.provider} · model: ${message.model}` : ""}
              </p>
            )}
          </article>
        ))}
      </div>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 md:flex-row">
        <textarea
          value={chatInput}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="메시지를 입력하세요."
          className="min-h-24 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
        />
        <button
          type="submit"
          disabled={sending || !chatInput.trim()}
          className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
        >
          보내기
        </button>
      </form>
    </div>
  );
}

function MemoryView() {
  return (
    <div>
      <p className="text-sm font-semibold text-cyan-200">메모리</p>
      <h2 className="mt-2 text-3xl font-bold text-white">Memory</h2>
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-300">
        메모리는 다음 단계에서 구현됩니다.
      </div>
    </div>
  );
}

function DirectCommandsView({
  commands,
  commandDraft,
  editingId,
  onDraftChange,
  onSubmit,
  onEdit,
  onDelete,
  onToggle,
  onCancel
}: {
  commands: DirectCommand[];
  commandDraft: DirectCommandDraft;
  editingId: string | null;
  onDraftChange: (draft: DirectCommandDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (command: DirectCommand) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-cyan-200">직접명령등록</p>
      <h2 className="mt-2 text-3xl font-bold text-white">Direct Commands</h2>

      <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="title">
            <input
              value={commandDraft.title}
              onChange={(event) => onDraftChange({ ...commandDraft, title: event.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
            />
          </Field>
          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={commandDraft.enabled}
              onChange={(event) => onDraftChange({ ...commandDraft, enabled: event.target.checked })}
            />
            enabled
          </label>
        </div>
        <Field label="question">
          <textarea
            value={commandDraft.question}
            onChange={(event) => onDraftChange({ ...commandDraft, question: event.target.value })}
            className="min-h-20 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
          />
        </Field>
        <Field label="response">
          <textarea
            value={commandDraft.response}
            onChange={(event) => onDraftChange({ ...commandDraft, response: event.target.value })}
            className="min-h-20 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
          />
        </Field>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">
            {editingId ? "수정" : "추가"}
          </button>
          {editingId && (
            <button type="button" onClick={onCancel} className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-white">
              취소
            </button>
          )}
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {commands.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            등록된 직접명령이 없습니다.
          </div>
        )}
        {commands.map((command) => (
          <article key={command.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white">{command.title}</h3>
                  <span className={`rounded-full px-2 py-1 text-xs ${command.enabled ? "bg-emerald-300/10 text-emerald-200" : "bg-slate-800 text-slate-400"}`}>
                    {command.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">question</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{command.question}</p>
                <p className="mt-3 text-xs text-slate-500">response</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{command.response}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => onToggle(command.id)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs text-white">
                  {command.enabled ? "비활성화" : "활성화"}
                </button>
                <button type="button" onClick={() => onEdit(command)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs text-white">
                  수정
                </button>
                <button type="button" onClick={() => onDelete(command.id)} className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  삭제
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block text-sm text-slate-300">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
