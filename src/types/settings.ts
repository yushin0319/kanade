/** アプリ設定（tauri-plugin-store で保存） */
export interface Settings {
  /** Gemini API Key */
  apiKey: string;
  /** 使用モデル */
  model: GeminiModel;
  /** 音声 */
  voice: GeminiVoice;
  /** pyautogui 連携を有効化 */
  pyautoguiEnabled: boolean;
}

export type GeminiModel =
  | "gemini-2.0-flash-exp"
  | "gemini-2.5-flash-preview-05-20";

export type GeminiVoice =
  | "Puck"
  | "Charon"
  | "Kore"
  | "Fenrir"
  | "Aoede";

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "gemini-2.0-flash-exp",
  voice: "Puck",
  pyautoguiEnabled: false,
};
