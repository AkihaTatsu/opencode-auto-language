// Diagnostic language classification; review flags manually, especially quotations.
import { eld } from "eld/medium"
const path = process.argv[2]
if (!path) throw new Error("Usage: bun scripts/review-live.ts results.jsonl")
for (const line of (await Bun.file(path).text()).trim().split("\n")) {
  const row = JSON.parse(line)
  const target = row.case.split("-")[0]
  const foreign = row.reasoning.split(/\n\s*\n/).flatMap((text: string, index: number) => {
    const result = eld.detect(text)
    return result.isReliable() && result.language !== target ? [{ paragraph: index + 1, language: result.language }] : []
  })
  console.log(JSON.stringify({ case: row.case, reasoning: eld.detect(row.reasoning).language, answer: eld.detect(row.text).language, foreign, unchanged: row.prompt_unchanged, exit: row.exit, errors: row.errors.length }))
}
