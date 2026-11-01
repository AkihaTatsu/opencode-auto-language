import { instruction } from "./instructions.ts"

export const METADATA_KEY = "opencodeAutoLanguage"
export interface Candidate { language?: string; reliable: boolean }
export interface MessageLike {
  role: string
  id?: string
  content: string | readonly unknown[]
  metadata?: unknown
}

export function candidate(metadata: unknown): Candidate | undefined {
  if (!metadata || typeof metadata !== "object") return
  const value = (metadata as Record<string, unknown>)[METADATA_KEY]
  if (!value || typeof value !== "object") return
  const info = value as Record<string, unknown>
  return { language: typeof info.language === "string" ? info.language : undefined, reliable: info.reliable === true }
}

export function appendInstruction<T extends MessageLike>(messages: readonly T[], language: string): T[] {
  const result = [...messages]
  const index = result.findLastIndex((message) => message.role === "user")
  if (index < 0) return result
  const message = result[index]!
  const block = instruction(language)
  const content = message.content
  if (typeof content === "string") {
    if (!content.endsWith(block)) result[index] = { ...message, content: `${content}\n\n${block}` }
  } else {
    const last = content.at(-1) as { type?: string; text?: string } | undefined
    if (last?.type !== "text" || last.text !== block) {
      result[index] = { ...message, content: [...content, { type: "text", text: block }] }
    }
  }
  return result
}

// Compaction appends its own user prompt AFTER the semantic request hook.
// Add the instruction to that actual prompt at the transport boundary.
export async function compactionRequest(request: Request, language: string): Promise<Request> {
  const body = await request.clone().json() as { messages?: MessageLike[]; input?: MessageLike[] }
  if (Array.isArray(body.messages)) {
    body.messages = appendInstruction(body.messages, language)
  } else if (Array.isArray(body.input)) {
    // Responses API uses input_text, unlike Chat Completions and Anthropic.
    body.input = appendInstruction(body.input, language).map((message) => ({
      ...message,
      content: typeof message.content === "string" ? message.content : message.content.map((part) => {
        const p = part as { type?: string; text?: string }
        return p.type === "text" && p.text === instruction(language) ? { ...p, type: "input_text" } : part
      }),
    }))
  } else {
    throw new Error("opencode-auto-language: unsupported compaction request format (expected messages or input)")
  }
  const headers = new Headers(request.headers)
  headers.delete("content-length")
  return new Request(request, { body: JSON.stringify(body), headers })
}
