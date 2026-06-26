import { createLocalHeatherResponse } from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import type { AIProvider } from "../types";

export function createLocalAIProvider(): AIProvider {
  return {
    id: "local-heather",
    async generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
      return createLocalHeatherResponse(payload);
    }
  };
}
