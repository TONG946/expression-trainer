// localStorage 操作封装（阶段三）
// Key 命名遵循产品文档规范：etm_ 前缀。
// 所有数据存浏览器 localStorage，无后端数据库。

import type {
  CorpusItem,
  ReplaySummary,
  SceneType,
  TrainingSession,
} from "./types";

// 与产品文档一致的 Key 命名
export const STORAGE_KEYS = {
  sessions: "etm_sessions",
  corpus: "etm_corpus",
  lastRecommendation: "etm_last_recommendation",
} as const;

export const MAX_SESSIONS = 100;

/** 保存单个训练会话；总量超出 MAX_SESSIONS 时删除最早记录的。 */
export function saveSession(session: TrainingSession): void {
  const sessions = getSessions();
  sessions.push(session);
  // 容量控制：最多保留 100 条，超出删除最早的
  const trimmed = sessions.slice(-MAX_SESSIONS);
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(trimmed));
}

/** 读取全部训练会话（按保存顺序，旧的在前）。 */
export function getSessions(): TrainingSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessions);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrainingSession[]) : [];
  } catch {
    return [];
  }
}

/** 按 id 取单个会话；不存在返回 null。 */
export function getSessionById(id: string): TrainingSession | null {
  return getSessions().find((s) => s.id === id) ?? null;
}

/**
 * 把生成的复盘写回某条会话并持久化，保证同一会话的复盘内容稳定、
 * 下次打开不再重新生成。会保持原有的保存顺序。
 */
export function updateSessionReplay(
  sessionId: string,
  replay: ReplaySummary
): boolean {
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return false;
  sessions[idx] = { ...sessions[idx], replay };
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  return true;
}

/** 保存一条个人语料（优秀表达素材）。 */
export function saveCorpusItem(item: CorpusItem): void {
  const corpus = getCorpus();
  corpus.push(item);
  localStorage.setItem(STORAGE_KEYS.corpus, JSON.stringify(corpus));
}

/** 读取个人语料库。 */
export function getCorpus(): CorpusItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.corpus);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CorpusItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * 读取最近 n 次训练的场景类型（用于避免场景重复/推荐）。
 * 默认取最近 3 次，按从新到旧返回。
 */
export function getRecentScenes(count = 3): SceneType[] {
  const sessions = getSessions();
  const recent: SceneType[] = [];
  // 最新的在数组末尾，倒序遍历
  for (let i = sessions.length - 1; i >= 0 && recent.length < count; i--) {
    const type = sessions[i]?.scene_type;
    if (type) recent.push(type);
  }
  return recent;
}

/**
 * 导出全部数据（etm_sessions + etm_corpus），打包成一个带版本标记的 JSON 字符串。
 * 供历史页【导出数据】按钮下载为文件。
 */
export function exportAllDataJson(): string {
  return JSON.stringify(
    {
      app: "expression-trainer",
      version: 2,
      exported_at: new Date().toISOString(),
      sessions: getSessions(),
      corpus: getCorpus(),
    },
    null,
    2
  );
}

/**
 * 从 JSON 字符串导入数据，与本地数据“合并去重”（按 id 去重）后写回 localStorage。
 * 返回值：{ sessionsAdded, corpusAdded }（本次实际新增条数）。
 * 若 JSON 格式不合法或缺少可用字段，抛 Error。
 */
export function importDataFromJson(json: string): {
  sessionsAdded: number;
  corpusAdded: number;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("导入文件不是有效的 JSON。");
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;

  // 兼容：带 app 标记的导出包，或直接 { sessions, corpus } 结构
  const sessionsIn: TrainingSession[] = Array.isArray(obj.sessions)
    ? (obj.sessions as TrainingSession[])
    : [];
  const corpusIn: CorpusItem[] = Array.isArray(obj.corpus)
    ? (obj.corpus as CorpusItem[])
    : [];

  if (!sessionsIn.length && !corpusIn.length) {
    throw new Error("导入文件里没有可用的训练记录或语料。");
  }

  // 合并去重（按 id 去重，导入的新数据放到前面，并触发容量裁剪）
  const existingSessions = getSessions();
  const existingIds = new Set(existingSessions.map((s) => s.id));
  const addedSessions = sessionsIn.filter((s) => !existingIds.has(s.id));
  const mergedSessions = [...addedSessions, ...existingSessions].slice(-MAX_SESSIONS);

  const existingCorpus = getCorpus();
  const existingCorpusIds = new Set(existingCorpus.map((c) => c.id));
  const addedCorpus = corpusIn.filter((c) => !existingCorpusIds.has(c.id));
  const mergedCorpus = [...addedCorpus, ...existingCorpus];

  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(mergedSessions));
  localStorage.setItem(STORAGE_KEYS.corpus, JSON.stringify(mergedCorpus));

  return {
    sessionsAdded: addedSessions.length,
    corpusAdded: addedCorpus.length,
  };
}

/**
 * 推荐今日训练场景：
 * - 取最近 3 次训练的场景类型，推荐其中练得最少的一个。
 * - 若无任何记录，默认推荐「高情商回复（eq）」。
 */
export function getRecommendedScene(): SceneType {
  const recent = getRecentScenes(3);
  if (recent.length === 0) return "eq";

  const count: Record<SceneType, number> = { humor: 0, structured: 0, eq: 0 };
  for (const type of recent) {
    if (count[type] !== undefined) count[type]++;
  }

  // 找出计数最少的场景；并列时按 humor → structured → eq 顺序取第一个
  const ordered: SceneType[] = ["humor", "structured", "eq"];
  let best: SceneType = ordered[0];
  let bestCount = Infinity;
  for (const type of ordered) {
    if (count[type] < bestCount) {
      best = type;
      bestCount = count[type];
    }
  }
  return best;
}
