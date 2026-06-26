"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { createId, nowIso, summarizeProject } from "@heather/core";
import type { ProjectPriority, ProjectRecord, ProjectStatus } from "@heather/core";

interface ProjectsPanelProps {
  projects: ProjectRecord[];
  onSaveProject: (project: ProjectRecord) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

const STATUS_OPTIONS: ProjectStatus[] = ["idea", "active", "paused", "blocked", "done"];
const PRIORITY_OPTIONS: ProjectPriority[] = ["low", "medium", "high", "urgent"];

export function ProjectsPanel({ projects, onSaveProject, onDeleteProject }: ProjectsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id || null);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || projects[0] || null,
    [projects, selectedId]
  );
  const [draft, setDraft] = useState<ProjectRecord | null>(selectedProject);

  useEffect(() => {
    if (!selectedId && projects[0]) {
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);

  useEffect(() => {
    setDraft(selectedProject);
  }, [selectedProject]);

  const summary = draft ? summarizeProject(draft) : null;

  async function handleCreateProject() {
    const timestamp = nowIso();
    const project: ProjectRecord = {
      id: createId("project"),
      title: "새 프로젝트",
      description: "",
      status: "idea",
      priority: "medium",
      related_people: [],
      key_links: [],
      notes: [],
      decisions: [],
      next_actions: [],
      created_at: timestamp,
      updated_at: timestamp
    };

    await onSaveProject(project);
    setSelectedId(project.id);
  }

  async function handleSave() {
    if (!draft) return;
    await onSaveProject({
      ...draft,
      updated_at: nowIso()
    });
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm(`${draft.title} 프로젝트를 삭제할까요?`)) return;

    await onDeleteProject(draft.id);
    setSelectedId(null);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-lg border border-line bg-slate-50">
        <div className="flex items-center justify-between border-b border-line p-3">
          <div className="flex items-center gap-2 font-semibold">
            <FolderKanban className="h-4 w-4 text-heather-700" />
            프로젝트
          </div>
          <button
            type="button"
            onClick={handleCreateProject}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-heather-700 hover:bg-heather-50"
            title="프로젝트 추가"
            aria-label="프로젝트 추가"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[680px] space-y-2 overflow-y-auto p-3 heather-scrollbar">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedId(project.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                draft?.id === project.id
                  ? "border-heather-500 bg-white"
                  : "border-line bg-white hover:border-heather-300"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{project.title}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  {project.priority}
                </span>
              </span>
              <span className="mt-1 block truncate text-sm text-slate-500">{project.description}</span>
              <span className="mt-2 block text-xs text-heather-700">{project.status}</span>
            </button>
          ))}
        </div>
      </aside>

      {draft && summary ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <form
            className="space-y-4 rounded-lg border border-line bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-heather-700">Project Memory</p>
                <h3 className="text-2xl font-semibold">{draft.title}</h3>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-coral hover:bg-red-50"
                  title="프로젝트 삭제"
                  aria-label="프로젝트 삭제"
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

            <label className="block">
              <span className="text-sm font-medium">설명</span>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                className="mt-1 min-h-24 w-full resize-y rounded-lg border border-line px-3 py-2"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">상태</span>
                <select
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectStatus })}
                  className="mt-1 h-11 w-full rounded-lg border border-line px-3"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">우선순위</span>
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value as ProjectPriority })}
                  className="mt-1 h-11 w-full rounded-lg border border-line px-3"
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <LineTextarea
              label="관련 인물"
              value={draft.related_people}
              onChange={(related_people) => setDraft({ ...draft, related_people })}
            />
            <LineTextarea
              label="핵심 링크"
              value={draft.key_links}
              onChange={(key_links) => setDraft({ ...draft, key_links })}
            />
            <LineTextarea
              label="노트"
              value={draft.notes}
              onChange={(notes) => setDraft({ ...draft, notes })}
            />
            <LineTextarea
              label="결정사항"
              value={draft.decisions}
              onChange={(decisions) => setDraft({ ...draft, decisions })}
            />
            <LineTextarea
              label="다음 행동"
              value={draft.next_actions}
              onChange={(next_actions) => setDraft({ ...draft, next_actions })}
            />
          </form>

          <aside className="rounded-lg border border-line bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-heather-700" />
              <h4 className="font-semibold">헤더 프로젝트 요약</h4>
            </div>
            <SummaryBlock title="프로젝트 목적" value={summary.projectPurpose} />
            <SummaryBlock title="현재 진행상황" value={summary.currentProgress} />
            <SummaryBlock title="주요 인물" value={summary.keyPeople} />
            <SummaryBlock title="주요 결정사항" value={summary.keyDecisions} />
            <SummaryBlock title="문제점" value={summary.problems} />
            <SummaryBlock title="다음 행동" value={summary.nextActions} />
            <SummaryBlock title="위험요소" value={summary.risks} />
            <SummaryBlock title="헤더의 판단" value={summary.heatherJudgment} />
          </aside>
        </section>
      ) : (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-line text-sm text-slate-500">
          프로젝트를 추가하면 메모리와 요약을 관리할 수 있습니다.
        </div>
      )}
    </div>
  );
}

function LineTextarea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        }
        className="mt-1 min-h-24 w-full resize-y rounded-lg border border-line px-3 py-2"
        placeholder="한 줄에 하나씩 입력"
      />
    </label>
  );
}

function SummaryBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="border-b border-line py-3 last:border-b-0">
      <h5 className="text-sm font-semibold text-heather-700">{title}</h5>
      <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
    </section>
  );
}
