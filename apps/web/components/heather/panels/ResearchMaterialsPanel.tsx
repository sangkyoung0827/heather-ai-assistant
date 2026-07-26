"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, FileText, FlaskConical, Image as ImageIcon, Search, Upload, X } from "lucide-react";
import type { HeatherLanguage } from "@heather/core";

type Material = { id: string; name: string; type: string; size: number; addedAt: string };
const STORAGE_KEY = "heather.ai.research-materials.v1";

export function ResearchMaterialsPanel({ locale }: { locale: HeatherLanguage }) {
  const copy = locale === "en" ? EN : KO;
  const [materials, setMaterials] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { try { setMaterials(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as Material[]); } catch { setMaterials([]); } }, []);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(materials)); }, [materials]);
  const filtered = useMemo(() => materials.filter((material) => material.name.toLowerCase().includes(query.trim().toLowerCase())), [materials, query]);
  const addFiles = (files: FileList | File[]) => setMaterials((current) => [...Array.from(files).map((file) => ({ id: `${Date.now()}-${file.name}-${Math.random()}`, name: file.name, type: file.type || extension(file.name), size: file.size, addedAt: new Date().toISOString() })), ...current]);
  return <section className="research-materials-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
    <header className="research-materials-header"><div><span><FlaskConical />{copy.library}</span><h2>{copy.title}</h2><p>{copy.count(materials.length)}</p></div><button type="button" onClick={() => inputRef.current?.click()}><Upload />{copy.upload}</button><input ref={inputRef} className="sr-only" type="file" multiple accept=".pdf,.doc,.docx,.csv,.xlsx,.xls,.txt,.md,image/*" onChange={(event) => { addFiles(event.target.files || []); event.currentTarget.value = ""; }} /></header>
    <label className="research-material-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} /></label>
    {filtered.length ? <div className="research-material-list">{filtered.map((material) => <article key={material.id}><MaterialIcon type={material.type} /><div><strong>{material.name}</strong><span>{material.type || copy.file} · {formatSize(material.size)} · {formatDate(material.addedAt, locale)}</span></div><button type="button" onClick={() => setMaterials((current) => current.filter((entry) => entry.id !== material.id))} aria-label={copy.remove}><X /></button></article>)}</div> : <div className="research-material-empty"><FlaskConical /><h3>{query ? copy.noResults : copy.emptyTitle}</h3><p>{query ? "" : copy.emptyDescription}</p>{!query ? <button type="button" onClick={() => inputRef.current?.click()}><Upload />{copy.upload}</button> : null}</div>}
  </section>;
}

function MaterialIcon({ type }: { type: string }) { return /image/i.test(type) ? <ImageIcon /> : /csv|sheet|excel|xlsx|xls/i.test(type) ? <FileSpreadsheet /> : <FileText />; }
function extension(name: string) { return name.includes(".") ? name.split(".").pop()?.toUpperCase() || "FILE" : "FILE"; }
function formatSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value: string, locale: HeatherLanguage) { return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)); }
const KO = { library: "Digital lab library", title: "연구자료", count: (count: number) => `${count}개 자료`, upload: "업로드", search: "연구자료 검색", file: "파일", remove: "자료 목록에서 제거", noResults: "검색 결과가 없습니다.", emptyTitle: "아직 등록된 연구자료가 없습니다.", emptyDescription: "논문, 실험 기록 또는 데이터 파일을 업로드하세요." };
const EN = { library: "Digital lab library", title: "Research materials", count: (count: number) => `${count} material${count === 1 ? "" : "s"}`, upload: "Upload", search: "Search research materials", file: "File", remove: "Remove from material list", noResults: "No materials found.", emptyTitle: "No research materials yet.", emptyDescription: "Upload papers, experiment records, or data files." };
