"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { replay } from "@/lib/api-client";
import {
  getCorpus,
  getSessionById,
  saveCorpusItem,
  updateSessionReplay,
} from "@/lib/storage";
import type { CorpusItem, ReplaySummary, TrainingSession } from "@/lib/types";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import ErrorRetry from "@/components/ErrorRetry";
import ChatBubble from "@/components/ChatBubble";
import ReplayCard from "@/components/ReplayCard";

const SCENE_LABEL: Record<string, string> = {
  humor: "幽默感",
  structured: "结构化表达",
  eq: "高情商回复",
};

const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type LoadState = "loading" | "ready" | "error" | "missing" | "ai-error";

export default function ReplayPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = String(params?.sessionId ?? "");

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [showReplay, setShowReplay] = useState(false);
  const [replaySummary, setReplaySummary] = useState<ReplaySummary | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // 防止 StrictMode 双跑时重复写语料
  const savedRef = useRef(false);
  // 防止 StrictMode 双跑时重复发起复盘请求（并发会互相覆盖状态）
  const inflightRef = useRef(false);

  const buildReplay = useCallback(async (s: TrainingSession) => {
    // 已生成过且非空 → 直接使用保存的复盘，保证内容稳定，不再调用 AI 重新生成
    if (s.replay && (s.replay.quick_note || s.replay.theory_anchor?.name)) {
      setReplaySummary(s.replay);
      setState("ready");
      setShowReplay(true);
      return;
    }

    if (inflightRef.current) return;
    inflightRef.current = true;
    setErrorMsg("");
    setState("loading"); // 先进入统一的加载态，绝不提前报错
    try {
      const res = await replay({
        scene_card: s.scene_card,
        history: s.messages,
        end_judgment: s.end_judgment,
        early_exit: s.early_exit,
      });
      if (!res.success) {
        // 真实错误暴露到控制台，方便排查
        console.error("[复盘生成失败]", res.error);
        setErrorMsg(res.error || "复盘生成失败，请稍后重试。");
        setState("ai-error");
        return;
      }
      setReplaySummary(res.data.replay);
      setState("ready");
      setShowReplay(true);

      // 把生成的复盘写回会话（持久化），下次打开直接用保存的内容，不再变化
      updateSessionReplay(s.id, res.data.replay);

      // 语料自动积累：把 AI 挑出的用户原话写入语料库（去重）
      const suggested = res.data.suggested_corpus;
      if (suggested && !savedRef.current) {
        savedRef.current = true;
        const exists = getCorpus().some((c) => c.user_expression === suggested);
        if (!exists) {
          const item: CorpusItem = {
            id: uid(),
            scene_type: s.scene_type,
            user_expression: suggested,
            why_it_worked: res.data.replay?.quick_note ?? "本轮回放保存",
            created_at: Date.now(),
          };
          saveCorpusItem(item);
        }
      }
    } catch (err) {
      // 网络层异常也要暴露真实原因
      console.error("[复盘请求异常]", err);
      setErrorMsg(err instanceof Error ? err.message : "网络出问题了，请稍后重试。");
      setState("ai-error");
    } finally {
      inflightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const s = getSessionById(sessionId);
    if (!s) {
      setState("missing");
      return;
    }
    setSession(s);
    buildReplay(s);
  }, [sessionId, buildReplay]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col px-4 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={() => router.push("/")} className="text-sm text-gray-500">
          ← 返回
        </button>
        <h1 className="text-lg font-bold">复盘</h1>
        <span className="w-10" />
      </header>

      {/* 内容区：flex-1 撑满，底部不会再被操作栏遮挡 */}
      <div className="flex-1 space-y-4 pb-4">
        {state === "missing" && (
          <div className="text-center text-sm text-gray-500">
            没有找到这条训练记录。
          </div>
        )}

        {state === "loading" && <LoadingSkeleton label="正在生成复盘…" />}

        {state === "ai-error" && (
          <ErrorRetry
            error={errorMsg || "复盘生成失败，请稍后重试。"}
            onRetry={() => session && buildReplay(session)}
          />
        )}

        {session && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
            {SCENE_LABEL[session.scene_type] ?? session.scene_type} ·{" "}
            {session.messages.filter((m) => m.role === "user").length} 轮 ·{" "}
            {new Date(session.created_at).toLocaleString("zh-CN")}
            {session.early_exit && " · 提前结束"}
          </div>
        )}

        {state === "ready" && replaySummary && (
          <>
            <ReplayCard replay={replaySummary} sceneType={session?.scene_type} />

            {/* 对话回放（可折叠） */}
            <details className="rounded-xl border border-gray-200 bg-white">
              <summary className="cursor-pointer p-4 text-sm font-medium text-gray-700">
                查看完整对话回放
              </summary>
              <div className="space-y-3 px-4 pb-4">
                {session?.messages.map((m, i) =>
                  m.role === "system" ? (
                    <div
                      key={i}
                      className="rounded-lg bg-gray-100 p-2 text-center text-xs text-gray-500"
                    >
                      {m.content}
                    </div>
                  ) : (
                    <ChatBubble
                      key={i}
                      role={m.role === "user" ? "user" : "ai"}
                      content={m.content}
                      name={
                        m.role === "ai" ? session?.scene_card.persona.name : undefined
                      }
                    />
                  )
                )}
              </div>
            </details>
          </>
        )}
      </div>

      {/* 底部操作栏：sticky 而非 fixed —— 它占据文档流空间，
          滚动到最底部时不会被遮住内容；pb-safe 避开系统导航栏 */}
      <nav className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white pb-safe">
        <div className="mx-auto grid w-full max-w-content grid-cols-2 gap-3 px-4 py-3">
          <button
            onClick={() => session && router.push(`/train/${session.scene_type}`)}
            className="rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white"
          >
            再来一轮
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl bg-gray-200 py-3 text-sm font-medium text-gray-700"
          >
            返回首页
          </button>
        </div>
      </nav>
    </main>
  );
}
