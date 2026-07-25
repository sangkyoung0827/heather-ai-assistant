"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Database, Plus, Save, Search, Trash2 } from "lucide-react";
import { createId, nowIso } from "@heather/core";
import type { MemoryRecord, MemoryType } from "@heather/core";

interface MemoryPanelProps {
  variant?: "personal" | "research";
  memories: MemoryRecord[];
  onSaveMemory: (memory: MemoryRecord) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const MEMORY_TYPES: MemoryType[] = [
  "user_profile",
  "project_context",
  "relationship_analysis",
  "writing_preference",
  "decision_rule",
  "recurring_task",
  "important_fact"
];

export function MemoryPanel({ variant = "personal", memories, onSaveMemory, onDeleteMemory }: MemoryPanelProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const isResearch = variant === "research";
  const title = isResearch ? "연구 메모리" : "개인 메모리";
  const description = isResearch ? "연구 맥락, 실험 기록과 후속 조치를 관리하세요." : "Heather가 장기적으로 참고할 개인 맥락과 결정을 관리하세요.";
  const visibleMemories = useMemo(
    () => memories.filter((memory) => {
      const matchesVariant = isResearch ? memory.type === "project_context" || memory.source.startsWith("research") : memory.type !== "project_context" && !memory.source.startsWith("research");
      const matchesArchive = showArchived || !memory.archived;
      const keyword = search.trim().toLowerCase();
      const matchesSearch = !keyword || `${memory.source} ${memory.content} ${memory.tags.join(" ")}`.toLowerCase().includes(keyword);
      return matchesVariant && matchesArchive && matchesSearch;
    }),
    [isResearch, memories, search, showArchived]
  );
  const [selectedId, setSelectedId] = useState<string | null>(visibleMemories[0]?.id || null);
  const selectedMemory = useMemo(
    () => visibleMemories.find((memory) => memory.id === selectedId) || visibleMemories[0] || null,
    [selectedId, visibleMemories]
  );
  const [draft, setDraft] = useState<MemoryRecord | null>(selectedMemory);

  useEffect(() => {
    if (!selectedId && visibleMemories[0]) {
      setSelectedId(visibleMemories[0].id);
    }
  }, [selectedId, visibleMemories]);

  useEffect(() => {
    setDraft(selectedMemory);
  }, [selectedMemory]);

  async function handleCreateMemory() {
    const timestamp = nowIso();
    const memory: MemoryRecord = {
      id: createId("memory"),
      type: isResearch ? "project_context" : "important_fact",
      content: "",
      source: isResearch ? "research" : "personal",
      confidence: 0.7,
      tags: [],
      created_at: timestamp,
      updated_at: timestamp,
      archived: false
    };

    await onSaveMemory(memory);
    setSelectedId(memory.id);
  }

  async function handleSave() {
    if (!draft) return;
    await onSaveMemory({
      ...draft,
      updated_at: nowIso()
    });
  }

  async function handleArchive() {
    if (!draft) return;
    await onSaveMemory({
      ...draft,
      archived: !draft.archived,
      updated_at: nowIso()
    });
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm("이 기억을 완전히 삭제할까요?")) return;
    await onDeleteMemory(draft.id);
    setSelectedId(null);
  }

  return (
    <div className="memory-workspace">
      <aside className="memory-browser">
        <div className="memory-type-tabs"><a href="/memory/personal" className={!isResearch ? "is-active" : ""}>개인 메모리 <span>{memories.filter((memory) => memory.type !== "project_context" && !memory.source.startsWith("research")).length}</span></a><a href="/memory/research" className={isResearch ? "is-active" : ""}>연구 메모리 <span>{memories.filter((memory) => memory.type === "project_context" || memory.source.startsWith("research")).length}</span></a></div>
        <div className="memory-list-toolbar">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="h-4 w-4 text-heather-700" />
            {title}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className={`grid h-9 w-9 place-items-center rounded-lg border ${
                showArchived ? "border-heather-500 bg-heather-50 text-heather-700" : "border-line bg-white"
              }`}
              title="보관된 기억 보기"
              aria-label="보관된 기억 보기"
            >
              <Archive className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCreateMemory}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-heather-700 hover:bg-heather-50"
              title="기억 추가"
              aria-label="기억 추가"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <label className="memory-search"><Search className="h-4 w-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${title} 검색`} /></label>
        <div className="memory-list heather-scrollbar">
          {visibleMemories.length ? (
            visibleMemories.map((memory) => (
              <button
                key={memory.id}
                type="button"
                onClick={() => setSelectedId(memory.id)}
                className={`memory-row ${
                  draft?.id === memory.id
                    ? "border-heather-500 bg-white"
                    : "border-line bg-white hover:border-heather-300"
                } ${memory.archived ? "opacity-60" : ""}`}
              >
                  <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{memory.source || "제목 없음"}</span>
                  <span className="memory-date">{new Date(memory.updated_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                </span>
                <span className="mt-2 line-clamp-3 text-sm leading-5 text-slate-600">{memory.content}</span>
              </button>
            ))
          ) : (
            <div className="workspace-empty"><strong>아직 저장된 {title}가 없습니다.</strong><p>{isResearch ? "실험 기록과 연구 메모를 저장해보세요." : "중요한 개인 정보와 결정사항을 저장해보세요."}</p></div>
          )}
        </div>
      </aside>

      {draft ? (
        <form
          className="memory-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="editor-heading">
            <div>
              <p>{isResearch ? "Research memory" : "Personal memory"}</p>
              <h2>{title} 등록 / 편집</h2>
            </div>
            <div className="editor-actions">
              <button
                type="button"
                onClick={handleArchive}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-slate-600 hover:bg-slate-50"
                title={draft.archived ? "보관 해제" : "보관"}
                aria-label={draft.archived ? "보관 해제" : "보관"}
              >
                <Archive className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-coral hover:bg-red-50"
                title="삭제"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="submit"
                className="grid h-10 w-10 place-items-center rounded-lg border border-heather-700 bg-heather-700 text-white hover:bg-heather-900"
                title="저장"
                aria-label="저장"
              >
                <Save className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="memory-editor-grid">
            <label className="workspace-field">
              <span>타입</span>
              <select
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value as MemoryType })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              >
                {MEMORY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="workspace-field">
              <span>{isResearch ? "연구 또는 프로젝트명" : "제목"}</span>
              <input
                value={draft.source}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
          </div>

          <label className="workspace-field">
            <span>내용</span>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              className="mt-1 min-h-36 w-full resize-y rounded-lg border border-line px-3 py-2 leading-6"
              placeholder={isResearch ? "연구 기록, 핵심 데이터, 결과와 다음 실험을 적으세요." : "Heather가 장기적으로 참고해야 할 사실, 선호, 규칙을 적으세요."}
            />
          </label>

          <label className="workspace-field">
            <span>태그</span>
            <input
              value={draft.tags.join(", ")}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                })
              }
              className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              placeholder="project, relationship, preference"
            />
          </label>

        </form>
      ) : (
        <div className="memory-editor-empty">
          새 메모리를 추가해 중요한 맥락을 기록하세요.
        </div>
      )}
    </div>
  );
}
