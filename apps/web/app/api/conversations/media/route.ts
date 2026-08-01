import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ConversationRepository, createConversationTitle } from "../../../../lib/conversations/repository";
import type { ConversationType } from "../../../../lib/conversations/types";
import { parseChatExecutionMode } from "../../../../lib/chat/execution-mode";

export const runtime = "nodejs";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  let uploadedPaths: string[] = [];
  let createdMessageId: string | null = null;
  try {
    const form = await request.formData();
    const content = String(form.get("message") || "").trim();
    const clientMessageId = String(form.get("clientMessageId") || "").trim();
    const conversationId = String(form.get("conversationId") || "").trim() || undefined;
    const type = parseType(form.get("type"));
    const executionMode = parseChatExecutionMode(form.get("executionMode"));
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!clientMessageId || !files.length || files.length > MAX_FILES) return NextResponse.json({ error: "Invalid media message." }, { status: 400 });
    if (files.some((file) => file.size <= 0 || file.size > MAX_FILE_BYTES) || files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "One or more files are too large." }, { status: 413 });
    }
    for (const file of files) await validateImage(file);

    const repository = new ConversationRepository();
    await repository.ensureMediaBucket();
    const turn = await repository.beginMessage({
      conversationId,
      type,
      title: createConversationTitle(content || "사진", type),
      content,
      clientMessageId,
      executionMode: executionMode || undefined,
      allowEmpty: true
    });
    createdMessageId = turn.userMessage.id;
    if (turn.duplicate) return NextResponse.json({ conversationId: turn.conversation.id, messageId: turn.userMessage.id, duplicate: true });

    const attachments = [];
    for (const file of files) {
      const id = randomUUID();
      const extension = extensionFor(file.type);
      const storagePath = `${turn.conversation.id}/${turn.userMessage.id}/${id}.${extension}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await repository.storage().upload(storagePath, bytes, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploadedPaths.push(storagePath);
      const dimensions = await imageDimensions(file, bytes);
      attachments.push({ id, type: "image" as const, storagePath, mimeType: file.type, sizeBytes: file.size, ...dimensions, status: "ready" as const });
    }
    await repository.createAttachments(turn.userMessage.id, attachments);
    return NextResponse.json({ conversationId: turn.conversation.id, messageId: turn.userMessage.id, attachments });
  } catch (error) {
    try {
      const repository = new ConversationRepository();
      if (uploadedPaths.length) await repository.storage().remove(uploadedPaths);
      if (createdMessageId) await repository.deleteMessage(createdMessageId);
    } catch {
      // The original upload failure is the useful error for the client.
    }
    return NextResponse.json({ error: publicError(error) }, { status: 422 });
  }
}

function parseType(value: FormDataEntryValue | null): ConversationType {
  return value === "research" ? "research" : "general";
}

async function validateImage(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Unsupported file type.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signatureOk =
    (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (file.type === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
    (file.type === "image/gif" && String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a") ||
    (file.type === "image/gif" && String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a") ||
    (file.type === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
  if (!signatureOk) throw new Error("The file signature does not match an image.");
}

function extensionFor(mimeType: string) { return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[mimeType] || "bin"; }

async function imageDimensions(file: File, bytes: Uint8Array) {
  if (file.type === "image/png" && bytes.length >= 24) return { width: readUInt32(bytes, 16), height: readUInt32(bytes, 20) };
  if (file.type === "image/gif" && bytes.length >= 10) return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  return {};
}

function readUInt32(bytes: Uint8Array, offset: number) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }
function publicError(error: unknown) { return error instanceof Error && /unsupported|signature|large/i.test(error.message) ? error.message : "Could not upload the photo."; }
