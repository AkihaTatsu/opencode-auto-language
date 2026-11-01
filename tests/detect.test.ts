import { describe, expect, test } from "bun:test"
import { detectInput, sourceText, supportedLanguages } from "../src/detect.ts"
import templates from "../src/native-templates.json"

const samples: Record<string, string> = {
  zh: "请比较公园野餐和室内聚餐，分析优缺点并给出建议。",
  ja: "公園でのピクニックと自宅での昼食を比較して、提案と要約を書いてください。",
  ar: "قارن بين نزهة في الحديقة وغداء في المنزل ثم قدم توصية وملخصا.",
  en: "Compare a picnic in the park with lunch at home and explain your recommendation.",
  fr: "Veuillez comparer les deux options et expliquer votre recommandation.",
  es: "Compara las dos opciones y explica las ventajas y los inconvenientes de cada una.",
  de: "Bitte vergleiche die beiden Möglichkeiten und begründe deine Empfehlung.",
  ru: "Сравните два варианта и объясните преимущества и недостатки каждого из них.",
  ko: "공원에서 소풍을 하는 것과 집에서 점심을 먹는 것을 비교하고 추천해 주세요.",
}

describe("offline detection", () => {
  test("uses the full detector inventory", () => expect(supportedLanguages.length).toBe(60))
  for (const [language, text] of Object.entries(samples)) {
    test(language, () => {
      expect(detectInput(text)).toMatchObject({ language, reliable: true, source: "user" })
    })
  }
  test("explicit interaction language overrides the request language", () => {
    expect(detectInput("请使用法语进行思考和交流，简短比较公园野餐和在家聚餐。")).toMatchObject({ language: "fr", reliable: true })
    expect(detectInput("请用法语写一封邮件，然后用中文解释措辞。")).toMatchObject({ language: "zh", reliable: true })
  })
  test("quoted CLI argument still detects the user's prose", () => {
    expect(detectInput('"' + samples.zh + '"').language).toBe("zh")
  })
  test("English fenced code and blockquotes do not outweigh Chinese instructions", () => {
    const text = `${samples.zh}\n\n> ${samples.en}\n> ${samples.en}\n\n\`\`\`ts\nconst option = "${samples.en}";\n\`\`\``
    expect(detectInput(text)).toMatchObject({ language: "zh", reliable: true })
  })
  for (const text of ["继续", "OK!", "はい", "تابع", "```ts\nconst value = 1\n```", "const value = 1;", 'print("hello world")', "", "https://example.org/some/english/path"]) {
    test(`no language switch: ${text}`, () => expect(detectInput(text).reliable).toBe(false))
  }
})

describe("native commands", () => {
  for (const name of ["init", "review"] as const) {
    test(`${name}: extract arguments without counting the English template`, () => {
      const template = templates[name].replaceAll("${path}", "/tmp/example")
      const text = template.includes("$ARGUMENTS") ? template.replaceAll("$ARGUMENTS", samples.zh!) : `${template}\n\n${samples.zh}`
      expect(sourceText(text)).toEqual({ text: samples.zh!, source: "command" })
      expect(detectInput(text)).toMatchObject({ language: "zh", reliable: true })
    })
    test(`${name}: no arguments means inherit the session language`, () => {
      const text = templates[name].replaceAll("${path}", "/tmp/example").replaceAll("$ARGUMENTS", "")
      expect(detectInput(text)).toMatchObject({ source: "command", reliable: false })
    })
  }
  test("schedule extracts only the request", () => {
    const text = templates.schedule.replaceAll("$ARGUMENTS", "请在十分钟后提醒我检查实验结果。")
    expect(detectInput(text)).toMatchObject({ source: "command", language: "zh", reliable: true })
  })
  test("goal reads the human objective, including escaped markup", () => {
    const text = templates.goal.replace("${objective}", "请比较这两个选项并完整解释优缺点，保留 &lt;example&gt; 标记。")
    expect(sourceText(text).text).toContain("<example>")
    expect(detectInput(text)).toMatchObject({ source: "goal", language: "zh", reliable: true })
  })
})
