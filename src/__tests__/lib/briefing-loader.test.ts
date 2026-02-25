import { describe, it, expect } from "vitest";
import {
  parseBriefing,
  buildSystemInstruction,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
} from "../../lib/briefing-loader";

describe("briefing-loader", () => {
  describe("parseBriefing", () => {
    it("有効な briefing.json をパースする", () => {
      const input = {
        tasks: ["タスク1", "タスク2"],
        emails: ["メール1"],
        news: ["ニュース1"],
      };
      const result = parseBriefing(input);
      expect(result).toEqual(input);
    });

    it("custom フィールドを含む場合もパースする", () => {
      const input = {
        tasks: [],
        emails: [],
        news: [],
        custom: "カスタム指示",
      };
      const result = parseBriefing(input);
      expect(result.custom).toBe("カスタム指示");
    });

    it("tasks が欠けていると null を返す", () => {
      const input = { emails: [], news: [] };
      const result = parseBriefing(input);
      expect(result).toBeNull();
    });

    it("tasks が文字列配列でないと null を返す", () => {
      const input = { tasks: [123], emails: [], news: [] };
      const result = parseBriefing(input);
      expect(result).toBeNull();
    });

    it("空の入力は null を返す", () => {
      const result = parseBriefing(null);
      expect(result).toBeNull();
    });

    it("文字列の入力は null を返す", () => {
      const result = parseBriefing("invalid");
      expect(result).toBeNull();
    });
  });

  describe("buildSystemInstruction", () => {
    it("ブリーフィングデータから System Instruction を生成する", () => {
      const result = buildSystemInstruction(
        {
          tasks: ["レビュー対応", "デプロイ"],
          emails: ["重要: 会議変更"],
          news: ["TypeScript 6.0 リリース"],
        },
        "あなたは親切なアシスタントです。",
      );
      expect(result).toContain("レビュー対応");
      expect(result).toContain("デプロイ");
      expect(result).toContain("重要: 会議変更");
      expect(result).toContain("TypeScript 6.0 リリース");
      expect(result).toContain("あなたは親切なアシスタントです。");
    });

    it("system-prompt なしでも動作する", () => {
      const result = buildSystemInstruction({
        tasks: ["タスク1"],
        emails: [],
        news: [],
      });
      expect(result).toContain("タスク1");
    });

    it("custom フィールドが含まれる", () => {
      const result = buildSystemInstruction({
        tasks: [],
        emails: [],
        news: [],
        custom: "特別な指示",
      });
      expect(result).toContain("特別な指示");
    });

    it("空のブリーフィングでも空文字列を返す", () => {
      const result = buildSystemInstruction({
        tasks: [],
        emails: [],
        news: [],
      });
      expect(typeof result).toBe("string");
      expect(result).toBe("");
    });

    it("最大長を超える場合は切り詰められる", () => {
      const longText = "あ".repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 1000);
      const result = buildSystemInstruction({
        tasks: [longText],
        emails: [],
        news: [],
      });
      expect(result.length).toBeLessThanOrEqual(MAX_SYSTEM_INSTRUCTION_LENGTH);
    });
  });
});
