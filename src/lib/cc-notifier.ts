/**
 * CC（いずみ）への通知
 * サマリー保存完了の BurntToast 通知 + pyautogui によるCC注入（オプション）
 */

import { invoke } from '@tauri-apps/api/core'

/** サマリー保存完了を BurntToast で通知 */
export async function notifyCompletion(): Promise<void> {
  await invoke('notify_summary_saved')
}

/** pyautogui スクリプトでサマリーを CC に注入 */
export async function injectToCC(summary: string): Promise<void> {
  await invoke('inject_to_cc', { summary })
}
