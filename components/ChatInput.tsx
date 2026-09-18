"use client";

// 对话输入框 + 发送按钮：用户输入为空时禁用发送
export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const canSend = value.trim().length > 0 && !disabled;
  return (
    <div className="flex items-end gap-2 border-t border-gray-200 bg-white p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        rows={1}
        placeholder={placeholder ?? "输入你的回应…"}
        disabled={disabled}
        className="max-h-32 flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
      />
      <button
        onClick={onSend}
        disabled={!canSend}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        发送
      </button>
    </div>
  );
}
