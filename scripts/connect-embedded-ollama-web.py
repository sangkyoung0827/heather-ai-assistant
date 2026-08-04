from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def update(path: str, replacements: list[tuple[str, str, str]]) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    changed = False
    for label, old, new in replacements:
        if new in content:
            continue
        count = content.count(old)
        if count != 1:
            raise RuntimeError(f"{path} / {label}: expected one match, found {count}")
        content = content.replace(old, new, 1)
        changed = True
    if changed:
        target.write_text(content, encoding="utf-8")
        print(f"{path}: embedded Ollama web integration applied")
    else:
        print(f"{path}: embedded Ollama web integration already applied")


update(
    "apps/web/components/heather/panels/ChatPanel.tsx",
    [
        (
            "personal chat import",
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\n',
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\nimport { canUseEmbeddedOllama, runEmbeddedOllamaChat } from "../../../lib/chat/embedded-ollama-client";\n',
        ),
        (
            "personal basic engine branch",
            '''  async function resolveHeatherResponse(payload: ChatRequestPayload, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<ApiChatResponse> {
    const cachedResponse = payload.executionMode !== "HEATHER_BASIC"''',
            '''  async function resolveHeatherResponse(payload: ChatRequestPayload, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<ApiChatResponse> {
    if (payload.executionMode === "HEATHER_BASIC" && canUseEmbeddedOllama()) {
      onEvent({ type: "progress", data: createClientProgressEvent("request_received", "completed", 12, "embedded-ollama") });
      onEvent({ type: "progress", data: createClientProgressEvent("local_engine_status", "active", 34, "Heather embedded Ollama") });
      const response = await runEmbeddedOllamaChat(payload, "general", signal);
      onEvent({ type: "progress", data: createClientProgressEvent("response_composition", "completed", 92, response.model) });
      onEvent({ type: "progress", data: createClientProgressEvent("completed", "completed", 100, "embedded-ollama") });
      return response;
    }

    const cachedResponse = payload.executionMode !== "HEATHER_BASIC"''',
        ),
    ],
)

update(
    "apps/web/components/heather/panels/ResearchChatPanel.tsx",
    [
        (
            "research chat import",
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\n',
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\nimport { canUseEmbeddedOllama, persistEmbeddedResearchTurn, runEmbeddedOllamaChat } from "../../../lib/chat/embedded-ollama-client";\n',
        ),
        (
            "research execution mode before uploads",
            '''    const files = attachments.map((attachment) => attachment.file);
    setAttachments([]); applyOptimistic(userMessage);
    try {
      let conversationId = activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id;''',
            '''    const files = attachments.map((attachment) => attachment.file);
    const executionMode = activeConversation?.executionMode || newConversationExecutionMode;
    setAttachments([]); applyOptimistic(userMessage);
    try {
      if (executionMode === "HEATHER_BASIC" && canUseEmbeddedOllama() && files.length) {
        throw new Error("헤더 기본 엔진의 이미지 입력은 아직 지원되지 않습니다. 첨부파일을 제거하거나 고급추론으로 전환해주세요.");
      }
      let conversationId = activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id;''',
        ),
        (
            "research duplicate execution declaration",
            '''      const executionMode = activeConversation?.executionMode || newConversationExecutionMode;
      const payload: ChatRequestPayload =''',
            '''      const payload: ChatRequestPayload =''',
        ),
        (
            "research local engine branch",
            '''      const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId, conversation: activeConversation || undefined, messageAlreadyPersisted, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [], executionMode };
      const session = await getSupabaseBrowserClient()?.auth.getSession();''',
            '''      const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId, conversation: activeConversation || undefined, messageAlreadyPersisted, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [], executionMode };
      if (executionMode === "HEATHER_BASIC" && canUseEmbeddedOllama()) {
        setProgressEvents((current) => [...current, createClientProgressEvent("local_engine_status", "active", 34, "Heather embedded Ollama")]);
        const local = await runEmbeddedOllamaChat(payload, "research", controller.signal);
        const responseMessage = cleanResearchDisplayText(local.message);
        applyOptimistic(createMessage("assistant", responseMessage, "text", { provider: local.provider, model: local.model, execution: local.execution }));
        const persisted = await persistEmbeddedResearchTurn(payload, { ...local, message: responseMessage }, controller.signal);
        setProgressEvents((current) => [...current, createClientProgressEvent("completed", "completed", 100, "embedded-ollama")]);
        await refreshAfterSend(persisted.conversationId);
        return;
      }
      const session = await getSupabaseBrowserClient()?.auth.getSession();''',
        ),
    ],
)

update(
    "apps/web/components/heather/panels/LocalControlPanel.tsx",
    [
        (
            "embedded status import",
            'import type { AllowedDirectory, FileItem, SystemInfo } from "@heather/platform";\n',
            'import type { AllowedDirectory, FileItem, SystemInfo } from "@heather/platform";\nimport { embeddedOllamaStatus, type EmbeddedOllamaStatus } from "../../../lib/chat/embedded-ollama-client";\n',
        ),
        (
            "status type",
            '''type OllamaStatus = {
  available: boolean;
  baseUrl: string;
  configuredModel?: string;
  model: string;
  models?: string[];
  message: string;
};''',
            '''type OllamaStatus = Partial<EmbeddedOllamaStatus> & {
  available: boolean;
  embedded?: boolean;
  baseUrl?: string;
  configuredModel?: string;
  model: string;
  models?: string[];
  message: string;
};''',
        ),
        (
            "desktop status invocation",
            '''      const data = desktopAdapter
        ? await invokeTauriCommand<OllamaStatus>("ollama_status", {
            baseUrl: settings.ollamaBaseUrl,
            model: settings.ollamaModel
          })
        : await requestOllamaStatus(settings.ollamaBaseUrl, settings.ollamaModel);''',
            '''      const data = desktopAdapter
        ? await embeddedOllamaStatus(settings.ollamaModel)
        : await requestOllamaStatus(settings.ollamaBaseUrl, settings.ollamaModel);''',
        ),
        (
            "desktop status failure",
            '''      const data = {
        available: false,
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
        message: "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행한 뒤 다시 시도하세요."
      };''',
            '''      const data = {
        available: false,
        embedded: Boolean(desktopAdapter),
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
        message: desktopAdapter
          ? "Heather 앱에 내장된 Ollama 런타임을 시작하지 못했습니다. 앱 리소스와 embedded-ollama.log를 확인하세요."
          : "Heather 내장 기본 엔진은 데스크톱 앱에서만 실행됩니다."
      };''',
        ),
    ],
)
