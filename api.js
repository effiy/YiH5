/**
 * API 服务模块
 * 统一处理所有 API 调用、错误处理和认证
 */

// ---------- 常量定义 ----------
export const API_BASE = "https://api.effiy.cn";
export const NEWS_API_BASE = `${API_BASE}/mongodb/`;
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
// 新闻查询配置（与 YiPet 保持一致）
const NEWS_PAGE_SIZE = 500; // 单次最多拉取条数
const NEWS_MAX_PAGES = 10; // 最多翻页次数
const NEWS_LIST_FIELDS = [
  'key',
  'title',
  'link',
  'description',
  'tags',
  'source_name',
  'source_url',
  'published',
  'published_parsed',
  'createdTime',
  'updatedTime',
];

export const fetchNews = async (isoDate, token, options = {}) => {
  const pageSize = options.pageSize || NEWS_PAGE_SIZE;
  const maxPages = options.maxPages || NEWS_MAX_PAGES;
  
  // 构建第一页请求参数
  const params = new URLSearchParams();
  params.set('cname', 'rss');
  params.set('isoDate', isoDate);
  params.set('pageNum', '1');
  params.set('pageSize', String(pageSize));
  params.set('orderBy', 'updatedTime');
  params.set('orderType', 'desc');
  // 轻量列表：使用 fields 参数指定需要的字段
  params.set('fields', NEWS_LIST_FIELDS.join(','));

  const firstPageUrl = `${NEWS_API_BASE}?${params.toString()}`;
  const response = await fetchWithAuth(firstPageUrl, {}, token);
  const firstResult = await response.json();
  
  // 提取第一页数据
  let newsList = [];
  let totalPages = 1;
  
  // 兼容不同返回结构
  if (Array.isArray(firstResult)) {
    newsList = firstResult;
  } else if (firstResult && firstResult.data && Array.isArray(firstResult.data.list)) {
    newsList = firstResult.data.list;
    totalPages = firstResult.data.totalPages || 1;
  } else if (firstResult && Array.isArray(firstResult.data)) {
    newsList = firstResult.data;
  } else if (firstResult && Array.isArray(firstResult.list)) {
    newsList = firstResult.list;
  } else if (firstResult && Array.isArray(firstResult.items)) {
    newsList = firstResult.items;
  }
  
  // 如果有分页信息，最多再拉若干页
  const pagesToLoad = Math.min(totalPages, maxPages);
  if (!Array.isArray(firstResult) && pagesToLoad > 1) {
    for (let page = 2; page <= pagesToLoad; page++) {
      const p = new URLSearchParams(params);
      p.set('pageNum', String(page));
      const pageUrl = `${NEWS_API_BASE}?${p.toString()}`;
      try {
        const pageResponse = await fetchWithAuth(pageUrl, {}, token);
        const pageResult = await pageResponse.json();
        
        let pageList = [];
        if (Array.isArray(pageResult)) {
          pageList = pageResult;
        } else if (pageResult && pageResult.data && Array.isArray(pageResult.data.list)) {
          pageList = pageResult.data.list;
        } else if (pageResult && Array.isArray(pageResult.data)) {
          pageList = pageResult.data;
        } else if (pageResult && Array.isArray(pageResult.list)) {
          pageList = pageResult.list;
        }
        
        if (pageList.length > 0) {
          newsList = newsList.concat(pageList);
        } else {
          // 如果某一页没有数据，停止继续加载
          break;
        }
      } catch (error) {
        console.warn(`[YiH5] 获取第 ${page} 页新闻失败:`, error);
        break;
      }
    }
  }
  
  // 返回统一格式
  return {
    data: {
      list: newsList,
      totalPages: totalPages
    }
  };
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


