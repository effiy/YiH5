/**
 * 数据规范化模块
 * 统一处理不同来源的数据格式转换
 */

// ---------- 会话数据规范化 ----------
export const normalizeSession = (s) => {
  const tags = Array.isArray(s.tags) ? s.tags : (s.tags ? [s.tags] : []);
  const title = (s.title ?? s.pageTitle ?? "").trim() || "未命名会话";
  const preview = (s.pageDescription ?? s.preview ?? s.summary ?? "").trim();
  const updatedAt = Number(s.updatedAt ?? s.updated_at ?? Date.now());
  const createdAt = Number(s.createdAt ?? s.created_at ?? updatedAt);
  const lastAccessTime = Number(s.lastAccessTime ?? s.last_access_time ?? updatedAt);
  const lastActiveAt = Number(s.lastActiveAt ?? s.last_active_at ?? lastAccessTime ?? updatedAt);
  const messageCount =
    Number(s.message_count ?? s.messageCount ?? (Array.isArray(s.messages) ? s.messages.length : 0)) || 0;
  const messages = Array.isArray(s.messages) ? s.messages : [];

  return {
    id: String(s.id || `s_${Date.now()}_${Math.random()}`),
    title,
    preview,
    tags,
    url: s.url || "",
    pageTitle: s.pageTitle || "",
    pageDescription: s.pageDescription || "",
    pageContent: s.pageContent || s.content || "",
    messageCount,
    messages,
    createdAt,
    updatedAt,
    lastAccessTime,
    muted: s.muted !== undefined ? !!s.muted : false,
    lastActiveAt,
  };
};

// ---------- 消息数据规范化 ----------
export const normalizeRole = (m) => {
  const r = String(m?.role ?? m?.sender ?? m?.type ?? "").toLowerCase();
  if (r === "user" || r === "me") return "user";
  if (r === "assistant" || r === "bot" || r === "ai" || r === "pet") return "assistant";
  if (m?.isUser === true) return "user";
  return "assistant";
};

export const normalizeText = (m) => String(m?.content ?? m?.text ?? m?.message ?? "").trim();

export const normalizeMessage = (msg) => {
  let role = "assistant";
  if (msg.type === "user") {
    role = "user";
  } else if (msg.type === "pet" || msg.type === "assistant" || msg.type === "bot" || msg.type === "ai") {
    role = "assistant";
  } else if (msg.role) {
    role = msg.role;
  }

  return {
    role: role,
    content: msg.content || "",
    ts: msg.timestamp || msg.ts || Date.now(),
    imageDataUrl: msg.imageDataUrl || msg.image || undefined,
  };
};

// ---------- 新闻数据规范化 ----------
export const normalizeNewsItem = (n) => {
  const title = String(n?.title ?? "").trim() || "未命名新闻";
  const link = String(n?.link ?? "").trim();
  const description = String(n?.description ?? "").trim();
  const sourceName = String(n?.source_name ?? n?.sourceName ?? "").trim();
  const createdTime = String(n?.createdTime ?? "").trim();
  const published = String(n?.published ?? "").trim();
  const tags = Array.isArray(n?.tags) ? n.tags.map((t) => String(t || "").trim()).filter(Boolean) : [];
  const key = String(n?.key ?? n?._id ?? n?.id ?? link ?? title);
  return { key, title, link, description, sourceName, createdTime, published, tags };
};

// ---------- FAQ 数据规范化 ----------
export const normalizeFaqs = (list) => {
  if (!Array.isArray(list)) return [];
  const faqs = list
    .map((x) => {
      const text = String(x?.text ?? "").trim();
      if (!text) return null;
      const order = Number.isFinite(Number(x?.order)) ? Number(x.order) : 999999;
      const id = String(x?._id ?? x?.id ?? text);
      return { id, text, order };
    })
    .filter(Boolean);

  faqs.sort((a, b) => a.order - b.order);
  return faqs;
};

// ---------- 构建会话保存 payload ----------
export const buildSessionPayload = (s) => {
  const now = Date.now();
  const messagesForBackend = (s.messages || []).map((m) => {
    const role = normalizeRole(m);
    return {
      type: role === "user" ? "user" : "pet",
      content: normalizeText(m),
      timestamp: m.ts || m.timestamp || now,
      imageDataUrl: m.imageDataUrl || m.image || undefined,
    };
  });

  return {
    id: String(s.id),
    url: s.url || "",
    pageTitle: (s.pageTitle && String(s.pageTitle).trim()) || s.title || "",
    pageDescription: (s.pageDescription && String(s.pageDescription).trim()) || s.preview || "",
    pageContent: s.pageContent || "",
    tags: Array.isArray(s.tags) ? s.tags : [],
    createdAt: s.createdAt || now,
    updatedAt: s.updatedAt || now,
    lastAccessTime: s.lastAccessTime || now,
    messages: messagesForBackend,
  };
};

