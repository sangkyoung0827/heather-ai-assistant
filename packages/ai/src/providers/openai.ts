import {
  buildTeachingContext,
  buildHeatherSystemPrompt,
  classifyActionRisk,
  describeAutomationRecipe,
  generateConversationTitle
} from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import type { AIProvider, AIProviderConfig } from "../types";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function buildContext(payload: ChatRequestPayload): string {
  const memoryContext = payload.memories
    .filter((memory) => !memory.archived)
    .slice(0, 6)
    .map((memory) => `- [${memory.type}/${memory.confidence}] ${memory.content.slice(0, 240)}`)
    .join("\n");

  const projectContext = payload.projects
    .slice(0, 6)
    .map(
      (project) =>
        `- ${project.title}: ${project.status}/${project.priority}. 다음 행동: ${
          project.next_actions.join(", ").slice(0, 240) || "미정"
        }`
    )
    .join("\n");

  const automationContext = (payload.automationRecipes || [])
    .filter((recipe) => recipe.enabled)
    .slice(0, 4)
    .map((recipe) => describeAutomationRecipe(recipe).slice(0, 520))
    .join("\n\n");

  return [
    "저장된 기억:",
    memoryContext || "- 아직 연결된 기억이 없습니다.",
    "",
    "프로젝트:",
    projectContext || "- 아직 프로젝트가 없습니다.",
    "",
    "자동화 루틴:",
    automationContext || "- 아직 저장된 자동화 루틴이 없습니다.",
    "",
    buildTeachingContext(payload.teachings)
  ].join("\n");
}

export function createOpenAIProvider(config: AIProviderConfig): AIProvider {
  return {
    id: "openai",
    async generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
      if (!config.apiKey) {
        throw new Error("OPENAI_API_KEY is missing.");
      }

      const history = payload.conversation?.messages
        .filter((message) => message.role !== "system")
        .slice(-6)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 1200)
        }));

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model || "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: 700,
          messages: [
            { role: "system", content: buildHeatherSystemPrompt(payload.settings) },
            { role: "system", content: buildContext(payload) },
            ...(history || []),
            { role: "user", content: payload.message }
          ]
        })
      });

      const data = (await response.json()) as ChatCompletionResponse;

      if (!response.ok) {
        throw new Error(data.error?.message || `OpenAI request failed: ${response.status}`);
      }

      const message = data.choices?.[0]?.message?.content?.trim();
      if (!message) {
        throw new Error("OpenAI returned an empty message.");
      }

      return {
        message,
        title: generateConversationTitle(payload.message),
        risk: classifyActionRisk(payload.message)
      };
    }
  };
}
