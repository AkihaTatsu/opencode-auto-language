import { expect, test } from "bun:test"
import { appendInstruction, compactionRequest } from "../src/requests.ts"

test("only the outgoing user copy changes; tools, reasoning and signatures stay intact", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "请比较这两个方案并解释理由。" }] },
    { role: "assistant", content: [{ type: "reasoning", text: "原有推理", signature: "bound" }] },
    { role: "tool", content: [{ type: "tool-result", text: "English output" }] },
  ]
  const before = structuredClone(messages)
  const after = appendInstruction(messages, "zh")
  expect(messages).toEqual(before)
  expect(JSON.stringify(after[0])).toContain('language=\\"zh\\"')
  expect(after.slice(1)).toEqual(messages.slice(1))
  expect(appendInstruction(after, "zh")).toEqual(after)
})

test("native reminders receive the constraint without replacing the restriction", () => {
  const reminder = "Tools are disabled until next user input. Respond with text only."
  const after = appendInstruction([{ role: "user", content: reminder }], "ja")
  expect(after[0]!.content).toStartWith(reminder)
  expect(after[0]!.content).toContain("日本語")
})

for (const format of ["chat", "anthropic", "responses"] as const) {
  test(`compaction footer follows the real summary prompt: ${format}`, async () => {
    const messages = [{ role: "user", content: format === "chat" ? "Summarize.\n## Objective" : [{ type: format === "responses" ? "input_text" : "text", text: "Summarize.\n## Objective" }] }]
    const payload = { model: "test-model", ...(format === "responses" ? { input: messages } : { messages }), temperature: 0.2 }
    const original = new Request("https://example.invalid/v1/messages", { method: "POST", headers: { "authorization": "test-secret", "content-type": "application/json" }, body: JSON.stringify(payload) })
    const modified = await compactionRequest(original, "ar")
    const result = await modified.json()
    expect(await original.json()).toEqual(payload)
    expect(result.temperature).toBe(0.2)
    expect(modified.headers.get("authorization")).toBe("test-secret")
    expect(JSON.stringify(result)).toContain("## Objective")
    expect(JSON.stringify(result)).toContain("العربية")
    if (format === "responses") expect(result.input[0].content.at(-1).type).toBe("input_text")
  })
}

test("unknown compaction protocol reports an error", async () => {
  const request = new Request("https://example.invalid", { method: "POST", body: "{}" })
  expect(compactionRequest(request, "zh")).rejects.toThrow("unsupported compaction")
})
