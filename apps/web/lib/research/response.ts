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

  const uniqueSources = sources.reduce<Required<ResearchSourceReference>[]>((items, source) => {
    const title = source.title?.trim();
    const url = source.url?.trim();
    if (!title || !url || items.some((item) => item.url === url)) return items;
    items.push({ title, url });
    return items;
  }, []);

  if (!uniqueSources.length) return cleaned;
  const sourceList = uniqueSources.slice(0, 5).map((source) => `• ${source.title}\n${source.url}`).join("\n");
  return `${cleaned}${cleaned ? "\n\n" : ""}출처\n${sourceList}`;
}

export function cleanResearchDisplayText(content: string) {
  return content
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(markdownTokens, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();
}
