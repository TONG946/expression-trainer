"use client";

// 错误提示 + 重试按钮：配合 api-client 的统一错误处理。
// 展示错误信息，并允许用户点击重试重新发起请求。
export default function ErrorRetry({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
      <p className="text-sm text-red-600">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
        >
          重试
        </button>
      )}
    </div>
  );
}
