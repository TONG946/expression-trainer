// 硅基流动服务端调用助手（OpenAI 兼容格式）
// 仅供服务端 API Route 使用：读取服务端环境变量，绝不暴露 Key 到前端。
// 参考：https://docs.siliconflow.cn/cn/userguide/openai_api

// 默认值（由 .env / .env.local / Vercel 环境变量覆盖）
const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V3";

/**
 * 调用硅基流动 chat/completions（OpenAI 兼容）。
 * 返回 AI 回复文本；遇错抛出带可读信息的 Error。
 */
export async function chatCompletion(opts: {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    throw new Error("SILICONFLOW_API_KEY 未配置：请在 .env.local 中填写你的 Key。");
  }

  const baseUrl = process.env.SILICONFLOW_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.SILICONFLOW_MODEL || DEFAULT_MODEL;

  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 2000,
      }),
    });
  } catch {
    throw new Error("无法连接硅基流动 API，请检查网络后重试。");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`硅基流动 API 请求失败（HTTP ${res.status}）：${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("硅基流动 API 返回为空，请重试。");
  }
  return content;
}
