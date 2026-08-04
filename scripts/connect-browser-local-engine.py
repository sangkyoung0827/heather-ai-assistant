from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def update(path: str, replacements: list[tuple[str, str, str]]) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    changed = False
    for label, old, new in replacements:
        if new.startswith(old) and new in content:
            continue
        count = content.count(old)
        if count == 1:
            content = content.replace(old, new, 1)
            changed = True
            continue
        if count == 0 and new in content:
            continue
        raise RuntimeError(f"{path} / {label}: expected one original or one applied replacement, found {count}")
    if changed:
        target.write_text(content, encoding="utf-8")
        print(f"{path}: browser-local Heather engine integration applied")
    else:
        print(f"{path}: browser-local Heather engine integration already applied")


update(
    "apps/web/app/api/chat/route.ts",
    [
        (
            "browser context response type",
            '  personalMemo?: { id: string; title: string; action: string };\n}',
            '  personalMemo?: { id: string; title: string; action: string };\n  browserContext?: Pick<ChatRequestPayload, "memories" | "projects" | "teachings" | "automationRecipes">;\n}',
        ),
        (
            "browser preflight payload type",
            'type ResolvedChat = { response: CachedChatResponse; usedTools: string[] };\n',
            'type ResolvedChat = { response: CachedChatResponse; usedTools: string[] };\ntype BrowserLocalChatPayload = ChatRequestPayload & { browserLocalPreflight?: boolean };\n',
        ),
        (
            "browser request parse",
            '  const receivedPayload = await request.json() as ChatRequestPayload;\n',
            '  const receivedPayload = await request.json() as BrowserLocalChatPayload;\n',
        ),
        (
            "browser preflight mode gate",
            '''  const executionMode = await resolvePersonalExecutionMode(request, receivedPayload);
  report?.("execution_mode_check", "completed", 14);
  if (executionMode === "HEATHER_BASIC") {''',
            '''  const executionMode = await resolvePersonalExecutionMode(request, receivedPayload);
  const browserLocalPreflight = Boolean(receivedPayload.browserLocalPreflight);
  report?.("execution_mode_check", "completed", 14);
  if (executionMode === "HEATHER_BASIC" && !browserLocalPreflight) {''',
        ),
        (
            "browser context handoff",
            '''  const cacheKey = createCacheKey(payload);
  if (payload.settings.cacheResponses) {''',
            '''  if (executionMode === "HEATHER_BASIC" && browserLocalPreflight) {
    report?.("local_engine_status", "completed", 78, { type: "llm", detail: "브라우저 WebGPU 엔진에 전달할 계정 컨텍스트를 준비했습니다." });
    return {
      response: {
        message: "__HEATHER_BROWSER_LOCAL_CONTINUE__",
        title: generateConversationTitle(payload.message),
        risk: { level: "low", requiresConfirmation: false, reason: "Browser-local context handoff." },
        provider: "browser-local-preflight",
        model: "webllm",
        browserContext: {
          memories: payload.memories,
          projects: payload.projects,
          teachings: payload.teachings,
          automationRecipes: payload.automationRecipes
        }
      },
      usedTools
    };
  }

  const cacheKey = createCacheKey(payload);
  if (payload.settings.cacheResponses) {''',
        ),
    ],
)

update(
    "apps/web/components/heather/panels/ChatPanel.tsx",
    [
        (
            "personal browser engine import",
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\n',
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\nimport { resolveBrowserLocalChat } from "../../../lib/chat/browser-local-engine";\n',
        ),
        (
            "personal browser engine branch",
            '''  async function resolveHeatherResponse(payload: ChatRequestPayload, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<ApiChatResponse> {
    const cachedResponse = payload.executionMode !== "HEATHER_BASIC"''',
            '''  async function resolveHeatherResponse(payload: ChatRequestPayload, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<ApiChatResponse> {
    if (payload.executionMode === "HEATHER_BASIC") {
      onEvent({ type: "progress", data: createClientProgressEvent("request_received", "completed", 10) });
      onEvent({ type: "progress", data: createClientProgressEvent("local_engine_status", "active", 18, "llm") });
      const response = await resolveBrowserLocalChat(payload, "general", signal, (progress) => {
        const percentage = Math.max(18, Math.min(88, Math.round(18 + progress.progress * 70)));
        onEvent({ type: "progress", data: createClientProgressEvent("local_engine_status", "active", percentage, "llm") });
      });
      onEvent({ type: "progress", data: createClientProgressEvent("response_composition", "completed", 94, "llm") });
      onEvent({ type: "progress", data: createClientProgressEvent("completed", "completed", 100, "llm") });
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
            "research browser engine import",
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\n',
            'import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";\nimport { persistBrowserResearchTurn, resolveBrowserLocalChat } from "../../../lib/chat/browser-local-engine";\n',
        ),
        (
            "research execution mode declaration",
            '''  async function send() {
    const message = draft.trim();
    if ((!message && !attachments.length) || isSending || lockRef.current) return;''',
            '''  async function send() {
    const message = draft.trim();
    if ((!message && !attachments.length) || isSending || lockRef.current) return;
    const executionMode = activeConversation?.executionMode || newConversationExecutionMode;''',
        ),
        (
            "research attachment guard",
            '''    const files = attachments.map((attachment) => attachment.file);
    setAttachments([]); applyOptimistic(userMessage);
    try {
      let conversationId = activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id;''',
            '''    const files = attachments.map((attachment) => attachment.file);
    setAttachments([]); applyOptimistic(userMessage);
    try {
      if (executionMode === "HEATHER_BASIC" && files.length) {
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
            "research browser engine branch",
            '''      const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId, conversation: activeConversation || undefined, messageAlreadyPersisted, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [], executionMode };
      const session = await getSupabaseBrowserClient()?.auth.getSession();''',
            '''      const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId, conversation: activeConversation || undefined, messageAlreadyPersisted, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [], executionMode };
      if (executionMode === "HEATHER_BASIC") {
        setProgressEvents((current) => [...current, createClientProgressEvent("local_engine_status", "active", 18)]);
        const local = await resolveBrowserLocalChat(payload, "research", controller.signal, (progress) => {
          const percentage = Math.max(18, Math.min(88, Math.round(18 + progress.progress * 70)));
          setProgressEvents((current) => [...current, createClientProgressEvent("local_engine_status", "active", percentage)]);
        });
        const responseMessage = cleanResearchDisplayText(local.message);
        applyOptimistic(createMessage("assistant", responseMessage, "text", { provider: local.provider, model: local.model, execution: local.execution }));
        const persisted = await persistBrowserResearchTurn(payload, { ...local, message: responseMessage }, controller.signal);
        setProgressEvents((current) => [...current, createClientProgressEvent("completed", "completed", 100)]);
        await refreshAfterSend(persisted.conversationId);
        return;
      }
      const session = await getSupabaseBrowserClient()?.auth.getSession();''',
        ),
    ],
)

print("Heather browser-local engine patch complete.")
