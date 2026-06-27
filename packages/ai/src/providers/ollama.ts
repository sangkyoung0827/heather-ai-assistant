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

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

const DEFAULT_MODEL = "gemma4:latest";

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
  const defaultModel = config.model || DEFAULT_MODEL;

  function mapOllamaError(message: string, status?: number): string {
    const normalized = message.toLowerCase();
    if (
      status === 404 ||
      normalized.includes("not found") ||
      normalized.includes("model") && normalized.includes("pull")
    ) {
      return `Ollama 모델을 찾지 못했어요. 먼저 \`ollama pull ${DEFAULT_MODEL.replace(":latest", "")}\` 실행 후 다시 시도하세요.`;
    }

    return "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행한 뒤 다시 시도하세요.";
  }

  async function listModels(): Promise<string[]> {
    let response: Response;

    try {
      response = await fetch(`${baseUrl}/api/tags`);
    } catch (error) {
      throw new Error(mapOllamaError(error instanceof Error ? error.message : ""));
    }

    if (!response.ok) {
      throw new Error(mapOllamaError("", response.status));
    }

    const data = (await response.json()) as OllamaTagsResponse;
    return (data.models || [])
      .map((model) => model.name || model.model || "")
      .filter(Boolean);
  }

  async function resolveModel(requestedModel: string): Promise<string> {
    const models = await listModels();
    if (!models.length) {
      throw new Error(
        `Ollama에 설치된 모델이 없습니다. 먼저 \`ollama pull ${DEFAULT_MODEL.replace(":latest", "")}\` 실행 후 다시 시도하세요.`
      );
    }

    const exact = models.find((model) => model === requestedModel);
    if (exact) return exact;

    const requestedBase = requestedModel.replace(/:latest$/, "");
    const baseMatch = models.find((model) => model.replace(/:latest$/, "") === requestedBase);
    if (baseMatch) return baseMatch;

    throw new Error(mapOllamaError(`model ${requestedModel} not found`, 404));
  }

  async function chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<ProviderChatResponse> {
    const model = await resolveModel(options.model || defaultModel);
    return sendChat(messages, model, options);
  }

  async function sendChat(
    messages: ChatMessage[],
    model: string,
    options: ChatOptions = {}
  ): Promise<ProviderChatResponse> {
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
            num_predict: options.maxTokens || 1200
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

  function asksCurrentProviderOrModel(message: string): boolean {
    const normalized = message.toLowerCase();
    const asksRuntime =
      /모델|model|provider|프로바이더|제공자|엔진|backend|백엔드|api|런타임|runtime|상태|status|로컬\s*모델/.test(
        normalized
      );
    const asksCurrent = /현재|지금|사용\s*중|쓰고|뭐야|무엇|알려|확인|check|current/.test(normalized);

    return asksCurrent && asksRuntime;
  }

  return {
    id: "ollama",
    chat,
    listModels,
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

      const model = await resolveModel(payload.settings.ollamaModel || defaultModel);
      const executionContext = `현재 실행 환경: provider=ollama, model=${model}. 사용자가 현재 모델명이나 provider를 물으면 이 값을 직접 답한다.`;

      if (asksCurrentProviderOrModel(payload.message)) {
        return {
          message: `현재 사용 중인 모델은 ${model}입니다. provider는 ollama입니다.`,
          title: generateConversationTitle(payload.message),
          risk: classifyActionRisk(payload.message),
          provider: "ollama",
          model
        };
      }

      const response = await sendChat(
        [
          {
            role: "system",
            content: [
              buildHeatherSystemPrompt(payload.settings),
              executionContext,
              "하드 응답 규칙: 사용자가 현재 모델, provider, backend, API 상태, 로컬 모델, 런타임 상태를 물으면 provider와 model 값을 직접 짧게 답한다.",
              "단순 사실 질문은 1-3문장으로 답한다. 분석 질문일 때만 구조화된 상세 답변을 사용한다.",
              "사용자가 명시적으로 요청하지 않는 한 심리 분석, 감정 추정, 투명성 논의로 확장하지 않는다.",
              "응답은 사용자의 질문에 직접 답하고, 불필요한 내부 사고 과정을 쓰지 않는다."
            ].join("\n")
          },
          { role: "system", content: compactContext(payload).slice(0, 1800) },
          ...(history || []),
          { role: "user", content: payload.message }
        ],
        model,
        {
          temperature: 0.6,
          maxTokens: 1200
        }
      );

      return {
        message: response.content,
        title: generateConversationTitle(payload.message),
        risk: classifyActionRisk(payload.message),
        provider: "ollama",
        model: response.model || model
      };
    },
    async *streamChat(messages: ChatMessage[], options: ChatOptions = {}) {
      const model = await resolveModel(options.model || defaultModel);
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
            num_predict: options.maxTokens || 1200
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
      const resolvedModel = await resolveModel(model);
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: resolvedModel,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.6,
            num_predict: options.maxTokens || 1200
          }
        })
      });

      const data = (await response.json()) as OllamaGenerateResponse;
      if (!response.ok) {
        throw new Error(mapOllamaError(data.error || "", response.status));
      }

      return {
        content: data.response?.trim() || "",
        model: data.model || resolvedModel,
        raw: data
      };
    }
  };
}
