# kanade

Gemini Live API を使ったリアルタイム音声チャット Tauri v2 デスクトップアプリ。「奏」と書いて kanade。Cargo.toml description: "Kanade - Real-time voice chat with Gemini"。

## スタック

- Frontend: React 19 + TypeScript 7 + Vite 8 / Biome（`bunx @biomejs/biome` で実行、devDependencies には無い）/ vitest v5 + @testing-library/react + jsdom
- Desktop: Tauri 2（Cargo.toml は `2.11.2` 指定、Cargo.lock の解決版は 2.12.2。Rust 1.77.2+、WebView2）+ tauri-plugin-store / tauri-plugin-log（デバッグビルドのみ）/ システムトレイ（`tray-icon`）
- AI:
  - 音声対話: Gemini Live API に WebSocket で直接接続（`wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent`）。既定モデル `gemini-2.5-flash-native-audio-latest`
  - 会話サマリー: `@google/genai` ^2.28.0 の `generateContent`（モデル `gemini-2.5-flash`）
- バリデーション: Zod v4（briefing.json のスキーマ）
- 状態管理: React hooks（useState / useRef / useCallback）+ Tauri store（`settings.json`）
- パッケージマネージャ: Bun（`bun.lock` あり）

## 構成

```
src/
  App.tsx                  メイン UI（API キー未設定時の入力画面・会話ログ・テキスト入力・設定）
  hooks/
    use-live-api.ts        Gemini Live API（WebSocket）ラッパー。接続時にブリーフィングを読み込む
    use-settings.ts        設定（モデル・音声・pyautogui 連携）の永続化（plugin-store）
    use-audio-input.ts     マイク入力（WebAudio）
    use-audio-output.ts    Gemini 音声出力再生
    use-transcript.ts      字起こしバッファ管理
  components/
    ControlTray.tsx        接続状態の表示・接続/切断・ミュート切替・音量
    SettingsPanel.tsx      API キー・モデル・音声・pyautogui 注入の設定
    SendToCCButton.tsx     「CCに送信」: 要約 → プレビュー → 確認 → 書き出し + 通知（+ pyautogui 注入）
    VoiceIndicator.tsx     音量インジケータ
  lib/
    audio-*.ts             WebAudio 入出力・録音・ストリーミング・変換
    audioworklet-registry.ts  AudioWorklet の管理
    worklets/              AudioWorklet（音声処理・音量メータ）
    summarizer.ts          会話サマリー生成（@google/genai）
    summary-writer.ts      サマリー / 会話ログの書き出し
    briefing-loader.ts     ブリーフィング読み込み（Zod で検証）+ System Instructions 生成
    cc-notifier.ts         Claude Code への通知（BurntToast）・pyautogui 注入
  types/                   設定・共通型定義
  __tests__/               vitest（components / hooks / lib）
src-tauri/
  Cargo.toml               Rust dependencies（tauri "2.11.2" / webview2-com 0.39 / windows 0.62）
  tauri.conf.json          ウィンドウ・CSP（connect-src は wss://generativelanguage.googleapis.com）・バンドル設定
  src/lib.rs               Tauri commands（has_api_key / get_api_key / set_api_key /
                           read_briefing / read_system_prompt / write_summary /
                           write_conversation / notify_summary_saved / inject_to_cc）
  src/permissions.rs       WebView2 のマイク権限を localhost / tauri オリジンだけ自動許可（Windows）
  src/tray.rs              システムトレイ（表示 / 終了、ダブルクリックで表示）
```

## 機能

- ストリーミング音声対話（WebSocket → Gemini Live API）。接続中はテキストでも送れる
- リアルタイム字起こし（transcript 表示）
- 音量インジケータ・ミュート切替
- 接続時に `~/.claude/voice-chat/briefing.json` と `system-prompt.md` を読んで System Instructions にする（無くても接続は続行）
- 「CCに送信」: 会話を要約してプレビュー → 確認で `~/.claude/voice-chat/summary.md` と `conversation.md` に書き出し、BurntToast で通知。pyautogui 注入を有効にしていれば `~/.claude/scripts/kanade-send-to-cc.py`（このリポの外）で Claude Code に貼り付ける
- 設定: API キー・モデル（latest / preview-12-2025）・音声（Puck / Charon / Kore / Fenrir / Aoede）・pyautogui 注入の有効化
- ウィンドウを閉じても終了せずトレイに残る（終了はトレイの「終了」）

## 開発

前提: Bun、Node.js（`engines`: >=20.19.0 || >=22.12.0。`tauri.conf.json` の `beforeDevCommand` / `beforeBuildCommand` は `npm run dev` / `npm run build`）、Rust 1.77.2+、Windows では VS2022「Desktop development with C++」（詳細は [CLAUDE.md](CLAUDE.md)）

```bash
bun install          # prepare で Husky を有効化（pre-commit で lint-staged → Biome）
bun run dev          # Vite 開発サーバー（:5173）
bun run build        # tsc -b && vite build
bun run lint         # bunx @biomejs/biome check .
bun run test         # vitest run
bun run test:watch   # vitest（watch）
bun run tauri dev    # Tauri デスクトップ起動
```

## CI

- `.github/workflows/ci.yml`: `test`（`bun run test`）/ `lint`（`bunx tsc --noEmit`）/ `rust-check`（Windows で `bun run build` → `cargo check --locked`）
- `pr-review.yml`: Gemini の PR レビュー / `dependabot-automerge.yml`: Dependabot の patch・minor を自動マージ

## ビルド・配布

```bash
bun run tauri build  # 実行中の OS 向けのインストーラを生成（bundle.targets = "all"）
```

## 運用ルール

- Gemini API キーは初回起動時の入力画面（または設定パネル）で入れる。tauri-plugin-store の `settings.json`（キー `apiKey`、平文の JSON）に保存され、Windows では `%APPDATA%\com.yushin.kanade\settings.json`。環境変数やリポ内のファイルからは読まない
- pyautogui 注入は Windows 環境での Claude Code 連携用（オプション機能、既定は無効）
- main 直 commit 禁止、PR 経由でマージ

詳細・Claude Code 連携詳細は [CLAUDE.md](CLAUDE.md) を参照。
