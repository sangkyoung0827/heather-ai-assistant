"use client";

import { useRef, type KeyboardEvent } from "react";
import type { HeatherLanguage } from "@heather/core";
import type { PersonalMemoryScope, PersonalMemoryScopeCounts } from "../../../lib/personal-memory-scope/server";

const SCOPES: PersonalMemoryScope[] = ["all", "journal", "direct", "project"];

const KO: Record<PersonalMemoryScope, string> = { all: "전체", journal: "일기", direct: "직접 메모", project: "프로젝트 기록" };
const EN: Record<PersonalMemoryScope, string> = { all: "All", journal: "Journal", direct: "Direct notes", project: "Project records" };

export function PersonalMemoryScopeBar({ scope, counts, locale, onChange }: { scope: PersonalMemoryScope; counts: PersonalMemoryScopeCounts | null; locale: HeatherLanguage; onChange: (scope: PersonalMemoryScope) => void }) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const labels = locale === "en" ? EN : KO;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextIndex = (index + (event.key === "ArrowRight" ? 1 : SCOPES.length - 1)) % SCOPES.length;
    const nextScope = SCOPES[nextIndex];
    onChange(nextScope);
    tabRefs.current[nextIndex]?.focus();
  }

  return <div className="personal-memory-scope-bar" role="tablist" aria-label={locale === "en" ? "Personal memory search scope" : "개인 메모리 검색 범위"}>
    {SCOPES.map((item, index) => <button key={item} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" aria-selected={scope === item} className={scope === item ? "is-active" : ""} onClick={() => onChange(item)} onKeyDown={(event) => onKeyDown(event, index)}>{labels[item]}{counts ? <span>{counts[item].toLocaleString()}</span> : null}</button>)}
  </div>;
}
