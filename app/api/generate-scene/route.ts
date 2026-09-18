import { NextResponse } from "next/server";

import { fillPrompt, SCENE_GENERATOR_PROMPT, MIN_TURNS, MAX_TURNS } from "@/lib/prompts";
import { chatCompletion } from "@/lib/siliconflow";
import { runWithRetry } from "@/lib/json-parse";
import type { SceneCard, SceneType } from "@/lib/types";

// 常见的三场景标识 → SceneType 归一化
const SCENE_TYPE_ALIASES: Record<string, SceneType> = {
  humor: "humor",
  humoristic: "humor",
  "幽默": "humor",
  structured: "structured",
  structure: "structured",
  "结构化": "structured",
  eq: "eq",
  "高情商": "eq",
  emotional: "eq",
  emotional_intelligence: "eq",
};

/** 剥离模型输出中可能包裹的 ```json ... ``` 代码围栏 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/** 容错地解析模型返回的 SceneCard JSON，并对场景类型归一化 */
function parseSceneCard(text: string, fallbackType: SceneType): SceneCard {
  const cleaned = stripCodeFence(text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      "AI 返回的场景数据无法解析，请重试。若反复出现，可能是服务不稳定。"
    );
  }

  const persona = (parsed.persona ?? {}) as Record<string, unknown>;
  const sceneType = (parsed.scene_type as string) ?? fallbackType;
  const normalizedType: SceneType =
    SCENE_TYPE_ALIASES[String(sceneType).toLowerCase()] ?? fallbackType;

  return {
    scene_type: normalizedType,
    scene_description:
      String(parsed.scene_description ?? "") || "（AI 未返回场景描述）",
    training_goal:
      String(parsed.training_goal ?? "") || "（AI 未返回训练目标）",
    opening_line: String(parsed.opening_line ?? "") || "（AI 未返回对方首句）",
    persona: {
      name: String(persona.name ?? "") || "对方",
      relationship: String(persona.relationship ?? "") || "对话对象",
      mood_baseline: String(persona.mood_baseline ?? "") || "平静",
      personality_traits: Array.isArray(persona.personality_traits)
        ? persona.personality_traits.map(String)
        : [],
      current_state: String(persona.current_state ?? "") || "",
    },
    theory_tags: Array.isArray(parsed.theory_tags)
      ? parsed.theory_tags.map(String)
      : [],
    // 强制使用常量轮次，避免模型随意生成
    min_turns: MIN_TURNS[normalizedType],
    max_turns: MAX_TURNS[normalizedType],
  };
}

// POST /api/generate-scene
// 请求体：{ scene_type, recent_scenes }
// 响应：{ success, data: { scene_card } } 或 { success: false, error }
export async function POST(request: Request) {
  let body: { scene_type?: string; recent_scenes?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "请求体不是有效的 JSON。请重试。" },
      { status: 400 }
    );
  }

  const rawType = (body?.scene_type ?? "").toLowerCase();
  const sceneType: SceneType | undefined =
    SCENE_TYPE_ALIASES[rawType];
  if (!sceneType) {
    return NextResponse.json(
      { success: false, error: `不支持的场景类型：${body?.scene_type ?? "(空)"}` },
      { status: 400 }
    );
  }

  const recentScenes = Array.isArray(body?.recent_scenes)
    ? body.recent_scenes.map(String)
    : [];

  const prompt = fillPrompt(SCENE_GENERATOR_PROMPT, {
    scene_type: sceneType,
    recent_scenes: recentScenes.length
      ? recentScenes.join("、")
      : "（无）",
  });

  try {
    // 场景生成要求更多多样性；JSON 解析失败自动重试一次
    const sceneCard = await runWithRetry(
      () => chatCompletion({ user: prompt, temperature: 1.0, maxTokens: 1200 }),
      (text) => parseSceneCard(text, sceneType)
    );
    return NextResponse.json({ success: true, data: { scene_card: sceneCard } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message });
  }
}

// 兼容旧客户端：保留一个友好的 GET 提示
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET() {
  return NextResponse.json(
    { success: false, error: "请使用 POST 请求生成场景。" },
    { status: 405 }
  );
}
