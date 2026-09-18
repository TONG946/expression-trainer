import { NextResponse } from "next/server";

import { CHAT_PROMPT, SCENE_CONSTRAINTS, fillPrompt } from "@/lib/prompts";
import { chatCompletion } from "@/lib/siliconflow";
import type { Message, SceneCard, SceneType } from "@/lib/types";

// 对话历史序列化为供 CHAT_PROMPT 使用的文本列表
function serializeHistory(history: Message[]): string {
  if (!history.length) return "（对话刚开始，对方还没开口）";
  return history
    .map((m) => {
      const who =
        m.role === "user" ? "用户" : m.role === "ai" ? "对方" : "系统";
      return `${who}：${m.content}`;
    })
    .join("\n");
}

// POST /api/chat
// 请求体：{ scene_card: SceneCard, history: Message[] }
// 响应：{ success: true, data: { reply } } 或 { success: false, error }
export async function POST(request: Request) {
  let body: { scene_card?: SceneCard; history?: Message[] };
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
      { success: false, error: "缺少 scene_card，无法开始对话。请刷新重试。" },
      { status: 400 }
    );
  }

  const sceneType = sceneCard.scene_type as SceneType;
  const constraints = SCENE_CONSTRAINTS[sceneType] ?? SCENE_CONSTRAINTS.eq;
  const history = Array.isArray(body?.history) ? body.history : [];

  const prompt = fillPrompt(CHAT_PROMPT, {
    persona_json: JSON.stringify(sceneCard.persona),
    scene_description: sceneCard.scene_description,
    training_goal: sceneCard.training_goal,
    history: serializeHistory(history),
    scene_specific_constraints: constraints,
  });

  try {
    // 对话角色扮演：需要自然真实，temperature=0.8（文档要求）
    const reply = await chatCompletion({
      user: prompt,
      temperature: 0.8,
      maxTokens: 300, // 回应控制在 1-3 句话
    });
    return NextResponse.json({ success: true, data: { reply } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message });
  }
}

// 兼容旧客户端：友好提示
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET() {
  return NextResponse.json(
    { success: false, error: "请使用 POST 请求进行对话。" },
    { status: 405 }
  );
}
