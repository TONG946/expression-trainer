// 对话气泡：用户消息右对齐，AI 消息左对齐
export default function ChatBubble({
  role,
  content,
  name,
}: {
  role: "user" | "ai";
  content: string;
  name?: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? "rounded-br-sm bg-indigo-600 text-white"
            : "rounded-bl-sm bg-gray-100 text-gray-800"
        }`}
      >
        {!isUser && name && (
          <p className="mb-1 text-xs text-gray-400">{name}</p>
        )}
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
