import {
  buildTeachingContext,
  buildHeatherSystemPrompt,
  classifyActionRisk,
  describeAutomationRecipe,
  generateConversationTitle
} from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
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
  const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
  const defaultModel = config.model || "gemma4:latest";

  function mapOllamaError(message: string, status?: number): string {
    const normalized = message.toLowerCase();
    if (
      status === 404 ||
      normalized.includes("not found") ||
      normalized.includes("model") && normalized.includes("pull")
    ) {
      return `설정된 Ollama 모델이 설치되어 있지 않습니다. \`ollama pull ${defaultModel}\` 또는 원하는 모델 설치 명령을 실행하세요.`;
    }

    return "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행하세요.";
  }

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
          think: false,
          messages,
          options: {
            temperature: options.temperature ?? 0.6,
            num_predict: options.maxTokens || 320
          }
        })
      });
    } catch (error) {
      throw new Error(mapOllamaError(error instanceof Error ? error.message : ""));
    }

    const data = (await response.json()) as OllamaChatResponse;

    if (!response.ok) {
      throw new Error(mapOllamaError(data.error || "", response.status));
    }

    const content = data.message?.content?.trim();
    if (!content) {
      throw new Error(mapOllamaError("Ollama returned an empty message."));
    }

    return {
      content,
      model: data.model || model,
      raw: data
    };
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
      const history = payload.conversation?.messages
        .filter((message) => message.role !== "system")
        .filter((message, index, messages) => {
          const isLastMessage = index === messages.length - 1;
          return !(isLastMessage && message.role === "user" && message.content.trim() === payload.message.trim());
        })
        .slice(-4)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 700)
        }));

      const response = await chat(
        [
          {
            role: "system",
            content: [
              buildHeatherSystemPrompt(payload.settings),
              "현재 Heather는 Ollama provider를 통해 로컬 모델로 답변 중이다.",
              "응답은 사용자의 질문에 직접 답하고, 불필요한 내부 사고 과정을 쓰지 않는다."
            ].join("\n")
          },
          { role: "system", content: compactContext(payload).slice(0, 1800) },
          ...(history || []),
          { role: "user", content: payload.message }
        ],
        {
          model: payload.settings.ollamaModel || defaultModel,
          temperature: 0.6,
          maxTokens: 320
        }
      );

      return {
        message: response.content,
        title: generateConversationTitle(payload.message),
        risk: classifyActionRisk(payload.message)
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
          think: false,
          messages,
          options: {
            temperature: options.temperature ?? 0.6,
            num_predict: options.maxTokens || 320
          }
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(mapOllamaError("", response.status));
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
            num_predict: options.maxTokens || 320
          }
        })
      });

      const data = (await response.json()) as OllamaGenerateResponse;
      if (!response.ok) {
        throw new Error(mapOllamaError(data.error || "", response.status));
      }

      return {
        content: data.response?.trim() || "",
        model: data.model || model,
        raw: data
      };
    }
  };
}
