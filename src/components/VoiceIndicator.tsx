/**
 * 録音中インジケータ
 * マイク音量に応じてアニメーションするドットで録音状態を視覚表示
 */

interface VoiceIndicatorProps {
  volume: number; // 0.0〜1.0
  muted: boolean;
}

export function VoiceIndicator({ volume, muted }: VoiceIndicatorProps) {
  // 音量を 3 段階のバーの高さに変換
  const bars = [0.3, 0.6, 1.0].map((threshold) =>
    muted ? 4 : Math.max(4, volume >= threshold ? volume * 24 : 4),
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "3px",
        height: "24px",
      }}
      title={muted ? "ミュート中" : "録音中"}
    >
      {bars.map((height, i) => (
        <div
          key={i}
          style={{
            width: "4px",
            height: `${height}px`,
            borderRadius: "2px",
            backgroundColor: muted ? "var(--color-muted)" : "var(--color-accent)",
            transition: "height 0.1s ease",
          }}
        />
      ))}
    </div>
  );
}
