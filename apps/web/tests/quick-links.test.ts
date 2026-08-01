import assert from "node:assert/strict";
import test from "node:test";
import { checkQuickLinkDuplicates, normalizeQuickLinkUrl, parseQuickLinkIntent, type QuickLink } from "../lib/quick-links/server";

const existing: QuickLink = {
  id: "quick-link-1", project_id: null, name: "YouTube Music", normalized_name: "youtube music", url: "https://music.youtube.com/", canonical_url: "https://music.youtube.com/", hostname: "music.youtube.com", provider: "YouTube Music", icon_key: "youtube-music", favicon_url: null, category: "content", display_order: 0, pinned: true, open_mode: "external", status_mode: "active", created_by: "chat_command", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z"
};

test("parses the representative Korean quick-link create command", () => {
  const intent = parseQuickLinkIntent("헤더, 유튜브 뮤직을 자주 사용하는 사이트 콘텐츠 부분에 등록해. https://music.youtube.com/");
  assert.equal(intent?.action, "create");
  assert.equal(intent?.name, "유튜브 뮤직");
  assert.equal(intent?.category, "content");
  assert.equal(intent?.url, "https://music.youtube.com/");
});

test("keeps a create request without a URL as a quick-link command", () => {
  const intent = parseQuickLinkIntent("유튜브 뮤직을 콘텐츠에 등록해.");
  assert.equal(intent?.action, "create");
  assert.equal(intent?.url, undefined);
  assert.equal(intent?.category, "content");
});

test("canonicalizes public URLs and removes tracking parameters", () => {
  const normalized = normalizeQuickLinkUrl("https://music.youtube.com/?utm_source=heather&gclid=test");
  assert.equal(normalized.canonicalUrl, "https://music.youtube.com/");
});

test("rejects local and private quick-link URLs", () => {
  assert.throws(() => normalizeQuickLinkUrl("http://localhost:3000"));
  assert.throws(() => normalizeQuickLinkUrl("http://192.168.0.10"));
  assert.throws(() => normalizeQuickLinkUrl("file:///private/data"));
});

test("classifies duplicate URL and name cases without creating a row", () => {
  assert.equal(checkQuickLinkDuplicates([existing], { name: "YouTube Music", canonicalUrl: "https://music.youtube.com/", category: "content" })?.kind, "same_url_same_name");
  assert.equal(checkQuickLinkDuplicates([existing], { name: "Music", canonicalUrl: "https://music.youtube.com/", category: "content" })?.kind, "same_url_different_name");
  assert.equal(checkQuickLinkDuplicates([existing], { name: "YouTube Music", canonicalUrl: "https://example.com/", category: "content" })?.kind, "same_name_different_url");
});
