import {
  buildTeachingContext,
  buildHeatherSystemPrompt,
  classifyActionRisk,
  describeAutomationRecipe,
  generateConversationTitle
} from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import {
  DEFAULT_OLLAMA_MODEL,
  FALLBACK_OLLAMA_MODEL,
  resolveOllamaFallbackModel
} from "../ollama-config";
import { formatOllamaChatError, OLLAMA_NOT_RUNNING_MESSAGE } from "../ollama-errors";
import type {
  AIProvider,
  AIProviderConfig,
  ChatMessage,
  ChatOptions,
  ProviderChatResponse
} from "../types";

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  model?: string;
  done?: boolean;
  error?: string;
}

interface OllamaGenerateResponse {
  response?: string;
  model?: string;
  error?: string;
}

function compactContext(payload: ChatRequestPayload): string {
  const memories = payload.memories
    .filter((memory) => !memory.archived)
    .slice(0, 6)
    .map((memory) => {
      const isDocumentExcerpt = memory.tags.includes("document");
      const excerpt = memory.content.slice(0, isDocumentExcerpt ? 1_500 : 240);
      return `- ${memory.type}${isDocumentExcerpt ? " (uploaded document excerpt)" : ""} [${memory.source}]: ${excerpt}`;
    })
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
    "업로드 문서 발췌가 제공된 경우에만 그 원문을 근거로 답한다. 발췌에 없는 내용은 파일에서 읽었다고 추측하지 않는다.",
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

function buildChatMessages(payload: ChatRequestPayload): ChatMessage[] {
  const history = payload.conversation?.messages
    .filter((message) => message.role !== "system")
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1200)
    }));

  return [
    { role: "system", content: buildHeatherSystemPrompt(payload.settings) },
    { role: "system", content: compactContext(payload) },
    ...(history || []),
    { role: "user", content: payload.message }
  ];
}

export function createOllamaProvider(config: AIProviderConfig): AIProvider {
  const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
  const defaultModel = config.model || DEFAULT_OLLAMA_MODEL;
  const fallbackModel = config.fallbackModel || resolveOllamaFallbackModel() || FALLBACK_OLLAMA_MODEL;

  async function chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<ProviderChatResponse> {
    const model = options.model || defaultModel;
    let response: Response;

    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
          options: {
            temperature: options.temperature ?? 0.6,
            num_predict: options.maxTokens || 700
          }
        })
      });
    } catch (error) {
      throw formatOllamaChatError(error, model);
    }

    const data = (await response.json()) as OllamaChatResponse;

    if (!response.ok) {
      throw formatOllamaChatError(new Error(data.error || OLLAMA_NOT_RUNNING_MESSAGE), model);
    }

    const content = data.message?.content?.trim();
    if (!content) {
      throw formatOllamaChatError(new Error(OLLAMA_NOT_RUNNING_MESSAGE), model);
    }

    return {
      content,
      model: data.model || model,
      raw: data
    };
  }

  async function chatWithModelFallback(
    messages: ChatMessage[],
    primaryModel: string,
    options: ChatOptions = {}
  ): Promise<ProviderChatResponse> {
    try {
      return await chat(messages, { ...options, model: primaryModel });
    } catch (primaryError) {
      if (fallbackModel && fallbackModel !== primaryModel) {
        try {
          return await chat(messages, { ...options, model: fallbackModel });
        } catch {
          throw formatOllamaChatError(primaryError, primaryModel);
        }
      }

      throw formatOllamaChatError(primaryError, primaryModel);
    }
  }

  return {
    id: "ollama",
    chat,
    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/api/tags`);
        return response.ok;
      } catch {
        return false;
      }
    },
    async generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
      const primaryModel = payload.settings.ollamaModel || defaultModel;
      const messages = buildChatMessages(payload);
      const response = await chatWithModelFallback(messages, primaryModel, {
        temperature: 0.6,
        maxTokens: 700
      });

      return {
        message: response.content,
        title: generateConversationTitle(payload.message),
        risk: classifyActionRisk(payload.message),
        model: response.model
      };
    },
    async *streamChat(messages: ChatMessage[], options: ChatOptions = {}) {
      const model = options.model || defaultModel;
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages,
          options: {
            temperature: options.temperature ?? 0.6,
            num_predict: options.maxTokens || 700
          }
        })
      });

      if (!response.ok || !response.body) {
        throw formatOllamaChatError(new Error(OLLAMA_NOT_RUNNING_MESSAGE), model);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as OllamaChatResponse;
          yield {
            content: parsed.message?.content || "",
            done: parsed.done
          };
        }
      }
    },
    async generate(messages: ChatMessage[], options: ChatOptions = {}) {
      const model = options.model || defaultModel;
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.6,
            num_predict: options.maxTokens || 700
          }
        })
      });

      const data = (await response.json()) as OllamaGenerateResponse;
      if (!response.ok) {
        throw formatOllamaChatError(new Error(data.error || OLLAMA_NOT_RUNNING_MESSAGE), model);
      }

      return {
        content: data.response?.trim() || "",
        model: data.model || model,
        raw: data
      };
    }
  };
}
