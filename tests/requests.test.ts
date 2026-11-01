import { test } from "node:test"
import assert from "node:assert/strict"
import { appendInstruction, compactionRequest } from "../src/requests.ts"

test("only the outgoing user copy changes; tools, reasoning and signatures stay intact", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "请比较这两个方案并解释理由。" }] },
    { role: "assistant", content: [{ type: "reasoning", text: "原有推理", signature: "bound" }] },
    { role: "tool", content: [{ type: "tool-result", text: "English output" }] },
  ]
  const before = structuredClone(messages)
  const after = appendInstruction(messages, "zh")
  assert.deepStrictEqual(messages, before)
  assert.ok((JSON.stringify(after[0])).includes('language=\\"zh\\"'))
  assert.deepStrictEqual(after.slice(1), messages.slice(1))
  assert.deepStrictEqual(appendInstruction(after, "zh"), after)
})

test("native reminders receive the constraint without replacing the restriction", () => {
  const reminder = "Tools are disabled until next user input. Respond with text only."
  const after = appendInstruction([{ role: "user", content: reminder }], "ja")
  assert.ok((after[0]!.content).startsWith(reminder))
  assert.ok((after[0]!.content).includes("日本語"))
})

for (const format of ["chat", "anthropic", "responses"] as const) {
  test(`compaction footer follows the real summary prompt: ${format}`, async () => {
    const messages = [{ role: "user", content: format === "chat" ? "Summarize.\n## Objective" : [{ type: format === "responses" ? "input_text" : "text", text: "Summarize.\n## Objective" }] }]
    const payload = { model: "test-model", ...(format === "responses" ? { input: messages } : { messages }), temperature: 0.2 }
    const original = new Request("https://example.invalid/v1/messages", { method: "POST", headers: { "authorization": "test-secret", "content-type": "application/json" }, body: JSON.stringify(payload) })
    const modified = await compactionRequest(original, "ar")
    const result = await modified.json()
    assert.deepStrictEqual(await original.json(), payload)
    assert.strictEqual(result.temperature, 0.2)
    assert.strictEqual(modified.headers.get("authorization"), "test-secret")
    assert.ok((JSON.stringify(result)).includes("## Objective"))
    assert.ok((JSON.stringify(result)).includes("العربية"))
    if (format === "responses") assert.strictEqual(result.input[0].content.at(-1).type, "input_text")
  })
}

test("unknown compaction protocol reports an error", async () => {
  const request = new Request("https://example.invalid", { method: "POST", body: "{}" })
  await assert.rejects(compactionRequest(request, "zh"), /unsupported compaction/)
})
