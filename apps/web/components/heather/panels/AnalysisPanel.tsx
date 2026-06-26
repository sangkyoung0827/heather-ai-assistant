"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, Database, Save, Users } from "lucide-react";
import { analyzePersonOrOrganization, createId, nowIso } from "@heather/core";
import type { MemoryRecord, PersonOrgAnalysis } from "@heather/core";

interface AnalysisPanelProps {
  memories: MemoryRecord[];
  onSaveMemory: (memory: MemoryRecord) => Promise<void>;
}

const DEFAULT_ANALYSIS_INPUT =
  "능력 있는 학생에게 좋은 기회를 준다고 말하지만, 실제로는 중요한 결정권 없이 일을 계속 넘기는 상황";

export function AnalysisPanel({ memories, onSaveMemory }: AnalysisPanelProps) {
  const [input, setInput] = useState(DEFAULT_ANALYSIS_INPUT);
  const [saved, setSaved] = useState(false);
  const analysis = useMemo(() => analyzePersonOrOrganization(input), [input]);

  async function handleSaveAnalysis() {
    const timestamp = nowIso();
    await onSaveMemory({
      id: createId("memory"),
      type: "relationship_analysis",
      content: `분석 대상: ${input}\n\n${formatAnalysis(analysis)}`,
      source: "analysis_panel",
      confidence: 0.78,
      tags: ["analysis", "relationship", "boundary"],
      created_at: timestamp,
      updated_at: timestamp,
      archived: false
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="space-y-4 rounded-lg border border-line bg-white p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-heather-700">
            <Users className="h-4 w-4" />
            Person / Organization Analysis
          </div>
          <h3 className="mt-1 text-2xl font-semibold">흐릿한 책임 구조 분석</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            관찰한 행동, 말, 반복 패턴을 적으면 헤더가 권한과 책임의 균형을 기준으로 분해합니다.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium">분석할 사람/조직/상황</span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="mt-1 min-h-52 w-full resize-y rounded-lg border border-line px-3 py-2 leading-6"
            placeholder="예: 교수님이 좋은 기회라고 말하며 계속 업무를 맡기는 상황"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-heather-700" />
              저장된 분석 기억
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {memories.filter((memory) => memory.type === "relationship_analysis" && !memory.archived).length}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveAnalysis}
            className="flex items-center justify-center gap-2 rounded-lg border border-heather-700 bg-heather-700 px-4 py-3 font-semibold text-white hover:bg-heather-900"
          >
            <Save className="h-4 w-4" />
            {saved ? "저장됨" : "기억으로 저장"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-slate-50 p-4">
        <div className="mb-4 flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-heather-700" />
          <h4 className="font-semibold">헤더의 구조화 결과</h4>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <AnalysisBlock title="겉으로 보이는 행동" value={analysis.visibleBehavior} />
          <AnalysisBlock title="실제로 발생하는 구조" value={analysis.actualStructure} />
          <AnalysisBlock title="상대방의 가능한 동기" value={analysis.possibleMotives} />
          <AnalysisBlock title="사용자가 맡게 되는 역할" value={analysis.userRole} />
          <AnalysisBlock
            title="권한과 책임의 균형"
            value={analysis.authorityResponsibilityBalance}
            wide
          />
          <AnalysisBlock title="위험 신호" value={analysis.riskSignals} />
          <AnalysisBlock title="대응 전략" value={analysis.responseStrategy} />
        </div>
      </section>
    </div>
  );
}

function AnalysisBlock({ title, value, wide = false }: { title: string; value: string; wide?: boolean }) {
  return (
    <article className={`rounded-lg border border-line bg-white p-4 ${wide ? "md:col-span-2" : ""}`}>
      <h5 className="text-sm font-semibold text-heather-700">{title}</h5>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </article>
  );
}

function formatAnalysis(analysis: PersonOrgAnalysis): string {
  return [
    `겉으로 보이는 행동: ${analysis.visibleBehavior}`,
    `실제로 발생하는 구조: ${analysis.actualStructure}`,
    `상대방의 가능한 동기: ${analysis.possibleMotives}`,
    `사용자가 맡게 되는 역할: ${analysis.userRole}`,
    `권한과 책임의 균형: ${analysis.authorityResponsibilityBalance}`,
    `위험 신호: ${analysis.riskSignals}`,
    `대응 전략: ${analysis.responseStrategy}`
  ].join("\n");
}
