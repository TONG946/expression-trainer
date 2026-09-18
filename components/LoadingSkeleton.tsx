// 加载骨架屏：场景生成中显示占位条
// 用于训练页 / 历史页等异步加载区域。
export default function LoadingSkeleton({
  rows = 3,
  label = "正在生成场景…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="animate-pulse space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-gray-200"
            data-testid="loading-skeleton"
          />
        ))}
      </div>
    </div>
  );
}
