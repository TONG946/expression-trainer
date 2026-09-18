// 前端统一 API 调用封装
// 统一处理 { success: true, data } | { success: false, error } 返回格式、
// loading / error 状态，以及网络/服务端错误归类。
// 所有 AI 调用都走这里，绝不直接在前端携带或拼接 API Key。

import type {
  ApiResponse,
  EndJudgment,
  Message,
  ReplaySummary,
  SceneCard,
  SceneType,
} from "./types";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/** 统一约定：AI 非流式接口的 data 为字符串（后续流式单独扩展） */
export type ApiClientCallResult<T = string> = ApiResponse<T>;

/**
 * 底层请求：调用本应用的 API Route（相对路径），不直接调第三方。
 */
async function request<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // 网络层失败（断网、服务不可达）
    return { success: false, error: "网络连接异常，请检查网络后重试。" };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return {
      success: false,
      error: `服务返回异常（HTTP ${response.status}），请稍后重试。`,
    };
  }

  if (!response.ok) {
    const err = (json as { error?: string })?.error;
    return {
      success: false,
      error: err ?? `请求失败（HTTP ${response.status}），请稍后重试。`,
    };
  }

  return json as ApiResponse<T>;
}

/** 带 loading / error 状态的一次调用封装 */
export async function callApi<T = string>(
  path: string,
  opts?: {
    method?: HttpMethod;
    body?: unknown;
    onLoadingChange?: (loading: boolean) => void;
  }
): Promise<ApiClientCallResult<T>> {
  const { method = "GET", body, onLoadingChange } = opts ?? {};

  onLoadingChange?.(true);
  try {
    return await request<T>(path, method, body);
  } finally {
    onLoadingChange?.(false);
  }
}

// ---------------------------------------------------------------------------
// 业务级调用
// ---------------------------------------------------------------------------

/**
 * 调用 /api/generate-scene 生成一个训练场景。
 * 返回 { success: true, data: { scene_card } } 或 { success: false, error }。
 */
export async function generateScene(
  sceneType: SceneType,
  recentScenes: string[] = [],
  onLoadingChange?: (loading: boolean) => void
): Promise<ApiResponse<{ scene_card: SceneCard }>> {
  return callApi<{ scene_card: SceneCard }>("/api/generate-scene", {
    method: "POST",
    body: { scene_type: sceneType, recent_scenes: recentScenes },
    onLoadingChange,
  });
}

/**
 * 调用 /api/chat 获取 AI（对方）的回应文本。
 * 返回 { success: true, data: { reply } } 或 { success: false, error }。
 */
export async function chat(
  sceneCard: SceneCard,
  history: Message[],
  onLoadingChange?: (loading: boolean) => void
): Promise<ApiResponse<{ reply: string }>> {
  return callApi<{ reply: string }>("/api/chat", {
    method: "POST",
    body: { scene_card: sceneCard, history },
    onLoadingChange,
  });
}

/**
 * 调用 /api/judge-end 判断当前对话是否到达结束点。
 * 返回 { success: true, data: { end_judgment } } 或 { success: false, error }。
 */
export async function judgeEnd(
  payload: {
    scene_type: SceneType;
    turn_count: number;
    min_turns: number;
    max_turns: number;
    training_goal: string;
    history: Message[];
    user_last: string;
    ai_last: string;
  },
  onLoadingChange?: (loading: boolean) => void
): Promise<ApiResponse<{ end_judgment: EndJudgment }>> {
  return callApi<{ end_judgment: EndJudgment }>("/api/judge-end", {
    method: "POST",
    body: payload,
    onLoadingChange,
  });
}

/**
 * 调用 /api/replay 生成复盘小结。
 * 返回 { success: true, data: { replay } } 或 { success: false, error }。
 */
export async function replay(
  payload: {
    scene_card: SceneCard;
    history: Message[];
    end_judgment?: EndJudgment;
    early_exit: boolean;
  },
  onLoadingChange?: (loading: boolean) => void
): Promise<ApiResponse<{ replay: ReplaySummary; suggested_corpus: string | null }>> {
  return callApi<{ replay: ReplaySummary; suggested_corpus: string | null }>(
    "/api/replay",
    {
      method: "POST",
      body: payload,
      onLoadingChange,
    }
  );
}
