"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";

import {
  exportAllDataJson,
  getCorpus,
  getSessions,
  importDataFromJson,
} from "@/lib/storage";
import type { CorpusItem, TrainingSession } from "@/lib/types";

const SCENE_LABEL: Record<string, string> = {
  humor: "幽默感",
  structured: "结构化表达",
  eq: "高情商回复",
};

type Tab = "sessions" | "corpus";

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("sessions");
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [corpus, setCorpus] = useState<CorpusItem[]>([]);
  // 备份操作结果提示（导出成功 / 导入结果 / 错误）
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setSessions(getSessions().slice().reverse()); // 新的在前
    setCorpus(getCorpus().slice().reverse());
  };

  useEffect(() => {
    refresh();
  }, []);

  // 导出：把 sessions + corpus 打包成 JSON 文件下载
  const handleExport = () => {
    const json = exportAllDataJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `表达训练模拟器-备份-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupMsg("已导出：训练记录与语料已打包成 JSON 文件。");
    window.setTimeout(() => setBackupMsg(null), 3000);
  };

  // 导入：读取用户选择的 JSON 文件，合并到本地（按 id 去重）
  const handleImportFile = async (file: File) => {
    const text = await file.text();
    try {
      const result = importDataFromJson(text);
      refresh();
      setBackupMsg(
        `导入完成：新增 ${result.sessionsAdded} 条训练记录、${result.corpusAdded} 条语料（重复项已跳过）。`
      );
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : "导入失败，文件格式有误。");
    }
  };

  const handleImportChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = window.confirm(
      "导入会把备份中的训练记录与语料合并到当前数据（按 id 去重）。确定继续吗？"
    );
    if (!ok) return;
    handleImportFile(file);
    // 允许再次选择同一个文件
    e.target.value = "";
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col px-4 pt-6">
      <div className="flex-1 pb-4">
      <header className="mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">历史</h1>
          {/* 数据备份：导出 / 导入按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 active:opacity-80"
            >
              导出数据
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 active:opacity-80"
            >
              导入数据
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportChange}
            />
          </div>
        </div>
        {backupMsg && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {backupMsg}
          </p>
        )}
      </header>

      {/* 两个 Tab */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab("sessions")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "sessions"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500"
          }`}
        >
          训练记录
        </button>
        <button
          onClick={() => setTab("corpus")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "corpus"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500"
          }`}
        >
          个人语料库
        </button>
      </div>

      {/* 训练记录 Tab */}
      {tab === "sessions" && (
        <section className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
              完成训练后，记录会出现在这里
            </p>
          ) : (
            sessions.map((s) => (
              <Link
                key={s.id}
                href={`/replay/${s.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {SCENE_LABEL[s.scene_type] ?? s.scene_type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(s.created_at).toLocaleString("zh-CN")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {s.messages.filter((m) => m.role === "user").length} 轮
                  {s.early_exit && " · 提前结束"}
                </p>
                {s.replay?.quick_note && (
                  <p className="mt-1 text-xs text-gray-600">{s.replay.quick_note}</p>
                )}
              </Link>
            ))
          )}
        </section>
      )}

      {/* 个人语料库 Tab */}
      {tab === "corpus" && (
        <section className="mt-4 space-y-3">
          {corpus.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
              暂无语料。在训练中把好的表达收藏后，会出现在这里
            </p>
          ) : (
            corpus.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                  {SCENE_LABEL[c.scene_type] ?? c.scene_type}
                </span>
                <p className="mt-2 text-sm text-gray-700">{c.user_expression}</p>
                {c.why_it_worked && (
                  <p className="mt-1 text-xs text-gray-500">
                    为什么好：{c.why_it_worked}
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      )}

      </div>

      {/* 底部导航：sticky 占据文档流，避免遮挡页面底部内容 */}
      <nav className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white pb-safe">
        <div className="mx-auto grid w-full max-w-content grid-cols-2 px-4 py-2">
          <Link href="/" className="text-center text-sm text-gray-500">
            首页
          </Link>
          <span className="text-center text-sm font-semibold text-indigo-600">
            历史
          </span>
        </div>
      </nav>
    </main>
  );
}
