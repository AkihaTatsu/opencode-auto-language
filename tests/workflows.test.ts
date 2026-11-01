import { describe, expect, test } from "bun:test"
import plugin from "../src/index.ts"
import templates from "../src/native-templates.json"

// Fake the public host boundary, exercising the registered plugin end-to-end.
async function host(agent = "plan", store = new Map<string, unknown>()) {
  const hooks = new Map<string, (event: any) => unknown>()
  const history: any[] = []
  const ctx = {
    storage: { get: async (key: string) => store.get(key), set: async (key: string, value: unknown) => { store.set(key, value) } },
    agent: { list: async () => ({ data: [{ id: "build" }] }) },
    session: {
      get: async () => ({ agent }),
      context: async () => history,
      hook: async (name: string, handler: (event: any) => unknown) => { hooks.set(name, handler) },
    },
  }
  await plugin.setup(ctx as unknown as Parameters<typeof plugin.setup>[0])
  return {
    hooks, history, store,
    async user(text: string, id = `message-${history.length}`) {
      const event: any = { sessionID: "test", messageID: id, prompt: { text } }
      await hooks.get("prompt")!(event)
      const message = { type: "user", role: "user", id, text, content: text, metadata: event.metadata }
      history.push(message)
      expect(event.prompt.text).toBe(text)
      return message
    },
    async request(kind: string, messages: any[], selectedAgent = agent) {
      const event = { sessionID: "test", agent: selectedAgent, messages: structuredClone(messages), system: [{ type: "text", text: "Original system rules" }], tools: { write: { description: "Write a file", input: { type: "object" } } } }
      await hooks.get(kind)!(event)
      expect(event.system[0]).toEqual({ type: "text", text: "Original system rules" })
      expect(event.tools.write.description).toBe("Write a file")
      return event
    },
  }
}

describe("request lifecycle", () => {
  test("Plan continuation, real language switch, and short confirmation", async () => {
    const h = await host()
    const zh = await h.user("请分析这两个方案的优缺点，并提出明确建议。")
    const reminder = { role: "user", content: "The previous response was interrupted. Continue where you left off." }
    expect(JSON.stringify((await h.request("context", [zh, reminder])).messages)).toContain('language=\\"zh\\"')
    const ja = await h.user("次の課題について詳しく分析し、実行できる計画を提案してください。")
    expect(JSON.stringify((await h.request("context", [zh, ja])).messages)).toContain('language=\\"ja\\"')
    const ok = await h.user("OK")
    expect(JSON.stringify((await h.request("context", [zh, ja, ok])).messages)).toContain('language=\\"ja\\"')
  })
  test("queued prompts do not change language before entering the request", async () => {
    const h = await host()
    const zh = await h.user("请详细比较这两种实现方式并说明优缺点。")
    await h.user("Please compare these implementations and explain which one is better.")
    expect(JSON.stringify((await h.request("context", [zh])).messages)).toContain('language=\\"zh\\"')
  })
  test("compaction and server restart retain language without a surviving user message", async () => {
    const h = await host("build")
    const zh = await h.user("请详细比较这两种实现方式并说明优缺点。")
    await h.request("context", [zh])
    const restarted = await host("build", h.store)
    const checkpoint = { role: "user", id: "checkpoint", content: "<conversation-checkpoint>English summary</conversation-checkpoint>" }
    expect(JSON.stringify((await restarted.request("context", [checkpoint])).messages)).toContain('language=\\"zh\\"')
  })
  test("title can resolve language before the first primary request", async () => {
    const h = await host()
    const zh = await h.user("请分析当前项目的设计并给出改进建议。")
    expect(JSON.stringify((await h.request("title", [{ role: "user", content: zh.text }])).messages)).toContain('language=\\"zh\\"')
  })
  test("native goal synthetic kickoff supplies language even without prompt admission", async () => {
    const h = await host()
    const text = templates.goal.replace("${objective}", "请分析当前项目的设计并给出改进建议。")
    h.history.push({ id: "goal", type: "synthetic", text, metadata: { source: "goal" } })
    expect(JSON.stringify((await h.request("context", [{ role: "user", id: "goal", content: text }])).messages)).toContain('language=\\"zh\\"')
  })
  test("a new goal overrides an older user's detected language", async () => {
    const h = await host()
    const old = await h.user("Please compare these implementations and explain which one is better.")
    const text = templates.goal.replace("${objective}", "请分析当前项目的设计并给出改进建议。")
    h.history.push({ id: "goal", type: "synthetic", text, metadata: { source: "goal" } })
    expect(JSON.stringify((await h.request("context", [old, { role: "user", id: "goal", content: text }])).messages)).toContain('language=\\"zh\\"')
  })
  test("legacy sessions inspect user history but never English synthetic instructions", async () => {
    const h = await host()
    h.history.push({ id: "old-user", type: "user", text: "请分析当前项目的设计并给出改进建议。" })
    h.history.push({ id: "notice", type: "synthetic", text: "Continue working until the entire task has been completed." })
    const messages = h.history.map((m) => ({ id: m.id, role: "user", content: m.text }))
    expect(JSON.stringify((await h.request("context", messages)).messages)).toContain('language=\\"zh\\"')
  })
  test("goal judging and native summary receive language; unrelated generate calls do not", async () => {
    const h = await host()
    await h.user("请分析当前项目的设计并给出改进建议。")
    const judge = [{ role: "user", content: 'Judge the goal. <untrusted_objective>task</untrusted_objective> Return JSON.' }]
    expect(JSON.stringify((await h.request("generate", judge)).messages)).toContain('language=\\"zh\\"')
    const other = [{ role: "user", content: "An unrelated plugin request." }]
    expect((await h.request("generate", other)).messages).toEqual(other)
    expect(JSON.stringify((await h.request("generate", other, "summary")).messages)).toContain('language=\\"zh\\"')
  })
  test("compaction transport appends after native summary instructions", async () => {
    const h = await host()
    const user = await h.user("请分析当前项目的设计并给出改进建议。")
    await h.request("compaction", [user])
    const event = {
      sessionID: "test", kind: "compaction",
      request: new Request("https://example.test/v1/chat/completions", { method: "POST", body: JSON.stringify({
        messages: [{ role: "user", content: "Summarize. Keep ## Objective and ## Next Move headings." }],
      }) }),
    }
    await h.hooks.get("http.request")!(event)
    const body = await event.request.json() as any
    expect(body.messages[0].content).toStartWith("Summarize. Keep ## Objective and ## Next Move headings.")
    expect(body.messages[0].content).toContain('language="zh"')
    expect(body.messages[0].content).toEndWith("</opencode-auto-language>")
  })
  test("system addition retains rules and maximum-step assistant instruction", async () => {
    const h = await host()
    const user = await h.user("请分析当前项目的设计并给出改进建议。")
    const limit = { role: "assistant", content: "Maximum steps reached. Summarize progress. Do not call tools." }
    const event = await h.request("context", [user, limit])
    expect(event.system.at(-1)?.text).toContain('language="zh"')
    expect(event.messages.at(-1)).toEqual(limit)
  })
  test("a previous goal does not classify unrelated generation as judging", async () => {
    const h = await host()
    const user = await h.user("请分析当前项目的设计并给出改进建议。")
    const messages = [user, { role: "user", content: "<untrusted_objective>old goal</untrusted_objective>" }, { role: "user", content: "Unrelated generation." }]
    expect((await h.request("generate", messages)).messages).toEqual(messages)
  })
  test("third-party and child agents are out of scope", async () => {
    for (const agent of ["orchestrator", "explore", "general"]) {
      const h = await host(agent)
      const user = await h.user("请分析当前项目的设计并给出改进建议。")
      expect((await h.request("context", [user])).messages).toEqual([user])
      expect((await h.request("title", [user])).messages).toEqual([user])
    }
  })
})
