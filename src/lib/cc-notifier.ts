/**
 * CC（いずみ）への通知
 * サマリー保存完了の BurntToast 通知 + pyautogui によるCC注入（オプション）
 */

import { invoke } from '@tauri-apps/api/core'

/** サマリー保存完了を BurntToast で通知 */
export async function notifyCompletion(): Promise<void> {
  await invoke('notify_summary_saved')
}

/** pyautogui スクリプトでサマリーを CC に注入
 *
 * サマリー本体は writeSummary で事前にファイルへ書き出され、Rust 側は
 * そのパスだけを Python に渡す。ここで文字列を受け渡さないことで、
 * コマンドラインへの混入経路をなくしている。 */
export async function injectToCC(): Promise<void> {
  await invoke('inject_to_cc')
}
