export type ResearchSourceReference = {
  title?: string;
  url?: string;
};

const markdownTokens = /\*\*|__|`{1,3}/g;

/** Formats provider output into the plain, citation-aware style used in Researcher. */
export function formatResearchResponse(content: string, sources: ResearchSourceReference[] = []) {
  const cleaned = content
    .replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(markdownTokens, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*(\d+)\.\s+/gm, "$1. ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const uniqueSources = verifiedResearchSources(sources);

  if (!uniqueSources.length) return cleaned;
  const sourceList = uniqueSources.slice(0, 5).map((source) => `• ${source.title}\n${source.url}`).join("\n");
  return `${cleaned}${cleaned ? "\n\n" : ""}출처\n${sourceList}`;
}

/** A source is usable only when the discovery provider returned both its title and URL. */
export function verifiedResearchSources<T extends ResearchSourceReference>(sources: T[] = []): T[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const title = source.title?.trim();
    const url = source.url?.trim();
    if (!title || !url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function externalDiscoveryUnavailableMessage(locale: "ko" | "en", academic: boolean) {
  if (locale === "en") {
    return academic
      ? "Heather could not verify any live academic sources for this request. It will not generate paper titles, authors, or DOIs without sources. Please try again shortly."
      : "Heather could not verify any live external sources for this request. It will not generate source claims without verified results. Please try again shortly.";
  }
  return academic
    ? "이번 요청에 대해 실제 학술 출처를 확인하지 못했습니다. 출처 없는 논문 제목, 저자, DOI는 생성하지 않습니다. 잠시 후 다시 시도해 주세요."
    : "이번 요청에 대해 실제 외부 출처를 확인하지 못했습니다. 검증된 결과 없이 출처를 만들어 내지 않습니다. 잠시 후 다시 시도해 주세요.";
}

export function cleanResearchDisplayText(content: string) {
  return content
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(markdownTokens, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();
}
