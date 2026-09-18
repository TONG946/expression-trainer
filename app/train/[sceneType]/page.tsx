"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { chat, generateScene, judgeEnd } from "@/lib/api-client";
import { getRecentScenes, saveSession } from "@/lib/storage";
import type {
  EndJudgment,
  Message,
  ReplaySummary,
  SceneCard,
  SceneType,
  TrainingSession,
} from "@/lib/types";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import ErrorRetry from "@/components/ErrorRetry";
import ChatBubble from "@/components/ChatBubble";
import ChatInput from "@/components/ChatInput";
import EndPrompt from "@/components/EndPrompt";

const SCENE_META: Record<string, { label: string; type?: SceneType }> = {
  humor: { label: "幽默感", type: "humor" },
  structured: { label: "结构化表达", type: "structured" },
  eq: { label: "高情商回复", type: "eq" },
};

// 自然结束时的默认提示（按场景区分，避免结构化场景出现“情绪缓和”的错误语义）
const NATURAL_END_HINT: Record<SceneType, string> = {
  humor: "这段可以收了：对方已经接住话头，气氛也聊开了。",
  structured: "这段可以收了：结论已经讲清楚，对方的追问也有了着落。",
  eq: "这段可以收了：对方情绪已经缓和，问题也有了推进。",
};

// 本地消息（多一个 id 便于删除/定位系统提示）
interface ChatMsg {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
}

const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const DEFAULT_END_JUDGMENT: EndJudgment = {
  turn_count: 0,
  natural_end: false,
  end_type: "early_exit",
  confidence: 0,
  emotion_temperature: 0,
  problem_progress: 0,
  strategy_coverage: [],
  avoidance_detected: false,
  reason: "用户主动提前结束",
  coach_hint: "",
};

const EMPTY_REPLAY: ReplaySummary = {
  quick_note: "",
  theory_anchor: { name: "", source: "", explanation: "" },
  comparison: [],
  next_task: "",
};

type LoadState = "loading" | "ready" | "error" | "unsupported";

export default function TrainPage() {
  const params = useParams<{ sceneType: string }>();
  const router = useRouter();
  const sceneType = String(params?.sceneType ?? "");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sceneCard, setSceneCard] = useState<SceneCard | null>(null);
  // v2.0：场景卡预览状态。true 时展示「场景卡预览页」，false 才进入对话界面。
  const [isPreview, setIsPreview] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  // 已结束标记：natural（自然）/ force（强制）/ null（未结束）
  const [ended, setEnded] = useState<EndJudgment | null>(null);
  const [sendError, setSendError] = useState("");
  // 自然结束提示文案（按场景区分，优先用 judge 的 coach_hint）
  const [endHint, setEndHint] = useState("");
  // 移动端键盘弹出时给底部输入区让出空间（兜底 100dvh 之外的保护）
  const [kbdInset, setKbdInset] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);

  const meta = SCENE_META[sceneType];
  const supportedType: SceneType | undefined = meta?.type;

  // 对话流滚动到底部（含键盘弹出场景）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, aiTyping]);

  // 移动端键盘弹出：用 visualViewport 让底部输入框不被遮挡
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      if (!vv) return;
      // 键盘弹出时 vv.height 变小，底部被遮挡的高度 = innerHeight - vv.height
      const bottomGap = Math.max(0, (window.innerHeight || 0) - (vv.height || 0));
      setKbdInset(bottomGap);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // 加载并生成场景
  const loadScene = useCallback(async () => {
    if (!supportedType) {
      const alias: Record<string, string> = {
        structure: "structured",
        "emotional-intelligence": "eq",
      };
      const target = alias[sceneType];
      if (target) {
        router.replace(`/train/${target}`);
        return;
      }
      setLoadState("unsupported");
      return;
    }
    setLoadState("loading");
    setSceneCard(null);
    setIsPreview(false);
    setMessages([]);
    setEnded(null);
    setEndHint("");
    const recentScenes = getRecentScenes(3);
    const res = await generateScene(supportedType, recentScenes);
    if (res.success) {
      const card = res.data.scene_card;
      setSceneCard(card);
      // v2.0：先生成场景卡，进入「预览态」，等用户点“开始对话”再注入对方首句。
      setMessages([]);
      setIsPreview(true);
      setLoadState("ready");
    } else {
      setLoadState("error");
    }
  }, [supportedType, sceneType, router]);

  useEffect(() => {
    loadScene();
  }, [loadScene]);

  // 组装最近 max 轮的对话，转成 Message[] 发给 route
  const toRouteMessages = (
    list: ChatMsg[],
    maxRounds: number
  ): Message[] => {
    const cut = list.slice(-maxRounds);
    return cut.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
  };

  // 保存会话并跳转复盘
  const finishSession = (judgment: EndJudgment, isEarlyExit: boolean) => {
    if (!sceneCard) return;
    const session: TrainingSession = {
      id: uid(),
      scene_type: sceneCard.scene_type,
      scene_card: sceneCard,
      messages: toRouteMessages(messages, 30),
      end_judgment: judgment,
      replay: EMPTY_REPLAY,
      created_at: Date.now(),
      early_exit: isEarlyExit,
    };
    saveSession(session);
    router.push(`/replay/${session.id}`);
  };

  // 发送一轮：user → chat → judge-end
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !sceneCard || aiTyping || ended) return;
    setInput("");
    setSendError("");
    setAiTyping(true);

    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    const chatHistory = toRouteMessages(withUser, 20); // 最多最近 20 条对话
    const chatRes = await chat(sceneCard, chatHistory);
    if (!chatRes.success) {
      setSendError(chatRes.error || "网络出问题了");
      setAiTyping(false);
      return;
    }

    const aiMsg: ChatMsg = {
      id: uid(),
      role: "ai",
      content: chatRes.data.reply,
      timestamp: Date.now(),
    };
    const withAI = [...withUser, aiMsg];
    setMessages(withAI);

    const lastUser = [...withAI].reverse().find((m) => m.role === "user");
    const lastAI = [...withAI].reverse().find((m) => m.role === "ai");

    // 用「含本条用户消息」的列表统计真实轮数（避免闭包旧值）
    const actualTurns = withAI.filter((m) => m.role === "user").length;
    const judgeRes = await judgeEnd({
      scene_type: sceneCard.scene_type,
      turn_count: actualTurns,
      min_turns: sceneCard.min_turns,
      max_turns: sceneCard.max_turns,
      training_goal: sceneCard.training_goal,
      history: toRouteMessages(withAI, 20),
      user_last: lastUser?.content ?? "",
      ai_last: lastAI?.content ?? "",
    });
    setAiTyping(false);

    if (!judgeRes.success) {
      // 判断失败不阻断对话，仅不进入结束流程
      return;
    }
    const judgment = judgeRes.data.end_judgment;

    if (judgment.end_type === "force") {
      // 强制结束：插入提示并直接跳转复盘
      setEnded(judgment);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          content: "本轮已达最大轮数，进入复盘。",
          timestamp: Date.now(),
        },
      ]);
      // 稍作停留让用户看到提示，再跳转
      setTimeout(() => finishSession(judgment, false), 400);
      return;
    }

    if (judgment.end_type === "natural" && judgment.natural_end) {
      // 自然结束：按场景给提示（优先采用 judge 的 coach_hint）
      const hint =
        judgment.coach_hint?.trim() ||
        NATURAL_END_HINT[sceneCard.scene_type] ||
        "这段可以收了。";
      setEndHint(hint);
      setEnded(judgment);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          content: hint,
          timestamp: Date.now(),
        },
      ]);
      return;
    }
    // end_type === "none"：继续对话
  };

  // 提前结束：确认弹窗 → 跳转复盘，标记 early_exit
  const handleEarlyExit = () => {
    if (!sceneCard) return;
    const ok = window.confirm("确定要提前结束本轮训练吗？");
    if (!ok) return;
    finishSession(DEFAULT_END_JUDGMENT, true);
  };

  // 继续练一轮：清除系统提示与结束标记
  const handleContinue = () => {
    setEnded(null);
    setEndHint("");
    setMessages((prev) => prev.filter((m) => m.role !== "system"));
  };

  // v2.0：用户阅读完场景卡后，点“开始对话”，才注入对方的第一句话
  const startConversation = () => {
    if (!sceneCard) return;
    setIsPreview(false);
    setMessages([
      {
        id: uid(),
        role: "ai",
        content: sceneCard.opening_line,
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <main className="flex h-dvh justify-center overflow-hidden bg-gray-50">
      <div className="flex h-full w-full max-w-[720px] flex-col border-x border-gray-200 bg-white">
      {/* 顶部：场景信息（可折叠）+ 提前结束按钮 */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer text-sm font-bold">
            {meta?.label ?? "训练"} · 场景
          </summary>
          <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            {sceneCard && (
              <>
                <p>{sceneCard.scene_description}</p>
                <p className="mt-1 font-medium text-indigo-700">
                  目标：{sceneCard.training_goal}
                </p>
              </>
            )}
          </div>
        </details>
        <button
          onClick={handleEarlyExit}
          disabled={loadState !== "ready" || isPreview || !!ended}
          className="ml-3 shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40"
        >
          提前结束
        </button>
      </header>

      {/* 中间：对话历史 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loadState === "loading" && <LoadingSkeleton label="正在生成场景…" />}
        {loadState === "unsupported" && (
          <div className="text-sm text-gray-500">不支持的场景类型。</div>
        )}
        {loadState === "error" && (
          <ErrorRetry
            error="生成出错了，换一个场景试试。"
            onRetry={() => loadScene()}
          />
        )}

        {loadState === "ready" && isPreview && sceneCard && (
          <div className="flex h-full flex-col items-center justify-center gap-4 pt-4">
            <div className="w-full max-w-sm rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
              <p className="text-center text-xs font-semibold tracking-wide text-indigo-500">
                场景卡 · 请先阅读
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">情境</p>
                  <p className="mt-0.5 text-gray-800">
                    {sceneCard.scene_description}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">你们的关系</p>
                  <p className="mt-0.5 text-gray-800">
                    {sceneCard.persona.relationship || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">你的目标</p>
                  <p className="mt-0.5 font-medium text-indigo-700">
                    {sceneCard.training_goal}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">对方是谁</p>
                  <p className="mt-0.5 text-gray-800">
                    {sceneCard.persona.name}
                    {(sceneCard.persona.personality_traits?.length ?? 0) > 0 && (
                      <>
                        {sceneCard.persona.personality_traits
                          .slice(0, 3)
                          .map((t, i) => (
                            <span
                              key={i}
                              className="mx-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                            >
                              {t}
                            </span>
                          ))}
                      </>
                    )}
                  </p>
                  {(sceneCard.persona.current_state ||
                    sceneCard.persona.mood_baseline) && (
                    <p className="mt-1 text-xs text-gray-500">
                      对方状态：{sceneCard.persona.current_state || sceneCard.persona.mood_baseline}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={startConversation}
                className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white active:opacity-90"
              >
                我准备好了，开始对话
              </button>
            </div>
            <p className="text-center text-xs text-gray-400">
              阅读完情境与目标后再开始，训练效果更好
            </p>
          </div>
        )}

        {loadState === "ready" &&
          !isPreview &&
          messages.map((m) =>
            m.role === "system" ? (
              <div key={m.id} className="rounded-xl bg-gray-100 p-3 text-center text-xs text-gray-500">
                {m.content}
              </div>
            ) : (
              <ChatBubble
                key={m.id}
                role={m.role}
                content={m.content}
                name={m.role === "ai" ? sceneCard?.persona.name : undefined}
              />
            )
          )}

        {aiTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-400">
              对方正在输入…
            </div>
          </div>
        )}

        {sendError && (
          <div className="rounded-xl bg-red-50 p-3 text-center text-xs text-red-600">
            网络出问题了，{" "}
            <button onClick={() => sendMessage()} className="font-medium underline">
              [重试]
            </button>
          </div>
        )}

        {ended?.end_type === "natural" && (
          <EndPrompt
            message={endHint || "这段可以收了。"}
            onContinue={handleContinue}
            onReview={() => finishSession(ended, false)}
          />
        )}
      </div>

      {/* 底部：输入框（kbdInset 让键盘弹出时不遮挡；pb-safe 避开系统导航栏） */}
      {/* 预览态下不显示输入框，点“开始对话”后才出现 */}
      {!isPreview && (
        <div
          style={{ paddingBottom: kbdInset > 0 ? kbdInset : undefined }}
          className="border-t border-gray-200 pb-safe"
        >
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={sendMessage}
            disabled={loadState !== "ready" || aiTyping || !!ended}
            placeholder="输入你的回应…"
          />
        </div>
      )}
      </div>
    </main>
  );
}
