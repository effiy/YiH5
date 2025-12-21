/**
 * API 服务模块
 * 统一处理所有 API 调用、错误处理和认证
 */

// ---------- 常量定义 ----------
export const API_BASE = "https://api.effiy.cn";
export const NEWS_API_BASE = `${API_BASE}/mongodb/?cname=rss&excludeFields=content`;
export const FAQ_API_URL = `${API_BASE}/mongodb/?cname=faqs&orderBy=order&orderType=asc`;
export const PROMPT_API_URL = `${API_BASE}/prompt/`;
export const SESSION_API_URL = `${API_BASE}/session/`;
export const SESSION_SAVE_API_URL = `${API_BASE}/session/save`;

// ---------- 认证管理 ----------
const API_TOKEN_KEY = "YiH5.apiToken.v1";

export const getAuthHeaders = (token) => {
  const authToken = token || getStoredToken();
  if (!authToken) return {};
  return { "X-Token": authToken };
};

export const getStoredToken = () => {
  try {
    return String(localStorage.getItem(API_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
};

export const saveToken = (token) => {
  try {
    localStorage.setItem(API_TOKEN_KEY, String(token || "").trim());
  } catch {
    // ignore
  }
};

// ---------- 通用 API 调用 ----------
const handleApiError = (error, isFile) => {
  const isFileProtocol = isFile || location.protocol === "file:";
  if (String(error?.message || "").includes("HTTP 401")) {
    return "需要配置 API 鉴权（至少需要 X-Token）。请点右上角🔒设置。";
  }
  return isFileProtocol
    ? "请求失败：当前以 file:// 打开页面，跨域请求可能被浏览器拦截。建议用本地静态服务器打开再试。"
    : "请求失败：请稍后重试。";
};

export const fetchWithAuth = async (url, options = {}, token) => {
  const headers = {
    ...getAuthHeaders(token),
    ...options.headers,
  };
  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response;
};

// ---------- 会话相关 API ----------
export const fetchSessions = async (token) => {
  const response = await fetchWithAuth(SESSION_API_URL, {}, token);
  const data = await response.json();
  const sessions = Array.isArray(data) ? data : (data.data || data.sessions || []);
  return sessions;
};

export const fetchSessionDetail = async (sessionId, token) => {
  if (!sessionId) return null;
  const response = await fetchWithAuth(
    `${SESSION_API_URL}${encodeURIComponent(sessionId)}`,
    {},
    token
  );
  const data = await response.json();
  return data?.data || data;
};

export const saveSession = async (sessionData, token) => {
  const response = await fetchWithAuth(
    SESSION_SAVE_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionData),
    },
    token
  );
  return await response.json();
};

export const deleteSession = async (sessionId, token) => {
  if (!sessionId) {
    throw new Error("会话ID不能为空");
  }
  const response = await fetchWithAuth(
    `${SESSION_API_URL}${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
    token
  );
  return await response.json();
};

// ---------- 新闻相关 API ----------
export const fetchNews = async (isoDate, token) => {
  const url = `${NEWS_API_BASE}&isoDate=${encodeURIComponent(isoDate)}`;
  const response = await fetchWithAuth(url, {}, token);
  const result = await response.json();
  return result;
};

// ---------- FAQ 相关 API ----------
export const fetchFaqs = async (token) => {
  const response = await fetchWithAuth(FAQ_API_URL, {}, token);
  const result = await response.json();
  return result;
};

// ---------- Prompt 相关 API ----------
export const callPrompt = async (systemPrompt, userPrompt, modelId, conversationId, token) => {
  const payload = {
    fromSystem: String(systemPrompt || "").trim(),
    fromUser: String(userPrompt || "").trim(),
    model: modelId || "deepseek-r1:32b",
  };
  if (conversationId) payload.conversation_id = String(conversationId).trim();

  const response = await fetchWithAuth(
    PROMPT_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token
  );

  const text = await response.text();
  if (!text) return "";

  // 去除思考过程
  const stripThink = (raw) => {
    let s = String(raw || "");
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
    s = s.replace(/```think[\s\S]*?```/gi, "");
    return s.trim();
  };

  // 尝试解析 JSON
  try {
    const obj = JSON.parse(text);
    const content =
      obj?.content ||
      obj?.data ||
      obj?.message?.content ||
      (Array.isArray(obj?.choices)
        ? obj.choices.map((c) => c.message?.content || c.delta?.content || "").join("")
        : "");
    if (content) return stripThink(content);
  } catch {
    // ignore
  }

  // SSE 兼容
  if (text.includes("data:")) {
    const lines = text.split("\n");
    let accumulated = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") continue;
      try {
        const chunk = JSON.parse(dataStr);
        if (chunk.done === true) break;
        if (chunk.data) accumulated += chunk.data;
        else if (chunk.content) accumulated += chunk.content;
        else if (chunk.message?.content) accumulated += chunk.message.content;
      } catch {
        accumulated += dataStr;
      }
    }
    return stripThink(accumulated);
  }

  return stripThink(text);
};

// ---------- 数据提取工具（统一处理不同 API 返回格式）----------
export const extractList = (result, listKey = "list") => {
  if (result && result.data && Array.isArray(result.data[listKey])) return result.data[listKey];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result[listKey])) return result[listKey];
  if (result && Array.isArray(result.items)) return result.items;
  return [];
};

export { handleApiError };

