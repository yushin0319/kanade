/**
 * ブリーフィングデータの読み込みと System Instructions 生成
 * CC（いずみ）から注入される briefing.json をバリデーションし、
 * system-prompt.md とマージして Gemini の System Instructions を構築する
 */

import { z } from 'zod'
import type { BriefingData } from '../types'

/** System Instructions の最大文字数 */
export const MAX_SYSTEM_INSTRUCTION_LENGTH = 10000

/** briefing.json のスキーマ */
const briefingSchema = z.object({
  tasks: z.array(z.string()),
  emails: z.array(z.string()),
  news: z.array(z.string()),
  custom: z.string().optional(),
})

/** 任意の値を BriefingData としてパース。失敗時は null */
export function parseBriefing(data: unknown): BriefingData | null {
  const result = briefingSchema.safeParse(data)
  return result.success ? result.data : null
}

/** ブリーフィングデータと system-prompt から System Instructions を生成 */
export function buildSystemInstruction(
  briefing: BriefingData,
  systemPrompt?: string,
): string {
  const sections: string[] = []

  if (systemPrompt) {
    sections.push(systemPrompt)
  }

  if (briefing.tasks.length > 0) {
    sections.push(
      `## 今日のタスク\n${briefing.tasks.map((t) => `- ${t}`).join('\n')}`,
    )
  }

  if (briefing.emails.length > 0) {
    sections.push(
      `## 重要メール\n${briefing.emails.map((e) => `- ${e}`).join('\n')}`,
    )
  }

  if (briefing.news.length > 0) {
    sections.push(
      `## ニュース\n${briefing.news.map((n) => `- ${n}`).join('\n')}`,
    )
  }

  if (briefing.custom) {
    sections.push(`## カスタム指示\n${briefing.custom}`)
  }

  let result = sections.join('\n\n')

  if (result.length > MAX_SYSTEM_INSTRUCTION_LENGTH) {
    result = result.slice(0, MAX_SYSTEM_INSTRUCTION_LENGTH)
  }

  return result
}
