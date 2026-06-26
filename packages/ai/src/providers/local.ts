import { createLocalHeatherResponse } from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import type { AIProvider } from "../types";

export function createLocalAIProvider(): AIProvider {
  return {
    id: "local-heather",
    async chat(messages) {
      const lastMessage = messages.at(-1)?.content || "";
      return {
        content: lastMessage
          ? `로컬 Heather 규칙 기반 응답: ${lastMessage}`
          : "로컬 Heather 규칙 기반 응답을 준비했습니다.",
        model: "local-heather"
      };
    },
    async isAvailable() {
      return true;
    },
    async generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
      return createLocalHeatherResponse(payload);
    }
  };
}
