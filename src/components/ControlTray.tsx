import type { ConnectionState, ErrorKind } from "../types";
import { VoiceIndicator } from "./VoiceIndicator";

interface ControlTrayProps {
  state: ConnectionState;
  error: ErrorKind | null;
  volume: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMute: () => void;
}

const STATE_LABELS: Record<ConnectionState, string> = {
  idle: "待機中",
  connecting: "接続中...",
  connected: "通話中",
  muted: "ミュート中",
  error: "エラー",
};

const STATE_COLORS: Record<ConnectionState, string> = {
  idle: "#888",
  connecting: "#ff0",
  connected: "#0f0",
  muted: "#f90",
  error: "#f00",
};

const ERROR_MESSAGES: Record<ErrorKind, string> = {
  connection_failed: "接続に失敗しました。API Key を確認してください。",
  api_limit: "API の利用制限に達しました。",
  mic_error: "マイクへのアクセスに失敗しました。",
  unknown: "不明なエラーが発生しました。",
};

export function ControlTray({
  state,
  error,
  volume,
  onConnect,
  onDisconnect,
  onToggleMute,
}: ControlTrayProps) {
  const isConnected = state === "connected" || state === "muted";

  return (
    <div style={{ padding: "1rem", borderTop: "1px solid #333" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {/* 状態インジケータ */}
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: STATE_COLORS[state],
          }}
        />
        <span style={{ fontWeight: "bold" }}>{STATE_LABELS[state]}</span>

        {/* 音量インジケータ（接続中のみ） */}
        {isConnected && (
          <VoiceIndicator volume={volume} muted={state === "muted"} />
        )}

        {/* ミュートボタン */}
        {isConnected && (
          <button
            onClick={onToggleMute}
            style={buttonStyle(state === "muted" ? "#f90" : "#666")}
          >
            {state === "muted" ? "ミュート解除" : "ミュート"}
          </button>
        )}

        {/* 接続/切断ボタン */}
        {isConnected ? (
          <button onClick={onDisconnect} style={buttonStyle("#f44")}>
            切断
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={state === "connecting"}
            style={buttonStyle(state === "connecting" ? "#666" : "#4caf50")}
          >
            接続
          </button>
        )}
      </div>

      {state === "error" && error && (
        <p style={{ color: "#f88", marginTop: "0.5rem", fontSize: "0.9rem" }}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}

function buttonStyle(bg: string): React.CSSProperties {
  return {
    padding: "0.5rem 1.5rem",
    fontSize: "0.9rem",
    backgroundColor: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  };
}
