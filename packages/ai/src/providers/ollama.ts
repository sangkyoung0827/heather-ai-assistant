import {
  buildTeachingContext,
  buildHeatherSystemPrompt,
  classifyActionRisk,
  describeAutomationRecipe,
  generateConversationTitle
} from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import type { AIProvider, AIProviderConfig } from "../types";

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

function compactContext(payload: ChatRequestPayload): string {
  const memories = payload.memories
    .filter((memory) => !memory.archived)
    .slice(0, 6)
    .map((memory) => `- ${memory.type}: ${memory.content.slice(0, 240)}`)
    .join("\n");

  const projects = payload.projects
    .slice(0, 6)
    .map((project) => `- ${project.title}: ${project.status}/${project.priority}`)
    .join("\n");

  const automationRecipes = (payload.automationRecipes || [])
    .filter((recipe) => recipe.enabled)
    .slice(0, 4)
    .map((recipe) => describeAutomationRecipe(recipe).slice(0, 420))
    .join("\n\n");

  return [
    "로컬 장기 기억:",
    memories || "- 없음",
    "",
    "프로젝트:",
    projects || "- 없음",
    "",
    "자동화 루틴:",
    automationRecipes || "- 없음",
    "",
    buildTeachingContext(payload.teachings)
  ].join("\n");
}

export function createOllamaProvider(config: AIProviderConfig): AIProvider {
  const baseUrl = config.baseUrl || "http://127.0.0.1:11434";
  const model = config.model || "llama3.1";

  return {
    id: "ollama",
    async generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
      const history = payload.conversation?.messages
        .filter((message) => message.role !== "system")
        .slice(-6)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 1200)
        }));

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: "system", content: buildHeatherSystemPrompt(payload.settings) },
            { role: "system", content: compactContext(payload) },
            ...(history || []),
            { role: "user", content: payload.message }
          ],
          options: {
            temperature: 0.6,
            num_predict: 700
          }
        })
      });

      const data = (await response.json()) as OllamaChatResponse;

      if (!response.ok) {
        throw new Error(data.error || `Ollama request failed: ${response.status}`);
      }

      const message = data.message?.content?.trim();
      if (!message) {
        throw new Error("Ollama returned an empty message.");
      }

      return {
        message,
        title: generateConversationTitle(payload.message),
        risk: classifyActionRisk(payload.message)
      };
    }
  };
}
