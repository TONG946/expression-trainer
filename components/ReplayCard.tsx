// 复盘卡片：展示本轮表现速写 / 理论锚点 / 对照表 / 下一轮任务
// v2.0：理论锚点卡片增加“查看该理论详情”折叠面板，形成个人的“理论工具箱”。
import { useState } from "react";
import type { ReplaySummary, SceneType } from "@/lib/types";
import { THEORY_LIBRARY } from "@/lib/theory-library";

// 根据理论锚点名字/来源，从场景对应理论库里找出一条，用于展开详情
function findTheoryDetail(
  sceneType: SceneType | undefined,
  anchorName: string,
  anchorSource: string
) {
  if (!sceneType) return null;
  const items = THEORY_LIBRARY[sceneType] ?? [];
  if (!items.length || !anchorName) return null;
  const byName = items.find(
    (t) => t.name === anchorName || anchorName.includes(t.name) || t.name.includes(anchorName)
  );
  if (byName && byName.detailed_intro) return byName;
  // 退而求其次：按书名匹配
  if (anchorSource) {
    const bySource = items.find((t) => t.source.includes(anchorSource));
    if (bySource && bySource.detailed_intro) return bySource;
  }
  return null;
}

export default function ReplayCard({
  replay,
  sceneType,
}: {
  replay: ReplaySummary;
  sceneType?: SceneType;
}) {
  const { quick_note, theory_anchor, comparison, next_task } = replay;
  const [openTheory, setOpenTheory] = useState(false);

  const theoryDetail = findTheoryDetail(
    sceneType,
    theory_anchor?.name || "",
    theory_anchor?.source || ""
  );

  return (
    <div className="space-y-4">
      {/* 1. 本轮表现速写 */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold text-gray-400">本轮表现速写</h3>
        <p className="mt-1 text-sm text-gray-800">{quick_note}</p>
      </section>

      {/* 2. 理论锚点 */}
      {theory_anchor?.name && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold text-gray-400">理论锚点</h3>
          <p className="mt-1 text-sm font-semibold text-indigo-700">
            {theory_anchor.name}
            {theory_anchor.source && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                《{theory_anchor.source}》
              </span>
            )}
          </p>
          {theory_anchor.explanation && (
            <p className="mt-1 text-sm text-gray-600">
              {theory_anchor.explanation}
            </p>
          )}

          {/* “查看该理论详情”折叠面板：构建用户个人的理论工具箱 */}
          {theoryDetail && (
            <details
              open={openTheory}
              onToggle={(e) => setOpenTheory((e.target as HTMLDetailsElement).open)}
              className="mt-3 rounded-lg border border-gray-100"
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-indigo-600">
                查看该理论详情
              </summary>
              <div className="space-y-2 border-t border-gray-100 px-3 py-3 text-xs leading-relaxed text-gray-600">
                {theoryDetail.detailed_intro.split("\n").map((line, i) => {
                  const isHeader = /：/.test(line) || line.startsWith("简要说明");
                  return (
                    <p key={i} className={isHeader ? "text-gray-500" : ""}>
                      {line}
                    </p>
                  );
                })}
              </div>
            </details>
          )}
        </section>
      )}

      {/* 3. 对照表 */}
      {comparison && comparison.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold text-gray-400">
            你的表达 vs 理论视角
          </h3>
          <ul className="mt-2 space-y-3">
            {comparison.map((row, i) => (
              <li key={i} className="text-sm">
                {row.dimension && (
                  <p className="text-xs font-medium text-gray-500">
                    {row.dimension}
                  </p>
                )}
                <div className="mt-1 rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-600">
                    <span className="font-medium text-gray-700">你：</span>
                    {row.user_expression}
                  </p>
                  <p className="mt-1 text-gray-600">
                    <span className="font-medium text-indigo-600">
                      可这样走：
                    </span>
                    {row.theory_view}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4. 下一轮练习任务 */}
      {next_task && (
        <section className="rounded-xl bg-amber-50 p-4">
          <h3 className="text-xs font-semibold text-amber-700">下一轮练习任务</h3>
          <p className="mt-1 text-sm text-amber-800">{next_task}</p>
        </section>
      )}
    </div>
  );
}
