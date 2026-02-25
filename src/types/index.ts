/** 接続状態の5段階定義 */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "muted"
  | "error";

/** エラー種別 */
export type ErrorKind =
  | "connection_failed"
  | "api_limit"
  | "mic_error"
  | "unknown";

/** 会話ログの1エントリ */
export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

/** ブリーフィングデータ（CC から注入） */
export interface BriefingData {
  tasks: string[];
  emails: string[];
  news: string[];
  custom?: string;
}
