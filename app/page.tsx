"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getRecommendedScene,
  getSessions,
} from "@/lib/storage";
import type { SceneType } from "@/lib/types";

// 三个场景的展示元信息
const SCENES: { type: SceneType; name: string; desc: string; accent: string }[] = [
  { type: "humor", name: "幽默感", desc: "练习接话与接梗结构", accent: "bg-amber-100 text-amber-700" },
  { type: "structured", name: "结构化表达", desc: "结论先行与框架选择", accent: "bg-sky-100 text-sky-700" },
  { type: "eq", name: "高情商回复", desc: "非防御性回应与边界", accent: "bg-emerald-100 text-emerald-700" },
];

const SCENE_NAME: Record<SceneType, string> = {
  humor: "幽默感",
  structured: "结构化表达",
  eq: "高情商回复",
};

export default function HomePage() {
  const [recommended, setRecommended] = useState<SceneType>("eq");
  const [practicedCount, setPracticedCount] = useState<Record<string, number>>({});
  const [recentSessions, setRecentSessions] = useState<
    { id: string; scene_type: SceneType; created_at: number; replay?: unknown }[]
  >([]);

  useEffect(() => {
    setRecommended(getRecommendedScene());
    const sessions = getSessions();
    setRecentSessions(sessions.slice(-5).reverse());
    const count: Record<string, number> = {};
    for (const s of sessions) {
      const key = s.scene_type ?? "";
      count[key] = (count[key] ?? 0) + 1;
    }
    setPracticedCount(count);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col px-4 pt-6">
      <div className="flex-1 pb-4">
      {/* 今日训练卡片 */}
      <section className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-6 text-white">
        <h2 className="text-sm font-medium text-white/80">今日训练</h2>
        <p className="mt-1 text-xl font-bold">
          今日推荐：{SCENE_NAME[recommended]}
        </p>
        <p className="mt-2 text-sm text-white/80">
          轮换训练建议 · 练得最少的场景优先
        </p>
        <Link
          href={`/train/${recommended}`}
          className="mt-4 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-600 shadow"
        >
          开始训练
        </Link>
      </section>

      {/* 三个场景入口 */}
      <section className="mt-6">
        <h3 className="text-sm font-semibold text-gray-600">选择场景</h3>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {SCENES.map((scene) => (
            <Link
              key={scene.type}
              href={`/train/${scene.type}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="text-base font-semibold">{scene.name}</p>
                <p className="mt-1 text-xs text-gray-500">{scene.desc}</p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${scene.accent}`}
                >
                  {practicedCount[scene.type] ?? 0} 次
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 最近训练记录 */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600">最近训练</h3>
          <Link href="/history" className="text-xs text-indigo-600">
            全部
          </Link>
        </div>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white">
          {recentSessions.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              还没有训练记录，点击「开始训练」练一轮吧。
            </p>
          ) : (
            recentSessions.map((s, i) => (
              <Link
                key={s.id}
                href={`/replay/${s.id}`}
                className={`flex items-center justify-between px-4 py-3 ${
                  i === 0 ? "" : "border-t border-gray-100"
                }`}
              >
                <span className="text-sm font-medium">
                  {SCENE_NAME[s.scene_type] ?? s.scene_type}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(s.created_at).toLocaleDateString("zh-CN")}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      </div>

      {/* 底部导航：sticky 占据文档流，避免遮挡页面底部内容 */}
      <nav className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white pb-safe">
        <div className="mx-auto grid w-full max-w-content grid-cols-2 px-4 py-2">
          <span className="text-center text-sm font-semibold text-indigo-600">
            首页
          </span>
          <Link href="/history" className="text-center text-sm text-gray-500">
            历史
          </Link>
        </div>
      </nav>
    </main>
  );
}
