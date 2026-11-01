import { eld } from "eld/medium"
import templates from "./native-templates.json"

export interface Detection {
  language?: string
  source: "user" | "command" | "goal"
  reliable: boolean
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// These are exact upstream templates, not heuristic English-prefix matches.
const commandPatterns = ["init", "review"].map((name) => {
  const template = templates[name as "init" | "review"]
  if (template.includes("$ARGUMENTS")) {
    return new RegExp("^" + escapeRegex(template).replaceAll(escapeRegex("${path}"), "[^\\n]*").replaceAll(escapeRegex("$ARGUMENTS"), "([\\s\\S]*?)") + "$")
  }
  return new RegExp("^" + escapeRegex(template).replaceAll(escapeRegex("${path}"), "[^\\n]*") + "(?:\\n\\n([\\s\\S]*))?$")
})
const schedulePattern = new RegExp("^" + escapeRegex(templates.schedule).replace(escapeRegex("$ARGUMENTS"), "([\\s\\S]*?)") + "$")
const goalPattern = new RegExp("^" + escapeRegex(templates.goal).replace(escapeRegex("${objective}"), "([\\s\\S]*?)") + "$")

export function sourceText(text: string): { text: string; source: Detection["source"] } {
  // The OpenCode run CLI currently wraps the positional prompt in literal quotes.
  const value = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text
  for (const pattern of [...commandPatterns, schedulePattern]) {
    const match = pattern.exec(value)
    if (match) return { text: match[1] ?? "", source: "command" }
  }
  const goal = goalPattern.exec(value)
  if (goal) return {
    text: goal[1]!.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"),
    source: "goal",
  }
  return { text: value, source: "user" }
}

export function prose(text: string): string {
  return text
    .replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\2[^\n]*(?=\n|$)/g, "$1")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^\s*>.*$/gm, "")
    .replace(/^[ \t]*(?:(?:const|let|var|import|export|function|class|return|def|from)\s|(?:\/\/|#include\b))[^\n]*$/gm, "")
    .replace(/^[ \t]*[\w.$]+\([^\n]*\);?[ \t]*$/gm, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .trim()
}

// A short acknowledgement should not switch an established conversation.
// These are intentionally exact phrases, not broad substring matches.
const acknowledgements = new Set([
  "ok", "okay", "yes", "no", "continue", "go ahead", "thanks", "thank you",
  "继续", "好的", "好", "是", "不是", "谢谢", "可以", "继续吧", "执行", "确认",
  "はい", "いいえ", "続けて", "了解", "ありがとう", "نعم", "لا", "تابع", "شكرا",
  "oui", "non", "merci", "continuez", "sí", "si", "gracias", "continúa",
  "ja", "nein", "weiter", "danke", "да", "нет", "продолжай", "спасибо",
  "네", "아니요", "계속", "감사합니다",
])

// Recognize explicit interaction-language requests separately from artifact language.
const languageNames = new Intl.DisplayNames(["zh"], { type: "language" })
const explicitLanguages = Object.values(eld.info().Languages).map((code) => ({
  code, pattern: new RegExp(`(?:用|使用)\\s*${escapeRegex(languageNames.of(code) ?? code)}\\s*(?:进行)?(?:思考和交流|思考和回答|思考与交流|交流|沟通|回答)`),
}))

export function detectInput(text: string): Detection {
  const source = sourceText(text)
  const value = prose(source.text)
  const explicit = explicitLanguages.find(({ pattern }) => pattern.test(value))
  if (explicit) return { language: explicit.code, source: source.source, reliable: true }
  const phrase = value.toLocaleLowerCase().replace(/[\p{P}\p{S}]+$/gu, "").trim()
  if (!value || acknowledgements.has(phrase)) return { source: source.source, reliable: false }
  const result = eld.detect(value)
  return { language: result.language || undefined, source: source.source, reliable: result.isReliable() }
}

export const supportedLanguages = Object.values(eld.info().Languages)
