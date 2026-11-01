import { Plugin } from "@opencode/plugin"
import { instruction } from "./instructions.ts"
import { detectInput, sourceText } from "./detect.ts"
import { appendInstruction, candidate, compactionRequest, METADATA_KEY } from "./requests.ts"
import type { MessageLike } from "./requests.ts"

const primaryAgents = new Set(["build", "plan"])
const storageKey = (sessionID: string) => `session/${sessionID}/language`

export default Plugin.define({
  id: "opencode-auto-language",
  async setup(ctx) {
    async function saved(sessionID: string): Promise<string | undefined> {
      const value = await ctx.storage.get(storageKey(sessionID))
      return typeof value === "string" ? value : undefined
    }

    async function resolve(sessionID: string, messages: readonly MessageLike[]): Promise<string | undefined> {
      let language: string | undefined
      // Synthetic goal kickoffs can follow regular user messages. Resolve in
      // request order so an older user's metadata cannot hide a newer objective.
      const history = await ctx.session.context({ sessionID })
      const byID = new Map(history.map((message) => [message.id as string, message]))
      const ordered = messages.some((message) => message.id)
        ? [...messages].reverse().map((message) => ({ metadata: message.metadata, typed: message.id ? byID.get(message.id) : undefined }))
        : [...history].reverse().map((typed) => ({ metadata: typed.metadata, typed }))
      for (const { metadata, typed } of ordered) {
        let info = candidate(metadata)
        if (!info && typed && (typed.type === "user" || typed.type === "synthetic")) {
          if (typed.type === "synthetic" && sourceText(typed.text).source !== "goal") continue
          info = detectInput(typed.text)
        }
        if (info?.reliable && info.language) { language = info.language; break }
      }
      language ??= await saved(sessionID)
      if (language) await ctx.storage.set(storageKey(sessionID), language)
      return language
    }

    async function isPrimarySession(sessionID: string) {
      const session = await ctx.session.get({ sessionID })
      const agent = session.agent ?? (await ctx.agent.list()).data[0]?.id
      return agent !== undefined && primaryAgents.has(agent)
    }

    await ctx.session.hook("prompt", (event) => {
      const info = detectInput(event.prompt.text)
      event.metadata = { ...event.metadata, [METADATA_KEY]: { language: info.language ?? null, reliable: info.reliable } }
    })

    await ctx.session.hook("context", async (event) => {
      if (!primaryAgents.has(event.agent)) return
      const language = await resolve(event.sessionID, event.messages)
      if (language) {
        event.messages = appendInstruction(event.messages, language)
        event.system = [...event.system, { type: "text", text: instruction(language) }]
      }
    })

    await ctx.session.hook("title", async (event) => {
      if (!(await isPrimarySession(event.sessionID))) return
      const language = await resolve(event.sessionID, event.messages)
      if (language) {
        event.messages = appendInstruction(event.messages, language)
        event.system = [...event.system, { type: "text", text: instruction(language) }]
      }
    })

    await ctx.session.hook("generate", async (event) => {
      if (!(await isPrimarySession(event.sessionID))) return
      // Native goal judging and summary generation share this request path.
      const text = event.messages.filter((message) => message.role === "user").slice(-1).flatMap((message) => typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) => part.type === "text" ? [part.text] : [])).join("\n")
      if (event.agent !== "summary" && !text.includes("<untrusted_objective>")) return
      const language = await resolve(event.sessionID, event.messages)
      if (language) {
        event.messages = appendInstruction(event.messages, language)
        event.system = [...event.system, { type: "text", text: instruction(language) }]
      }
    })

    await ctx.session.hook("compaction", async (event) => {
      if (!(await isPrimarySession(event.sessionID))) return
      await resolve(event.sessionID, event.messages)
    })

    await ctx.session.hook("http.request", async (event) => {
      if (event.kind !== "compaction" || !(await isPrimarySession(event.sessionID))) return
      const language = await saved(event.sessionID)
      if (language) event.request = await compactionRequest(event.request, language)
    })
  },
})
