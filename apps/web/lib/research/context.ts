import type { ChatRequestPayload, MemoryRecord } from "@heather/core";
import { buildLlmMessages } from "../llm/messages";
import { HEATHER_RESEARCH_SYSTEM_PROMPT } from "../llm/system-prompt";
import type { LlmMessage } from "../llm/types";

export type ResearchEvidence = {
  type: "research_memory";
  title: string;
};

export type ResearchContext = {
  researchMemories: Array<Pick<MemoryRecord, "id" | "source" | "content" | "tags">>;
  retrievedDocuments: [];
  processSnapshots: [];
  experimentRecords: [];
};

export function buildResearchContext(payload: ChatRequestPayload): {
  context: ResearchContext;
  evidence: ResearchEvidence[];
  messages: LlmMessage[];
} {
  const researchMemories = findRelevantResearchMemories(payload.message, payload.memories);
  const evidence = researchMemories.map((memory) => ({
    type: "research_memory" as const,
    title: memory.source || "Untitled research memory"
  }));
  const context: ResearchContext = {
    researchMemories,
    retrievedDocuments: [],
    processSnapshots: [],
    experimentRecords: []
  };
  const memoryContext = researchMemories.length
    ? `\n\n[RESEARCH_MEMORY]\n${researchMemories.map((memory) => `title: ${memory.source || "Untitled"}\ntags: ${memory.tags.join(", ") || "none"}\ncontent: ${memory.content}`).join("\n\n")}`
    : "\n\n[RESEARCH_MEMORY]\nNo matching research memory was supplied. Do not invent any.";

  return {
    context,
    evidence,
    messages: buildLlmMessages(payload, `${HEATHER_RESEARCH_SYSTEM_PROMPT}${memoryContext}`)
  };
}

function findRelevantResearchMemories(message: string, memories: MemoryRecord[]) {
  const terms = message.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2);
  return memories
    .filter((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research")))
    .map((memory) => {
      const haystack = `${memory.source} ${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { memory, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ memory }) => ({
      id: memory.id,
      source: memory.source.slice(0, 160),
      content: memory.content.slice(0, 1600),
      tags: memory.tags.slice(0, 12)
    }));
}
