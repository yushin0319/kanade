/** アプリ設定（tauri-plugin-store で保存） */
export interface Settings {
  /** Gemini API Key */
  apiKey: string
  /** 使用モデル */
  model: GeminiModel
  /** 音声 */
  voice: GeminiVoice
  /** pyautogui 連携を有効化 */
  pyautoguiEnabled: boolean
}

export type GeminiModel =
  | 'gemini-2.5-flash-native-audio-latest'
  | 'gemini-2.5-flash-native-audio-preview-12-2025'

export type GeminiVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede'

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'gemini-2.5-flash-native-audio-latest',
  voice: 'Puck',
  pyautoguiEnabled: false,
}
