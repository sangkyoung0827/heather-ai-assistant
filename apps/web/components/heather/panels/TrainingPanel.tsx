"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Database, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import {
  GENERATIVE_TOOLS,
  createGenerativeDraft,
  createId,
  nowIso,
  selectGenerativeTool
} from "@heather/core";
import type {
  MemoryRecord,
  ProjectRecord,
  TeachingRecord,
  TeachingType
} from "@heather/core";

interface TrainingPanelProps {
  teachings: TeachingRecord[];
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  onSaveTeaching: (teaching: TeachingRecord) => Promise<void>;
  onDeleteTeaching: (id: string) => Promise<void>;
}

const TEACHING_TYPES: TeachingType[] = [
  "directive",
  "preference",
  "example",
  "correction",
  "skill",
  "boundary_rule"
];

export function TrainingPanel({
  teachings,
  memories,
  projects,
  onSaveTeaching,
  onDeleteTeaching
}: TrainingPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(teachings[0]?.id || null);
  const selectedTeaching = useMemo(
    () => teachings.find((teaching) => teaching.id === selectedId) || teachings[0] || null,
    [teachings, selectedId]
  );
  const [draft, setDraft] = useState<TeachingRecord | null>(selectedTeaching);
  const [prompt, setPrompt] = useState("헤더, 창업 지원사업 제안서 초안을 분석적으로 만들어줘");

  useEffect(() => {
    if (!selectedId && teachings[0]) {
      setSelectedId(teachings[0].id);
    }
  }, [selectedId, teachings]);

  useEffect(() => {
    setDraft(selectedTeaching);
  }, [selectedTeaching]);

  const selectedTool = useMemo(() => selectGenerativeTool(prompt), [prompt]);
  const generatedDraft = useMemo(
    () =>
      createGenerativeDraft({
        input: prompt,
        tool: selectedTool,
        teachings,
        memories,
        projects
      }),
    [memories, projects, prompt, selectedTool, teachings]
  );

  async function handleCreateTeaching() {
    const timestamp = nowIso();
    const teaching: TeachingRecord = {
      id: createId("teaching"),
      type: "directive",
      title: "새 교육 기록",
      content: "",
      source: "manual",
      confidence: 0.75,
      tags: ["heather"],
      active: true,
      created_at: timestamp,
      updated_at: timestamp
    };

    await onSaveTeaching(teaching);
    setSelectedId(teaching.id);
  }

  async function handleSave() {
    if (!draft) return;
    await onSaveTeaching({
      ...draft,
      updated_at: nowIso()
    });
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm("이 교육 기록을 삭제할까요?")) return;
    await onDeleteTeaching(draft.id);
    setSelectedId(null);
  }

  async function saveGeneratedAsExample() {
    const timestamp = nowIso();
    await onSaveTeaching({
      id: createId("teaching"),
      type: "example",
      title: `${selectedTool.name} 예시`,
      content: generatedDraft,
      source: "generative_lab",
      confidence: 0.72,
      tags: ["generated-example", selectedTool.id],
      active: true,
      created_at: timestamp,
      updated_at: timestamp
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border border-line bg-slate-50">
        <div className="flex items-center justify-between border-b border-line p-3">
          <div className="flex items-center gap-2 font-semibold">
            <BrainCircuit className="h-4 w-4 text-heather-700" />
            교육 기록
          </div>
          <button
            type="button"
            onClick={handleCreateTeaching}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-heather-700 hover:bg-heather-50"
            title="교육 기록 추가"
            aria-label="교육 기록 추가"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[680px] space-y-2 overflow-y-auto p-3 heather-scrollbar">
          {teachings.map((teaching) => (
            <button
              key={teaching.id}
              type="button"
              onClick={() => setSelectedId(teaching.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                draft?.id === teaching.id
                  ? "border-heather-500 bg-white"
                  : "border-line bg-white hover:border-heather-300"
              } ${teaching.active ? "" : "opacity-60"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{teaching.title}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">{teaching.type}</span>
              </span>
              <span className="mt-2 line-clamp-3 text-sm leading-5 text-slate-600">
                {teaching.content || "내용 없음"}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
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
                <p className="text-sm font-semibold text-heather-700">Teach Heather</p>
                <h3 className="text-2xl font-semibold">헤더 교육하기</h3>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, active: !draft.active })}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    draft.active
                      ? "border-heather-500 bg-heather-50 text-heather-700"
                      : "border-line bg-white text-slate-600"
                  }`}
                >
                  {draft.active ? "active" : "paused"}
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

            <label className="block">
              <span className="text-sm font-medium">제목</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>

            <div className="grid gap-3">
              <label className="block">
                <span className="text-sm font-medium">타입</span>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value as TeachingType })}
                  className="mt-1 h-11 w-full rounded-lg border border-line px-3"
                >
                  {TEACHING_TYPES.map((type) => (
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
              <span className="text-sm font-medium">교육 내용</span>
              <textarea
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                className="mt-1 min-h-44 w-full resize-y rounded-lg border border-line px-3 py-2 leading-6"
                placeholder="예: 헤더는 창업 문서를 쓸 때 지원기관의 평가 기준을 먼저 분리해야 한다."
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
                placeholder="writing, startup, relationship"
              />
            </label>
          </form>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-line text-sm text-slate-500">
            교육 기록을 추가하면 헤더의 생성 방식이 바뀝니다.
          </div>
        )}

        <aside className="space-y-4 rounded-lg border border-line bg-slate-50 p-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-heather-700" />
              <h4 className="font-semibold">생성형 AI 실험실</h4>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-24 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
            />
          </div>

          <div className="rounded-lg border border-line bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{selectedTool.name}</span>
              <span className="rounded-md bg-heather-50 px-2 py-1 text-xs font-semibold text-heather-700">
                {selectedTool.id}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{selectedTool.description}</p>
          </div>

          <div className="rounded-lg border border-line bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-heather-700" />
              등록된 생성 도구
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {GENERATIVE_TOOLS.map((tool) => (
                <div key={tool.id} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  <strong className="block text-ink">{tool.name}</strong>
                  {tool.outputContract.join(" / ")}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-3">
            <h5 className="text-sm font-semibold text-heather-700">미리보기</h5>
            <pre className="mt-2 max-h-[360px] whitespace-pre-wrap overflow-y-auto text-sm leading-6 text-slate-700 heather-scrollbar">
              {generatedDraft}
            </pre>
          </div>

          <button
            type="button"
            onClick={() => void saveGeneratedAsExample()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-heather-700 bg-heather-700 px-4 py-3 font-semibold text-white hover:bg-heather-900"
          >
            <Save className="h-4 w-4" />
            이 결과를 예시로 저장
          </button>
        </aside>
      </section>
    </div>
  );
}
