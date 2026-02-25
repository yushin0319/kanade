# Kanade（奏）

Gemini Live API を使ったリアルタイム音声チャット Tauri v2 デスクトップアプリ。

## 技術スタック

- **Frontend**: React 19 + TypeScript (strict) + Vite 7
- **Backend**: Rust + Tauri v2
- **AI**: Gemini Live API (Native Audio)
- **状態管理**: Zustand
- **テスト**: Vitest + @testing-library/react

## 開発

```bash
# 依存インストール
npm install

# フロントエンドビルド
npm run build

# Tauri dev（vcvars64.bat で MSVC 環境を設定後に実行）
npx tauri dev

# テスト
npm test

# リント
npm run lint
```

### 前提条件

- Node.js 20+
- Rust 1.77+
- VS2022 "Desktop development with C++" ワークロード（Windows SDK 含む）

## ライセンス

音声処理の一部は [live-api-web-console](https://github.com/google-gemini/live-api-web-console)（Apache 2.0）を参考にしています。
