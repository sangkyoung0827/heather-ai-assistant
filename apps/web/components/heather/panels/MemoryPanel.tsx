"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Database, Plus, Save, Trash2 } from "lucide-react";
import { createId, nowIso } from "@heather/core";
import type { MemoryRecord, MemoryType } from "@heather/core";

interface MemoryPanelProps {
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

export function MemoryPanel({ memories, onSaveMemory, onDeleteMemory }: MemoryPanelProps) {
  const [showArchived, setShowArchived] = useState(false);
  const visibleMemories = useMemo(
    () => memories.filter((memory) => showArchived || !memory.archived),
    [memories, showArchived]
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
      type: "important_fact",
      content: "",
      source: "manual",
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
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border border-line bg-slate-50">
        <div className="flex items-center justify-between border-b border-line p-3">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="h-4 w-4 text-heather-700" />
            장기 기억
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
        <div className="max-h-[680px] space-y-2 overflow-y-auto p-3 heather-scrollbar">
          {visibleMemories.length ? (
            visibleMemories.map((memory) => (
              <button
                key={memory.id}
                type="button"
                onClick={() => setSelectedId(memory.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  draft?.id === memory.id
                    ? "border-heather-500 bg-white"
                    : "border-line bg-white hover:border-heather-300"
                } ${memory.archived ? "opacity-60" : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{memory.type}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">
                    {Math.round(memory.confidence * 100)}%
                  </span>
                </span>
                <span className="mt-2 line-clamp-3 text-sm leading-5 text-slate-600">{memory.content}</span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">표시할 기억이 없습니다.</p>
          )}
        </div>
      </aside>

      {draft ? (
        <form
          className="space-y-4 rounded-lg border border-line bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-heather-700">Personal Memory</p>
              <h3 className="text-2xl font-semibold">헤더가 기억할 내용</h3>
            </div>
            <div className="flex gap-2">
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

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">타입</span>
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

            <label className="block">
              <span className="text-sm font-medium">출처</span>
              <input
                value={draft.source}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">내용</span>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              className="mt-1 min-h-36 w-full resize-y rounded-lg border border-line px-3 py-2 leading-6"
              placeholder="헤더가 장기적으로 참고해야 할 사실, 선호, 규칙을 적으세요."
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">신뢰도 {Math.round(draft.confidence * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={draft.confidence}
              onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })}
              className="mt-2 w-full accent-heather-700"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">태그</span>
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

          <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm text-slate-600">
            메모리 저장이 꺼져 있으면 채팅에서 새 기억을 자동 제안하지 않습니다. 이 화면의 수동 저장은
            사용자가 명시적으로 누른 경우에만 반영됩니다.
          </div>
        </form>
      ) : (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-line text-sm text-slate-500">
          기억을 추가하면 헤더가 장기 맥락으로 사용할 수 있습니다.
        </div>
      )}
    </div>
  );
}
