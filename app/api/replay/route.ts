import { NextResponse } from "next/server";

import { REPLAY_PROMPT, CORPUS_PICK_PROMPT, fillPrompt } from "@/lib/prompts";
import { chatCompletion } from "@/lib/siliconflow";
import { parseAIJson, runWithRetry } from "@/lib/json-parse";
import { THEORY_LIBRARY } from "@/lib/theory-library";
import type {
  EndJudgment,
  Message,
  ReplaySummary,
  SceneCard,
  SceneType,
} from "@/lib/types";

// 把某个场景的理论库序列化为供 Prompt 使用的文本
function serializeTheory(sceneType: SceneType): string {
  const items = THEORY_LIBRARY[sceneType] ?? [];
  if (!items.length) return "（无可用理论）";
  return items
    .map(
      (t) => `- ${t.name}（${t.source}）：${t.explanation}。适用：${t.applicable_when}`
    )
    .join("\n");
}

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

// 归一化/校验 ReplaySummary
function normalizeReplay(raw: Record<string, unknown>): ReplaySummary {
  const anchor = (raw.theory_anchor ?? {}) as Record<string, unknown>;
  const comparison = Array.isArray(raw.comparison)
    ? (raw.comparison as Record<string, unknown>[]).map((row) => ({
        dimension: String(row.dimension ?? ""),
        user_expression: String(row.user_expression ?? ""),
        theory_view: String(row.theory_view ?? ""),
      }))
    : [];

  return {
    quick_note: String(raw.quick_note ?? "") || "本轮回放已保存。",
    theory_anchor: {
      name: String(anchor.name ?? "") || "",
      source: String(anchor.source ?? "") || "",
      explanation: String(anchor.explanation ?? "") || "",
    },
    comparison,
    next_task: String(raw.next_task ?? "") || "",
  };
}

/** 服务端兜底：early_exit 时确保在 quick_note 后追加提前结束提示（若模型没加） */
function appendEarlyExitHint(summary: ReplaySummary, earlyExit: boolean, turnCount: number): ReplaySummary {
  if (!earlyExit) return summary;
  const hintSnippet = "下次可以试试再接一轮";
  if (summary.quick_note.includes(hintSnippet)) {
    return summary;
  }
  return {
    ...summary,
    quick_note: `${summary.quick_note}\n这轮你在第 ${turnCount} 轮就收了。从练习角度，对方刚抛出话题，你还没回应完。下次可以试试再接一轮。`,
  };
}

// POST /api/replay
// 请求体：{ scene_card, history, end_judgment, early_exit }
// 响应：{ success, data: { replay } } 或 { success: false, error }
export async function POST(request: Request) {
  let body: {
    scene_card?: SceneCard;
    history?: Message[];
    end_judgment?: EndJudgment;
    early_exit?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "请求体不是有效的 JSON。请重试。" },
      { status: 400 }
    );
  }

  const sceneCard = body?.scene_card;
  if (!sceneCard) {
    return NextResponse.json(
      { success: false, error: "缺少 scene_card，无法生成复盘。请刷新重试。" },
      { status: 400 }
    );
  }

  const sceneType = sceneCard.scene_type as SceneType;
  const history = Array.isArray(body?.history) ? body.history : [];
  const endJudgment = body?.end_judgment;
  const earlyExit = Boolean(body?.early_exit);
  const turnCount = history.filter((m) => m.role === "user").length || 1;

  const prompt = fillPrompt(REPLAY_PROMPT, {
    scene_type: sceneType,
    training_goal: sceneCard.training_goal,
    history: serializeHistory(history),
    end_judgment: JSON.stringify(endJudgment ?? {}),
    turn_count: String(turnCount),
    early_exit: earlyExit ? "true" : "false",
    theory_library: serializeTheory(sceneType),
  });

  try {
    // 复盘生成：temperature=0.7（文档要求）；JSON 解析失败自动重试一次
    const parsed = await runWithRetry<Record<string, unknown>>(
      () => chatCompletion({ user: prompt, temperature: 0.7, maxTokens: 900 }),
      (text) => parseAIJson<Record<string, unknown>>(text, "复盘小结")
    );
    let summary = normalizeReplay(parsed);
    summary = appendEarlyExitHint(summary, earlyExit, turnCount);

    // 语料挑选：挑 1 条有参考价值的用户原话；失败或无可收藏则返回 null
    let suggestedCorpus: string | null = null;
    const userTurns = history.filter((m) => m.role === "user");
    if (userTurns.length > 0) {
      try {
        const pickText = await chatCompletion({
          user: fillPrompt(CORPUS_PICK_PROMPT, {
            scene_type: sceneType,
            history: serializeHistory(history),
          }),
          temperature: 0.3,
          maxTokens: 200,
        });
        const trimmed = pickText.trim();
        if (trimmed && trimmed.toLowerCase() !== "null") {
          suggestedCorpus = trimmed;
        }
      } catch {
        // 挑选失败不影响复盘主流程
      }
    }

    return NextResponse.json({
      success: true,
      data: { replay: summary, suggested_corpus: suggestedCorpus },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message });
  }
}

// 兼容旧客户端：友好提示
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET() {
  return NextResponse.json(
    { success: false, error: "请使用 POST 请求生成复盘。" },
    { status: 405 }
  );
}
