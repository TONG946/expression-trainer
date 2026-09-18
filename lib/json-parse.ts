// 服务端通用工具：解析 AI 模型输出的 JSON（容错剥离 ```json 代码围栏）。

/** 剥离模型输出中可能包裹的 ```json ... ``` / ``` ... ``` 代码围栏 */
export function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/** 容错地把文本解析为对象；失败抛出带可读信息的错误 */
export function parseAIJson<T>(text: string, label: string): T {
  const cleaned = stripCodeFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed === null || typeof parsed !== "object") {
      throw new Error("返回的不是对象");
    }
    return parsed as T;
  } catch {
    throw new Error(`AI 返回的${label}无法解析，请重试。若反复出现，可能是服务不稳定。`);
  }
}

/**
 * 带一次自动重试的「调用 + 解析」封装：
 * 第一次调用或解析失败时，自动再调用一次并重新解析。
 * 第二次仍失败则把异常抛出（由调用方显示错误）。
 */
export async function runWithRetry<T>(
  call: () => Promise<string>,
  parse: (text: string) => T
): Promise<T> {
  const attempt = async () => {
    const text = await call();
    return parse(text);
  };
  try {
    return await attempt();
  } catch {
    // 首次失败 → 自动重试一次
    return await attempt();
  }
}
