"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, ExternalLink, Globe2, Pencil, Save, Trash2, X } from "lucide-react";
import type { HeatherLanguage } from "@heather/core";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";
import type { QuickLink, QuickLinkCategory } from "../../../lib/quick-links/server";
import { MemoryArchiveEmbed } from "./MemoryArchiveEmbed";

const CATEGORIES: QuickLinkCategory[] = ["work", "project", "content"];
const KO: Record<QuickLinkCategory, string> = { work: "업무", project: "프로젝트", content: "콘텐츠" };
const EN: Record<QuickLinkCategory, string> = { work: "Work", project: "Projects", content: "Content" };

export function QuickAccessPanel({ locale, auth, children }: { locale: HeatherLanguage; auth: { user: { email?: string | null } | null; ready: boolean; configured: boolean }; children?: React.ReactNode }) {
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<QuickLink | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<QuickLinkCategory>("work");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const labels = locale === "en" ? EN : KO;

  const headers = useCallback(async () => {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    if (!session?.data.session?.access_token) throw new Error(locale === "en" ? "Sign in to manage Quick Access links." : "자주 쓰는 사이트를 관리하려면 로그인하세요.");
    return { Authorization: `Bearer ${session.data.session.access_token}`, "Content-Type": "application/json" };
  }, [locale]);

  const load = useCallback(async () => {
    if (!auth.user) { setLinks([]); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/quick-links", { headers: await headers(), cache: "no-store" });
      const data = await response.json() as { links?: QuickLink[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load Quick Access links.");
      setLinks(data.links || []); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load Quick Access links."); }
    finally { setLoading(false); }
  }, [auth.user, headers]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const grouped = useMemo(() => new Map(CATEGORIES.map((item) => [item, links.filter((link) => link.category === item)])), [links]);

  function beginEdit(link: QuickLink) { setSelected(link); setName(link.name); setUrl(link.url); setCategory((CATEGORIES as readonly string[]).includes(link.category) ? link.category as QuickLinkCategory : "work"); setError(""); }
  function closeEdit() { setSelected(null); setName(""); setUrl(""); setCategory("work"); setError(""); }

  async function saveEdit() {
    if (!selected || !name.trim() || !url.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/quick-links", { method: "PATCH", headers: await headers(), body: JSON.stringify({ id: selected.id, action: "update", name: name.trim(), url: url.trim(), category }) });
      const data = await response.json() as { links?: QuickLink[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update this Quick Access link.");
      setLinks(data.links || []); closeEdit();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this Quick Access link."); }
    finally { setLoading(false); }
  }

  async function move(link: QuickLink, displayOrder: number) {
    setLoading(true);
    try {
      const response = await fetch("/api/quick-links", { method: "PATCH", headers: await headers(), body: JSON.stringify({ id: link.id, action: "move", category: link.category, displayOrder }) });
      const data = await response.json() as { links?: QuickLink[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not move this Quick Access link.");
      setLinks(data.links || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not move this Quick Access link."); }
    finally { setLoading(false); }
  }

  async function remove(link: QuickLink) {
    if (!window.confirm(locale === "en" ? `Delete ${link.name}?` : `${link.name}을(를) 삭제할까요?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/quick-links?id=${encodeURIComponent(link.id)}`, { method: "DELETE", headers: await headers() });
      const data = await response.json() as { links?: QuickLink[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not delete this Quick Access link.");
      setLinks(data.links || []); if (selected?.id === link.id) closeEdit();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete this Quick Access link."); }
    finally { setLoading(false); }
  }

  return <>
    <MemoryArchiveEmbed locale={locale} />
    <section className="dashboard-panel dashboard-quick-access">
      <header><h3>{locale === "en" ? "Frequently used sites" : "자주 쓰는 사이트"}</h3>{auth.user ? <button type="button" onClick={() => { setEditing((value) => !value); closeEdit(); }}>{editing ? (locale === "en" ? "Done" : "완료") : (locale === "en" ? "Edit" : "편집")}</button> : null}</header>
      {auth.ready && !auth.user ? <p className="dashboard-empty">{locale === "en" ? "Sign in to use your personal Quick Access links." : "로그인하면 개인 자주 쓰는 사이트를 사용할 수 있습니다."}</p> : null}
      {auth.user ? <div className="quick-access-groups">{CATEGORIES.map((item) => <section key={item} className="quick-access-group"><h4>{labels[item]}</h4><div>{grouped.get(item)?.length ? grouped.get(item)?.map((link) => <div key={link.id} className="quick-access-link-row"><a href={link.url} target={link.open_mode === "external" ? "_blank" : undefined} rel={link.open_mode === "external" ? "noreferrer" : undefined} title={link.hostname}><Globe2 /><span>{link.name}</span><ExternalLink aria-hidden="true" /></a>{editing ? <aside aria-label={`${link.name} controls`}><button type="button" onClick={() => void move(link, 0)} disabled={loading} title={locale === "en" ? "Move to first" : "맨 앞으로"} aria-label={locale === "en" ? "Move to first" : "맨 앞으로"}><ArrowUpToLine /></button><button type="button" onClick={() => void move(link, 999999)} disabled={loading} title={locale === "en" ? "Move to last" : "맨 뒤로"} aria-label={locale === "en" ? "Move to last" : "맨 뒤로"}><ArrowDownToLine /></button><button type="button" onClick={() => beginEdit(link)} disabled={loading} title={locale === "en" ? "Edit" : "수정"} aria-label={locale === "en" ? "Edit" : "수정"}><Pencil /></button><button type="button" onClick={() => void remove(link)} disabled={loading} title={locale === "en" ? "Delete" : "삭제"} aria-label={locale === "en" ? "Delete" : "삭제"}><Trash2 /></button></aside> : null}</div>) : <p>{locale === "en" ? "No links yet" : "등록된 링크가 없습니다"}</p>}</div></section>)}</div> : null}
      {editing && selected ? <form className="quick-access-editor" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}><label>{locale === "en" ? "Name" : "이름"}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></label><label>URL<input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" /></label><label>{locale === "en" ? "Category" : "영역"}<select value={category} onChange={(event) => setCategory(event.target.value as QuickLinkCategory)}>{CATEGORIES.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label><footer><button type="button" onClick={closeEdit}><X />{locale === "en" ? "Cancel" : "취소"}</button><button type="submit" disabled={loading || !name.trim() || !url.trim()}><Save />{locale === "en" ? "Save" : "저장"}</button></footer></form> : null}
      {error ? <p className="quick-access-error" role="alert">{error}</p> : null}
      {children}
    </section>
  </>;
}
