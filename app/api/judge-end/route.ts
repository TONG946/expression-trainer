import { NextResponse } from "next/server";

import { JUDGE_END_PROMPT, fillPrompt } from "@/lib/prompts";
import { chatCompletion } from "@/lib/siliconflow";
import { parseAIJson, runWithRetry } from "@/lib/json-parse";
import type { EndJudgment, Message, SceneType } from "@/lib/types";

function serializeHistory(history: Message[]): string {
  if (!history.length) return "（无对话）";
  return history
    .map((m) => {
      const who =
        m.role === "user" ? "用户" : m.role === "ai" ? "对方" : "系统";
      return `${who}：${m.content}`;
    })
    .join("\n");
}

// 将 AI 返回的 EndJudgment 字段做基本归一化/校验
function normalizeEndJudgment(raw: Record<string, unknown>): EndJudgment {
  const endType = String(raw.end_type ?? "none");
  const validType =
    endType === "natural" || endType === "force" || endType === "early_exit"
      ? endType
      : "none";
  return {
    turn_count: Number(raw.turn_count ?? 0),
    natural_end: Boolean(raw.natural_end),
    end_type: validType as EndJudgment["end_type"],
    confidence: Number(raw.confidence ?? 0),
    emotion_temperature: Number(raw.emotion_temperature ?? 0),
    problem_progress: Number(raw.problem_progress ?? 0),
    strategy_coverage: Array.isArray(raw.strategy_coverage)
      ? raw.strategy_coverage.map(String)
      : [],
    avoidance_detected: Boolean(raw.avoidance_detected),
    reason: String(raw.reason ?? ""),
    coach_hint: String(raw.coach_hint ?? ""),
  };
}

// POST /api/judge-end
// 请求体：{ scene_type, turn_count, min_turns, max_turns, training_goal, history, user_last, ai_last }
// 响应：{ success, data: { end_judgment } } 或 { success: false, error }
export async function POST(request: Request) {
  let body: {
    scene_type?: SceneType;
    turn_count?: number;
    min_turns?: number;
    max_turns?: number;
    training_goal?: string;
    history?: Message[];
    user_last?: string;
    ai_last?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "请求体不是有效的 JSON。请重试。" },
      { status: 400 }
    );
  }

  const sceneType = (body?.scene_type ?? "eq") as SceneType;
  const history = Array.isArray(body?.history) ? body.history : [];
  const turnCount = Number(body?.turn_count ?? 0);
  const minTurns = Number(body?.min_turns ?? 0);
  const maxTurns = Number(body?.max_turns ?? 0);

  const prompt = fillPrompt(JUDGE_END_PROMPT, {
    scene_type: sceneType,
    turn_count: String(turnCount),
    min_turns: String(minTurns),
    max_turns: String(maxTurns),
    training_goal: String(body?.training_goal ?? ""),
    history: serializeHistory(history),
    user_last: String(body?.user_last ?? ""),
    ai_last: String(body?.ai_last ?? ""),
  });

  try {
    // 结束点判断要求稳定，temperature=0.3（文档要求）；JSON 解析失败自动重试一次
    const parsed = await runWithRetry<Record<string, unknown>>(
      () => chatCompletion({ user: prompt, temperature: 0.3, maxTokens: 800 }),
      (text) => parseAIJson<Record<string, unknown>>(text, "结束点判断")
    );
    let endJudgment = normalizeEndJudgment(parsed);

    // ---- 服务端硬保险：不依赖模型，按轮次下限/上限做确定性裁决 ----
    // 1) 未达最小轮次：一律判为未结束，杜绝过早自然结束。
    if (turnCount < minTurns) {
      endJudgment = {
        ...endJudgment,
        turn_count: turnCount,
        natural_end: false,
        end_type: "none",
        reason: "未达到最小轮次，对话继续。",
      };
    } else if (maxTurns > 0 && turnCount >= maxTurns) {
      // 2) 达到最大轮次：强制结束。
      endJudgment = {
        ...endJudgment,
        turn_count: turnCount,
        natural_end: true,
        end_type: "force",
      };
    }

    return NextResponse.json({ success: true, data: { end_judgment: endJudgment } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message });
  }
}

// 兼容旧客户端：友好提示
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET() {
  return NextResponse.json(
    { success: false, error: "请使用 POST 请求进行结束点判断。" },
    { status: 405 }
  );
}
