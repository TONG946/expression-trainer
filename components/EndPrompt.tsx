// 自然结束提示：在对话流中插入一条浅色系统提示 + 两个操作按钮
export default function EndPrompt({
  message,
  onContinue,
  onReview,
}: {
  message: string;
  onContinue?: () => void;
  onReview?: () => void;
}) {
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-center">
      <p className="text-sm text-amber-800">{message}</p>
      <div className="mt-3 flex justify-center gap-3">
        {onContinue && (
          <button
            onClick={onContinue}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            继续练一轮
          </button>
        )}
        {onReview && (
          <button
            onClick={onReview}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
          >
            进入复盘
          </button>
        )}
      </div>
    </div>
  );
}
