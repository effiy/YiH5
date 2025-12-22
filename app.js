(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- visualViewport: 让底部 fixed 组件始终贴合“可视窗口底部” ----------
  // 背景：iOS Safari / 部分 WebView 在地址栏/底部工具栏伸缩或键盘弹出时，
  // layout viewport 与 visual viewport 会出现差值，导致 bottom:0 的 fixed 元素“悬空/被遮挡”。
  const setupVisualViewportBottomInset = () => {
    const docEl = document.documentElement;
    if (!docEl) return;
    const vv = window.visualViewport;

    let raf = 0;
    const update = () => {
      const layoutH = docEl.clientHeight || 0;
      let insetBottom = 0;

      if (vv && Number.isFinite(vv.height) && Number.isFinite(vv.offsetTop)) {
        // layout viewport 底部 - visual viewport 底部（考虑 offsetTop）
        insetBottom = Math.max(0, layoutH - vv.height - vv.offsetTop);
      }

      // 写入 CSS 变量供 styles.css 使用
      docEl.style.setProperty("--vv-bottom", `${Math.round(insetBottom)}px`);
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    if (vv) {
      vv.addEventListener("resize", schedule, { passive: true });
      vv.addEventListener("scroll", schedule, { passive: true });
    }
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
  };

  // ---------- Markdown / Mermaid ----------
  const initMermaidOnce = () => {
    if (typeof window.mermaid === "undefined") return false;
    if (initMermaidOnce._inited) return true;
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        flowchart: { useMaxWidth: true, htmlLabels: true },
      });
      initMermaidOnce._inited = true;
      return true;
    } catch (e) {
      console.warn("[YiH5] Mermaid 初始化失败：", e);
      return false;
    }
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const isSafeUrl = (href) => {
    const s = String(href || "").trim();
    if (!s) return false;
    // 允许：http(s) / data:（常见为 data:image/...）
    if (s.startsWith("http://") || s.startsWith("https://")) return true;
    if (s.startsWith("data:")) return true;
    return false;
  };

  let markedConfigured = false;
  const ensureMarkedConfigured = () => {
    if (markedConfigured) return;
    if (typeof window.marked === "undefined" || typeof window.marked.parse !== "function") return;
    try {
      const renderer = new window.marked.Renderer();
      // 给 Markdown 图片加懒加载与异步解码，显著改善长内容滚动卡顿（尤其 iOS WebView）
      renderer.image = (href, title, text) => {
        const src = isSafeUrl(href) ? String(href || "").trim() : "";
        const alt = escapeHtml(text || "");
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        if (!src) return alt ? `<span>${alt}</span>` : "";
        return `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async" fetchpriority="low"${t} />`;
      };
      // 外链默认新开，避免在 H5 内“跳走”
      renderer.link = (href, title, text) => {
        const url = isSafeUrl(href) ? String(href || "").trim() : "";
        const label = text || href || "";
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        if (!url) return `<span>${escapeHtml(label)}</span>`;
        return `<a href="${escapeHtml(url)}"${t} target="_blank" rel="noopener noreferrer">${label}</a>`;
      };

      window.marked.setOptions({
        breaks: true,
        gfm: true,
        renderer,
      });
      markedConfigured = true;
    } catch (e) {
      console.warn("[YiH5] marked 配置失败：", e);
    }
  };

  const renderMarkdown = (text) => {
    const raw = String(text ?? "").trim();
    if (!raw) return "";

    // 有 marked 就用（和插件端一致：允许基础 HTML / code fence）
    if (typeof window.marked !== "undefined" && typeof window.marked.parse === "function") {
      try {
        ensureMarkedConfigured();
        return window.marked.parse(raw);
      } catch (e) {
        console.warn("[YiH5] Markdown 渲染失败，回退纯文本：", e);
      }
    }

    // 回退：纯文本换行
    return escapeHtml(raw).replaceAll("\n", "<br/>");
  };

  // 获取页面图标URL
  const getPageIconUrl = () => {
    let iconUrl = '';
    const linkTags = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    if (linkTags.length > 0) {
      iconUrl = linkTags[0].href;
      if (!iconUrl.startsWith('http')) {
        iconUrl = new URL(iconUrl, window.location.origin).href;
      }
    }
    if (!iconUrl) {
      iconUrl = '/favicon.ico';
      if (!iconUrl.startsWith('http')) {
        iconUrl = new URL(iconUrl, window.location.origin).href;
      }
    }
    return iconUrl;
  };

  // 创建欢迎消息HTML
  const createWelcomeMessageHtml = (session) => {
    const pageUrl = session.url || window.location.href;
    const pageDescription = (session.pageDescription && session.pageDescription.trim()) || '';

    let welcomeHtml = `
      <div class="welcome-message" style="margin-bottom: 10px; padding: 16px; background: linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(68, 160, 141, 0.05)); border-radius: 12px; border-left: 3px solid #4ECDC4;">
        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #6B7280; margin-bottom: 4px; font-weight: 500;">🔗 网址</div>
          <a href="${escapeHtml(pageUrl)}" target="_blank"
             style="
               word-break: break-all;
               color: #2196F3;
               text-decoration: none;
               font-size: 13px;
               display: -webkit-box;
               -webkit-line-clamp: 2;
               -webkit-box-orient: vertical;
               overflow: hidden;
               max-width: 100%;
               line-height: 1.6;
               text-overflow: ellipsis;
             "
             title="${escapeHtml(pageUrl)}"
             onmouseover="this.style.textDecoration='underline'"
             onmouseout="this.style.textDecoration='none'">
             ${escapeHtml(pageUrl)}
          </a>
        </div>
    `;

    if (pageDescription && pageDescription.trim().length > 0) {
      welcomeHtml += `
        <div style="margin-bottom: 0;">
          <div style="display: flex; align-items: center; gap: 4px; font-size: 12px; margin-bottom: 4px; font-weight: 500;">
            <span style="font-size:13px;">📝</span> 页面描述
          </div>
          <div style="font-size: 13px; color: #666; border-radius:7px; padding:8px 12px; line-height: 1.7; padding-left:0.5em;">
            ${renderMarkdown(pageDescription)}
          </div>
        </div>
      `;
    }

    welcomeHtml += `</div>`;

    return welcomeHtml;
  };

  const replaceMermaidCodeBlocks = (root) => {
    if (!root) return [];
    const codeBlocks = root.querySelectorAll(
      "pre > code.language-mermaid, pre > code.language-mmd, code.language-mermaid, code.language-mmd",
    );
    const created = [];

    codeBlocks.forEach((code, idx) => {
      // 避免重复处理
      if (code.classList.contains("mermaid-processed")) return;

      const pre = code.closest("pre");
      const source = (code.textContent || "").trim();
      if (!source) return;

      const mermaidDiv = document.createElement("div");
      mermaidDiv.className = "mermaid";
      mermaidDiv.id = `mermaid-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
      mermaidDiv.textContent = source;
      mermaidDiv.setAttribute("data-mermaid-source", source);

      code.classList.add("mermaid-processed");
      if (pre && pre.parentNode) {
        pre.parentNode.replaceChild(mermaidDiv, pre);
      } else if (code.parentNode) {
        code.parentNode.replaceChild(mermaidDiv, code);
      }
      created.push(mermaidDiv);
    });

    return created;
  };

  const renderMermaidIn = async (root) => {
    if (!initMermaidOnce()) return;
    const nodes = replaceMermaidCodeBlocks(root);
    if (nodes.length === 0) return;
    try {
      // mermaid.run 支持直接渲染 nodes
      await window.mermaid.run({ nodes });
    } catch (e) {
      console.warn("[YiH5] Mermaid 渲染失败：", e);
    }
  };

  const dateUtil = {
    formatYMD(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}/${m}/${day}`;
    },
    parseYMD(ymd) {
      if (!ymd) return null;
      try {
        // 支持连字符和斜杠两种格式
        const parts = String(ymd).split(/[-/]/);
        // 更严格的检查：确保 parts 是数组且有 3 个元素
        if (!parts || !Array.isArray(parts) || parts.length !== 3) return null;
        // 确保所有部分都存在且非空（防止访问 null/undefined）
        if (!parts || typeof parts[0] === 'undefined' || typeof parts[1] === 'undefined' || typeof parts[2] === 'undefined') return null;
        if (!parts[0] || !parts[1] || !parts[2]) return null;
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = Number(parts[2]);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
        const dt = new Date(y, m - 1, d);
        // 防止 2025-02-31 之类被 Date 自动进位
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
        return dt;
      } catch (e) {
        console.error("parseYMD error:", e, "input:", ymd);
        return null;
      }
    },
    addDaysYMD(ymd, delta) {
      const base = this.parseYMD(ymd) || new Date();
      base.setDate(base.getDate() + delta);
      // 统一返回 YYYY-MM-DD 格式（与 YiPet 和新闻查询接口保持一致）
      const y = base.getFullYear();
      const m = String(base.getMonth() + 1).padStart(2, "0");
      const day = String(base.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    },
    todayYMD() {
      return this.formatYMD(new Date());
    },
  };

  const state = {
    tab: "all", // all
    q: "",
    selectedDate: "", // 选择的日期
    lastError: "", // 拉取数据失败时的提示
    view: "list", // list | chat | newsChat
    activeSessionId: "",
    activeNewsKey: "", // 当前激活的新闻 key
    isDraggingTag: false, // 标签拖拽排序中（用于抑制 click 触发筛选）
    faq: {
      items: [],
      loading: false,
      error: "",
      loadedAt: 0,
    },
    changelog: {
      manifest: null, // { current, generatedAt, releases }
      loading: false,
      error: "",
      loadedAt: 0,
    },
    filterDraft: {
      selectedTags: [], // 选中的标签数组
    },
    filter: {
      selectedTags: [], // 选中的标签数组
    },
    newsFilterDraft: {
      selectedTags: [], // 新闻筛选草稿：选中的标签数组
    },
    sessions: [],
    sessionsLoading: false,
    bottomTab: "sessions", // sessions | news
    chatSourceTab: null, // 记录进入聊天页面的来源标签页（sessions | news），用于返回时恢复
    news: {
      items: [],
      loading: false,
      error: "",
      isoDate: "", // 当前加载的 isoDate 范围：YYYY-MM-DD,YYYY-MM-DD
      loadedAt: 0,
      q: "", // 搜索关键词
      filter: {
        selectedTags: [], // 选中的标签数组
      },
      // 新闻聊天消息存储：key -> messages[]
      chatMessages: {},
    },
    auth: {
      token: "",
    },
    // 聊天 UI 状态（不持久化到接口，仅用于前端交互）
    chatUi: {
      // key -> true 表示已展开；未记录或 false 表示折叠（仅对“过长消息”生效）
      foldExpanded: {},
    },
  };

  // ---------- Chat fold state persistence ----------
  const CHAT_FOLD_STORAGE_KEY = "YiH5.chatFoldExpanded.v1";
  const CHAT_FOLD_STORAGE_MAX = 300; // 防止无限增长

  const loadChatFoldState = () => {
    try {
      const raw = localStorage.getItem(CHAT_FOLD_STORAGE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      const map = obj && typeof obj === "object" ? obj.foldExpanded : null;
      if (!map || typeof map !== "object") return {};
      // 允许 value 为 true/1/时间戳
      const next = {};
      for (const [k, v] of Object.entries(map)) {
        if (!k) continue;
        if (v) next[k] = v;
      }
      return next;
    } catch {
      return {};
    }
  };

  // 加载已读新闻列表
  const loadReadNews = () => {
    try {
      const raw = localStorage.getItem(NEWS_READ_STORAGE_KEY);
      if (!raw) return new Set();
      const obj = JSON.parse(raw);
      const keys = obj && typeof obj === "object" && Array.isArray(obj.keys) ? obj.keys : [];
      return new Set(keys.filter((k) => k && String(k).trim()));
    } catch {
      return new Set();
    }
  };

  // 保存已读新闻列表
  const saveReadNews = (readNewsSet) => {
    try {
      const keys = Array.from(readNewsSet).filter((k) => k && String(k).trim());
      localStorage.setItem(
        NEWS_READ_STORAGE_KEY,
        JSON.stringify({ v: 1, savedAt: Date.now(), keys }),
      );
    } catch {
      // ignore
    }
  };

  // 标记新闻为已读
  const markNewsAsRead = (newsKey) => {
    if (!newsKey) return;
    const readNews = loadReadNews();
    readNews.add(String(newsKey));
    saveReadNews(readNews);
  };

  const saveChatFoldState = (foldExpanded) => {
    try {
      const map = foldExpanded && typeof foldExpanded === "object" ? foldExpanded : {};
      const entries = Object.entries(map)
        .filter(([k, v]) => k && v)
        .map(([k, v]) => [k, Number.isFinite(Number(v)) ? Number(v) : 1]);

      // 优先保留“最近展开”的（时间戳大者优先）；没有时间戳的按 1 处理放后面
      entries.sort((a, b) => (Number(b[1]) || 1) - (Number(a[1]) || 1));
      const pruned = entries.slice(0, CHAT_FOLD_STORAGE_MAX);
      const next = Object.fromEntries(pruned);

      localStorage.setItem(
        CHAT_FOLD_STORAGE_KEY,
        JSON.stringify({ v: 1, savedAt: Date.now(), foldExpanded: next }),
      );
    } catch {
      // ignore
    }
  };

  const cssEscape = (s) => {
    const str = String(s ?? "");
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(str);
    // 简易兜底：足够应付我们自己生成的 key
    return str.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };

  const BOTTOM_TAB_KEY = "YiH5.bottomTab.v1";
  // 新闻 API 基础 URL（查询参数在构建请求时动态添加）
  const NEWS_API_BASE = "https://api.effiy.cn/mongodb/";
  const API_TOKEN_KEY = "YiH5.apiToken.v1";
  const APP_VERSION_KEY = "YiH5.appVersion.v1";
  const NEWS_READ_STORAGE_KEY = "YiH5.newsRead.v1";

  const getAuthHeaders = () => {
    const token = String(state.auth.token || "").trim();
    // 只校验 X-Token；其他字段可选（有就带上）
    if (!token) return {};
    return { "X-Token": token };
  };

  const loadAuthFromStorage = () => {
    try {
      state.auth.token = String(localStorage.getItem(API_TOKEN_KEY) || "").trim();
    } catch {
      // ignore
    }
  };

  const openAuth = () => {
    const curToken = String(state.auth.token || "").trim();
    const token = window.prompt("请输入 X-Token（用于访问 api.effiy.cn）", curToken);
    if (token == null) return;
    state.auth.token = String(token || "").trim();
    try {
      localStorage.setItem(API_TOKEN_KEY, state.auth.token);
    } catch {
      // ignore
    }
    // 配置完立即尝试刷新
    if (state.bottomTab === "news") fetchNews({ force: true });
    if (state.view === "chat") fetchFaqs({ force: true });
  };

  const getStoredAppVersion = () => {
    try {
      return String(localStorage.getItem(APP_VERSION_KEY) || "").trim();
    } catch {
      return "";
    }
  };

  const setStoredAppVersion = (v) => {
    try {
      localStorage.setItem(APP_VERSION_KEY, String(v || "").trim());
    } catch {
      // ignore
    }
  };

  const fetchVersionManifest = async () => {
    // 返回空版本信息
    const stored = getStoredAppVersion() || "";
    return { current: stored, generatedAt: "", releases: [] };
  };

  // 标签排序（本地持久化）
  const TAG_ORDER_KEY = "YiH5.tagOrder.v1";
  const DEFAULT_PINNED_TAGS = ["网文", "日记", "家庭", "工作", "工具"];

  const loadTagOrder = () => {
    try {
      const raw = localStorage.getItem(TAG_ORDER_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map((x) => String(x || "").trim()).filter(Boolean);
    } catch {
      return [];
    }
  };

  const saveTagOrder = (order) => {
    try {
      if (!Array.isArray(order)) return;
      const normalized = order.map((x) => String(x || "").trim()).filter(Boolean);
      localStorage.setItem(TAG_ORDER_KEY, JSON.stringify(normalized));
    } catch {
      // ignore
    }
  };

  const fmt = {
    time(ts) {
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    },
    compact(n) {
      if (n <= 0) return "";
      if (n < 100) return String(n);
      return "99+";
    },
  };

  const fetchSessions = async () => {
    if (state.sessionsLoading) return state.sessions;
    state.sessionsLoading = true;
    try {
      const response = await fetch("https://api.effiy.cn/session/", { headers: { ...getAuthHeaders() } });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // 处理API返回的数据，确保数据格式正确
      // 如果API返回的是数组，直接使用；如果是对象包含data字段，使用data字段
      const sessions = Array.isArray(data) ? data : (data.data || data.sessions || []);
      
      state.lastError = "";
      // 映射为页面使用的统一结构（兼容你提供的接口字段）
      const mappedSessions = sessions.map((s) => {
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
          // 如果后端返回了页面上下文字段，保留到会话对象上，供"页面上下文"使用
          pageContent: s.pageContent || s.content || "",
          messageCount,
          messages,
          createdAt,
          updatedAt,
          lastAccessTime,
          // 下面这些是本地 UI 状态（接口没有也没关系）
          muted: s.muted !== undefined ? !!s.muted : false,
          lastActiveAt,
        };
      });
      
      // 去重：根据会话ID去重，保留最新的会话（updatedAt最大的）
      const sessionMap = new Map();
      mappedSessions.forEach((session) => {
        const existing = sessionMap.get(session.id);
        if (!existing || session.updatedAt > existing.updatedAt) {
          sessionMap.set(session.id, session);
        }
      });
      
      state.sessions = Array.from(sessionMap.values());
    } catch (error) {
      console.error("获取会话列表失败:", error);
      // 如果API请求失败，使用空数组，避免应用崩溃
      state.sessions = [];
      // 页面内提示（避免 alert 打断体验）
      const isFile = location.protocol === "file:";
      state.lastError = isFile
        ? "获取会话列表失败：当前以 file:// 打开页面，跨域请求可能被浏览器拦截。建议用本地静态服务器打开再试。"
        : "获取会话列表失败：请稍后重试。";
    } finally {
      state.sessionsLoading = false;
    }
    return state.sessions;
  };

  const dom = {
    app: $("#app"),
    topbarLeft: $(".topbar__left"),
    topbarRight: $(".topbar__right"),
    dateNav: $(".topbar__dateNav"),
    datePicker: $("#datePicker"),
    prevDay: $("#prevDay"),
    nextDay: $("#nextDay"),
    chatTopTitle: $("#chatTopTitle"),
    chatTitle: $("#chatTitle"),
    q: $("#q"),
    clearQ: $("#clearQ"),
    chips: $("#chips"),
    list: $("#list"),
    empty: $("#empty"),
    sheetMask: $("#sheetMask"),
    sheet: $("#sheet"),
    pageSessions: $("#pageSessions"),
    pageChat: $("#pageChat"),
    chatMessages: $("#chatMessages"),
    chatComposer: $("#chatComposer"),
    chatInput: $("#chatInput"),
    faqBtn: $("#faqBtn"),
    openUrlBtn: $("#openUrlBtn"),
    changelogBtn: $("#changelogBtn"),
    faqSheetMask: $("#faqSheetMask"),
    faqSheet: $("#faqSheet"),
    faqList: $("#faqList"),
    faqEmpty: $("#faqEmpty"),
    changelogSheetMask: $("#changelogSheetMask"),
    changelogSheet: $("#changelogSheet"),
    changelogMeta: $("#changelogMeta"),
    changelogList: $("#changelogList"),
    changelogEmpty: $("#changelogEmpty"),
    contextSheetMask: $("#contextSheetMask"),
    contextSheet: $("#contextSheet"),
    contextContent: $("#contextContent"),
    pageDescSheetMask: $("#pageDescSheetMask"),
    pageDescSheet: $("#pageDescSheet"),
    pageDescContent: $("#pageDescContent"),
    pageNews: $("#pageNews"),
    newsSearchCard: $("#newsSearchCard"),
    newsQ: $("#newsQ"),
    clearNewsQ: $("#clearNewsQ"),
    newsChips: $("#newsChips"),
    newsList: $("#newsList"),
    newsEmpty: $("#newsEmpty"),
    bottomNav: $("#bottomNav"),
  };

  // 统一的可见性同步：确保「会话视图只显示会话」「新闻视图只显示新闻」
  const syncBottomNavActive = () => {
    if (!dom.bottomNav) return;
    $$(".bottomNav__item", dom.bottomNav).forEach((b) => {
      const tab = b.dataset.tab || "sessions";
      const isActive = tab === state.bottomTab;
      b.classList.toggle("is-active", isActive);
      if (isActive) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  };

  const syncVisibility = () => {
    const isSessions = state.bottomTab === "sessions";
    const isNews = state.bottomTab === "news";
    const isChat = isSessions && state.view === "chat";
    const isNewsChat = isNews && state.view === "newsChat";

    // 页面显示：三者互斥
    if (dom.pageNews) dom.pageNews.hidden = isSessions || isNewsChat;
    if (dom.pageSessions) dom.pageSessions.hidden = !isSessions || isChat;
    if (dom.pageChat) dom.pageChat.hidden = (!isSessions || !isChat) && (!isNews || !isNewsChat);

    // 样式与返回按钮：在"会话-聊天页"或"新闻-聊天页"生效
    if (isChat || isNewsChat) {
      dom.app.classList.add("is-chat");
      mountChatBackBtn();
    } else {
      dom.app.classList.remove("is-chat");
      unmountChatBackBtn();
    }
    
    // 删除会话按钮：只在会话聊天页显示
    if (isChat) {
      mountChatDeleteBtn();
    } else {
      unmountChatDeleteBtn();
    }
  };

  // ---------- News ----------
  const extractNewsList = (result) => {
    // YiPet: 数据在 result.data.list，同时返回 totalPages
    if (result && result.data && Array.isArray(result.data.list)) {
      return {
        list: result.data.list,
        totalPages: result.data.totalPages || 1
      };
    }
    // 兼容：直接数组
    if (Array.isArray(result)) {
      return { list: result, totalPages: 1 };
    }
    // 兼容：result.data 是数组
    if (result && Array.isArray(result.data)) {
      return { list: result.data, totalPages: 1 };
    }
    // 兼容：其它字段里有 list/items
    if (result && Array.isArray(result.list)) {
      return { list: result.list, totalPages: 1 };
    }
    if (result && Array.isArray(result.items)) {
      return { list: result.items, totalPages: 1 };
    }
    // 兜底：找第一个数组字段
    if (result && typeof result === 'object') {
      for (const k in result) {
        if (Array.isArray(result[k]) && result[k].length > 0) {
          return { list: result[k], totalPages: 1 };
        }
      }
    }
    return { list: [], totalPages: 1 };
  };

  const normalizeNewsItem = (n) => {
    const title = String(n?.title ?? "").trim() || "未命名新闻";
    const link = String(n?.link ?? "").trim();
    const description = String(n?.description ?? "").trim();
    const sourceName = String(n?.source_name ?? n?.sourceName ?? "").trim();
    const createdTime = String(n?.createdTime ?? "").trim();
    const published = String(n?.published ?? "").trim();
    const tags = Array.isArray(n?.tags) ? n.tags.map((t) => String(t || "").trim()).filter(Boolean) : [];
    const key = String(n?.key ?? n?._id ?? n?.id ?? link ?? title);
    // 如果新闻已有 sessionId 字段，保留它；否则根据 link 查找对应的会话
    const sessionId = n?.sessionId || null;
    // 检查是否已读
    const readNews = loadReadNews();
    const isRead = readNews.has(key);
    return { key, title, link, description, sourceName, createdTime, published, tags, sessionId, isRead };
  };

  // 统一渲染新闻条目（便于虚拟列表复用）
  // 支持渲染新闻项或会话项（当 fromNews 为 true 时）
  const renderNewsItem = (item) => {
    // 如果是会话项（从已读新闻转换来的）
    if (item.fromNews) {
      const mutedCls = item.muted ? " is-muted" : "";
      const displayTitle = (item.pageTitle && item.pageTitle.trim()) || item.title || "未命名会话";
      const displayDesc = (item.pageDescription && item.pageDescription.trim()) || item.preview || "—";
      const rawTags = Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [];
      const normTags = rawTags.map((t) => String(t || "").trim()).filter(Boolean);
      const displayTags = normTags.length ? normTags : ["无标签"];
      const tagBadges = displayTags
        .slice(0, 4)
        .map((t, idx) => {
          const colorCls = `is-sessionTag-${idx % 4}`;
          return `<span class="badge ${colorCls}">${escapeHtml(t)}</span>`;
        })
        .join("");
      
      // 消息数量badge（用于第一行）
      const messageBadge = item.messageCount > 0
        ? `<span class="badge">消息 ${escapeHtml(String(item.messageCount))}</span>`
        : `<span class="badge">暂无消息</span>`;
      
      // 格式化会话日期：yyyy-MM-dd（与会话列表保持一致）
      const ts = item.lastAccessTime || item.lastActiveAt || item.updatedAt;
      let displayDate = "—";
      if (ts) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          displayDate = dateUtil.formatYMD(d);
        }
      }
      
      return `
        <article class="newsItem newsItem--session${mutedCls}" data-id="${escapeHtml(item.id || "")}" data-news-key="${escapeHtml(item.newsKey || "")}">
          <div class="item__mid">
            <div class="item__row1">
              <div class="item__title">
                <span class="newsItem__icon" title="来自新闻">📰</span>
                <span>${escapeHtml(displayTitle)}</span>
              </div>
              <div class="item__meta">
                ${messageBadge}
              </div>
            </div>
            <div class="item__row2">
              <div class="item__preview">${escapeHtml(displayDesc)}</div>
            </div>
            <div class="item__row2" style="margin-top:6px">
              <div class="item__tags">${tagBadges}</div>
              <div class="item__meta">
                <span class="time">${escapeHtml(displayDate)}</span>
              </div>
            </div>
          </div>
        </article>
      `;
    }
    
    // 普通新闻项
    const tagBadges = (item.tags || [])
      .slice(0, 4)
      .map((t) => `<span class="badge is-green">${escapeHtml(t)}</span>`)
      .join("");
    
    // 格式化新闻日期：yyyy-MM-dd（与会话列表保持一致）
    let displayDate = "—";
    if (item.createdTime || item.published) {
      const ts = item.createdTime || item.published;
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        displayDate = dateUtil.formatYMD(d);
      }
    }
    
    const linkPart = item.link
      ? `<a class="newsTitleLink" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
      : `<span class="newsTitleLink">${escapeHtml(item.title)}</span>`;
    
    return `
      <article class="newsItem" data-key="${escapeHtml(item.key || "")}">
          <div class="item__mid">
            <div class="item__row1">
              <div class="item__title"><span>${linkPart}</span></div>
              <div class="item__meta">
                <span class="time">${escapeHtml(displayDate)}</span>
              </div>
            </div>
          ${item.description ? `<div class="item__row2">
            <div class="item__preview">${escapeHtml(item.description)}</div>
          </div>` : ""}
          <div class="item__row2" style="margin-top:${item.description ? '6px' : '0'}">
            <div class="item__tags">${tagBadges}</div>
            <div class="item__meta"></div>
          </div>
        </div>
      </article>
    `;
  };

  // ---------- 轻量虚拟列表（用于上下滑动性能优化；尤其 iOS 不支持 content-visibility 时效果明显） ----------
  const VLIST_MIN_ITEMS = 60;
  const vlist = {
    sessions: {
      enabled: false,
      container: null,
      items: [],
      render: null,
      itemHeight: 84, // 初始估计：与 contain-intrinsic-size 保持一致
      overscan: 10,
      start: -1,
      end: -1,
      raf: 0,
      force: false,
    },
    news: {
      enabled: false,
      container: null,
      items: [],
      render: null,
      itemHeight: 92, // 初始估计：与 contain-intrinsic-size 保持一致
      overscan: 10,
      start: -1,
      end: -1,
      raf: 0,
      force: false,
    },
  };

  const ensureVListDOM = (container) => {
    if (!container) return null;
    if (container.dataset.vlist !== "1") {
      container.dataset.vlist = "1";
      container.innerHTML = `
        <div class="vlist__spacer vlist__spacer--top"></div>
        <div class="vlist__items"></div>
        <div class="vlist__spacer vlist__spacer--bottom"></div>
      `;
    }
    return {
      top: container.querySelector(".vlist__spacer--top"),
      mid: container.querySelector(".vlist__items"),
      bottom: container.querySelector(".vlist__spacer--bottom"),
    };
  };

  const disableVList = (key) => {
    const v = vlist[key];
    if (!v) return;
    v.enabled = false;
    v.items = [];
    v.render = null;
    v.start = -1;
    v.end = -1;
    v.force = false;
    if (v.raf) {
      cancelAnimationFrame(v.raf);
      v.raf = 0;
    }
    if (v.container) {
      v.container.removeAttribute("data-vlist");
    }
  };

  const requestVListUpdate = (key, { force = false } = {}) => {
    const v = vlist[key];
    if (!v || !v.enabled) return;
    if (force) v.force = true;
    if (v.raf) return;
    v.raf = requestAnimationFrame(() => {
      v.raf = 0;
      renderVListSlice(key);
    });
  };

  const renderVListSlice = (key) => {
    const v = vlist[key];
    if (!v || !v.enabled || !v.container || typeof v.render !== "function") return;
    const container = v.container;
    const items = Array.isArray(v.items) ? v.items : [];
    const domParts = ensureVListDOM(container);
    if (!domParts) return;

    const { top, mid, bottom } = domParts;
    if (!top || !mid || !bottom) return;

    if (items.length === 0) {
      top.style.height = "0px";
      bottom.style.height = "0px";
      mid.innerHTML = "";
      v.start = 0;
      v.end = 0;
      v.force = false;
      return;
    }

    const itemHeight = Math.max(40, Number(v.itemHeight) || 80);
    const rect = container.getBoundingClientRect();
    const listTop = rect.top + window.scrollY;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    let start = Math.floor((viewportTop - listTop) / itemHeight) - v.overscan;
    let end = Math.ceil((viewportBottom - listTop) / itemHeight) + v.overscan;
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end)) end = items.length;
    start = Math.max(0, Math.min(items.length, start));
    end = Math.max(start, Math.min(items.length, end));

    if (!v.force && start === v.start && end === v.end) return;
    v.force = false;
    v.start = start;
    v.end = end;

    top.style.height = `${start * itemHeight}px`;
    bottom.style.height = `${(items.length - end) * itemHeight}px`;
    mid.innerHTML = items.slice(start, end).map(v.render).join("");

    // 动态测高：避免估算不准导致的间隔跳动
    requestAnimationFrame(() => {
      const first = mid.firstElementChild;
      const h = first && first.offsetHeight ? first.offsetHeight : 0;
      if (h && h > 40 && h < 420 && Math.abs(h - v.itemHeight) > 2) {
        v.itemHeight = h;
        requestVListUpdate(key, { force: true });
      }
    });
  };

  const getNewsIsoDateBySelectedDate = () => {
    // 确保日期格式为 YYYY-MM-DD（与 YiPet 保持一致）
    let ymd = state.selectedDate || dateUtil.todayYMD();
    // 如果日期格式是 YYYY/MM/DD，转换为 YYYY-MM-DD
    if (ymd.includes('/')) {
      ymd = ymd.replace(/\//g, '-');
    }
    return `${ymd},${ymd}`;
  };

  const fetchNews = async ({ force = false } = {}) => {
    const now = Date.now();
    const isoDate = getNewsIsoDateBySelectedDate();

    const isSameDate = state.news.isoDate === isoDate;
    const isFresh = state.news.loadedAt && now - state.news.loadedAt < 60 * 1000; // 1 分钟内不重复刷
    if (!force && isSameDate && isFresh && Array.isArray(state.news.items) && state.news.items.length > 0) {
      return state.news.items;
    }

    if (state.news.loading) return state.news.items;
    state.news.loading = true;
    state.news.error = "";
    renderNews();

    try {
      // 配置参数（与 YiPet 保持一致）
      const pageSize = 500; // 单次最多拉取条数
      const maxPages = 10; // 最多翻页次数，避免异常数据导致无限拉取
      const listFields = [
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

      // 构建第一页请求参数
      const params = new URLSearchParams();
      params.set('cname', 'rss');
      params.set('isoDate', isoDate);
      params.set('pageNum', '1');
      params.set('pageSize', String(pageSize));
      params.set('orderBy', 'updatedTime');
      params.set('orderType', 'desc');
      // 轻量列表：使用 fields 参数指定需要的字段
      params.set('fields', listFields.join(','));

      const firstPageUrl = `${NEWS_API_BASE}?${params.toString()}`;
      const resp = await fetch(firstPageUrl, { headers: { ...getAuthHeaders() } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const firstResult = await resp.json();
      
      // 提取第一页数据
      const extracted = extractNewsList(firstResult);
      let newsList = extracted.list || [];

      // 如果有分页信息，最多再拉若干页（仍然是轻量字段）
      const totalPages = Math.min(extracted.totalPages || 1, maxPages);
      if (!Array.isArray(firstResult) && totalPages > 1) {
        for (let page = 2; page <= totalPages; page++) {
          const p = new URLSearchParams(params);
          p.set('pageNum', String(page));
          const pageUrl = `${NEWS_API_BASE}?${p.toString()}`;
          const pageResp = await fetch(pageUrl, { headers: { ...getAuthHeaders() } });
          if (!pageResp.ok) {
            console.warn(`[YiH5] 获取第 ${page} 页新闻失败：HTTP ${pageResp.status}`);
            break;
          }
          const pageResult = await pageResp.json();
          const pageExtracted = extractNewsList(pageResult);
          if (pageExtracted.list && pageExtracted.list.length > 0) {
            newsList = newsList.concat(pageExtracted.list);
          } else {
            // 如果某一页没有数据，停止继续加载
            break;
          }
        }
      }

      // 如果仍然没有找到数据，输出警告
      if (newsList.length === 0) {
        console.warn('[YiH5] 未能从API返回数据中提取新闻列表');
      }

      const items = Array.isArray(newsList) ? newsList.map(normalizeNewsItem) : [];
      
      // 加载会话列表，检查哪些新闻已经转换为会话
      await fetchSessions();
      
      // 为每个新闻检查是否已有对应的会话
      items.forEach(newsItem => {
        if (newsItem.link) {
          // 使用新闻的 link 通过URL查找对应的会话
          const existingSession = findSessionByUrl(newsItem.link);
          if (existingSession) {
            // 如果找到会话，设置 sessionId 字段为会话的实际ID
            newsItem.sessionId = String(existingSession.id);
          }
        }
      });
      
      state.news.items = items;
      state.news.isoDate = isoDate;
      state.news.loadedAt = Date.now();
      state.news.error = "";
      return items;
    } catch (e) {
      console.warn("[YiH5] 获取新闻失败：", e);
      if (String(e?.message || "").includes("HTTP 401")) {
        state.news.error = "需要配置 API 鉴权（至少需要 X-Token）。请点右上角🔒设置。";
        state.news.items = [];
        return [];
      }
      const isFile = location.protocol === "file:";
      state.news.error = isFile
        ? "获取新闻失败：当前以 file:// 打开页面，跨域请求可能被浏览器拦截。建议用本地静态服务器打开再试。"
        : "获取新闻失败：请稍后重试。";
      state.news.items = [];
      return [];
    } finally {
      state.news.loading = false;
      renderNews();
    }
  };

  // 获取新闻的所有标签（用于筛选）
  const getNewsTags = () => {
    const allTags = new Set();
    state.news.items.forEach((n) => {
      if (Array.isArray(n.tags)) {
        n.tags.forEach((t) => {
          const tag = String(t || "").trim();
          if (tag) allTags.add(tag);
        });
      }
    });
    return Array.from(allTags).sort();
  };

  // 计算新闻标签数量
  const getNewsTagCount = (tag) => {
    return state.news.items.filter((n) => {
      const newsTags = Array.isArray(n.tags) ? n.tags.map((t) => String(t).trim()) : [];
      return newsTags.includes(tag);
    }).length;
  };

  // 计算新闻筛选标签（chips）
  const computeNewsChips = () => {
    const c = [];
    const f = state.news.filter;
    if (state.news.q.trim()) c.push({ key: "q", label: `搜索：${state.news.q.trim()}` });
    // 显示选中的标签
    f.selectedTags.forEach((tag) => {
      c.push({ key: `tag_${tag}`, label: tag, tagValue: tag });
    });
    return c;
  };

  // 新闻搜索和筛选
  const filterAndSortNews = () => {
    const q = state.news.q.trim().toLowerCase();
    const f = state.news.filter;
    let arr = state.news.items.slice();

    // 分离已读和未读新闻
    const unreadNews = [];
    const readNewsWithSessions = [];
    const addedSessionIds = new Set(); // 用于去重，避免同一会话重复显示

    arr.forEach((n) => {
      // 先检查新闻是否有对应的会话（无论是否已读）
      let session = null;
      let sessionIdToCheck = null;
      // 优先使用 sessionId 查找
      if (n.sessionId) {
        session = findSessionById(n.sessionId);
        if (session) {
          sessionIdToCheck = n.sessionId;
        }
      }
      // 如果通过 sessionId 找不到，尝试使用 link 通过URL查找
      if (!session && n.link) {
        session = findSessionByUrl(n.link);
        if (session) {
          // 使用会话的实际ID作为标识
          sessionIdToCheck = String(session.id);
        }
      }

      // 如果新闻有 sessionId 但找不到会话，清除 sessionId 和 isRead 状态
      if (n.sessionId && !session) {
        delete n.sessionId;
        n.isRead = false;
      }

      // 如果找到会话，显示会话（不显示新闻本身）
      if (session && sessionIdToCheck && !addedSessionIds.has(String(sessionIdToCheck))) {
        // 标记会话来自新闻，用于显示图标
        readNewsWithSessions.push({ ...session, fromNews: true, newsKey: n.key });
        addedSessionIds.add(String(sessionIdToCheck));
      } else {
        // 如果没有会话，根据已读状态决定是否显示新闻
        const isRead = n.isRead === true;
        if (!isRead) {
          // 未读且没有会话的新闻正常显示
          unreadNews.push(n);
        }
        // 已读且没有会话的新闻不显示
      }
    });

    // 合并未读新闻和已读新闻对应的会话
    arr = [...unreadNews, ...readNewsWithSessions];

    if (q) {
      arr = arr.filter((item) => {
        // 如果是会话（fromNews），搜索会话的标题和描述
        if (item.fromNews) {
          const hay = `${item.title || ""} ${item.pageTitle || ""} ${item.preview || ""} ${item.pageDescription || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
          return hay.includes(q);
        } else {
          // 如果是新闻，搜索新闻的标题、描述等
          const hay = `${item.title} ${item.description || ""} ${item.link || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
          return hay.includes(q);
        }
      });
    }

    // 标签筛选：如果选中了标签，必须包含至少一个选中的标签
    if (f.selectedTags.length > 0) {
      arr = arr.filter((item) => {
        const itemTags = Array.isArray(item.tags) ? item.tags.map((t) => String(t).trim()) : [];
        return f.selectedTags.some((selectedTag) => itemTags.includes(selectedTag));
      });
    }

    // 按创建时间倒序排序（会话使用 lastAccessTime 或 updatedAt）
    arr.sort((a, b) => {
      let timeA, timeB;
      if (a.fromNews) {
        // 会话使用 lastAccessTime 或 updatedAt
        timeA = new Date(a.lastAccessTime || a.updatedAt || a.createdAt || 0).getTime();
      } else {
        // 新闻使用 createdTime 或 published
        timeA = new Date(a.createdTime || a.published || 0).getTime();
      }
      if (b.fromNews) {
        timeB = new Date(b.lastAccessTime || b.updatedAt || b.createdAt || 0).getTime();
      } else {
        timeB = new Date(b.createdTime || b.published || 0).getTime();
      }
      return timeB - timeA;
    });
    return arr;
  };

  // 渲染新闻筛选标签（chips）
  const renderNewsChips = () => {
    if (!dom.newsChips) return;
    const chips = computeNewsChips();
    dom.newsChips.innerHTML = chips
      .map(
        (c) => `
          <span class="chip" data-chip="${c.key}">
            <span>${escapeHtml(c.label)}</span>
            <button class="chip__x" type="button" aria-label="移除" data-action="removeNewsChip" data-key="${c.key}" ${c.tagValue ? `data-tag-value="${escapeHtml(c.tagValue)}"` : ''}>×</button>
          </span>
        `,
      )
      .join("");
  };

  const renderNews = () => {
    if (!dom.newsList || !dom.newsEmpty) return;

    if (state.news.loading) {
      disableVList("news");
      dom.newsEmpty.hidden = false;
      dom.newsEmpty.querySelector(".empty__title")?.replaceChildren(document.createTextNode("加载中…"));
      dom.newsEmpty.querySelector(".empty__desc")?.replaceChildren(document.createTextNode("正在获取新闻列表"));
      dom.newsList.innerHTML = "";
      renderNewsChips();
      return;
    }

    if (state.news.error) {
      disableVList("news");
      dom.newsEmpty.hidden = false;
      dom.newsEmpty.querySelector(".empty__title")?.replaceChildren(document.createTextNode("加载失败"));
      dom.newsEmpty.querySelector(".empty__desc")?.replaceChildren(document.createTextNode(state.news.error));
      dom.newsList.innerHTML = "";
      renderNewsChips();
      return;
    }

    const filteredItems = filterAndSortNews();
    renderNewsChips();

    dom.newsEmpty.hidden = filteredItems.length !== 0;
    dom.newsEmpty.querySelector(".empty__title")?.replaceChildren(document.createTextNode("暂无匹配新闻"));
    dom.newsEmpty.querySelector(".empty__desc")?.replaceChildren(document.createTextNode("试试清空搜索或调整筛选条件"));

    // 长列表：启用虚拟列表减少 DOM 数量，滚动更顺滑（尤其 iOS/低端机）
    if (filteredItems.length >= VLIST_MIN_ITEMS) {
      const v = vlist.news;
      v.enabled = true;
      v.container = dom.newsList;
      v.items = filteredItems;
      v.render = renderNewsItem;
      v.start = -1;
      v.end = -1;
      // 先同步出骨架，避免短暂显示旧内容
      const parts = ensureVListDOM(v.container);
      if (parts?.top) parts.top.style.height = "0px";
      if (parts?.bottom) parts.bottom.style.height = "0px";
      if (parts?.mid) parts.mid.innerHTML = "";
      requestVListUpdate("news", { force: true });
      return;
    }
    disableVList("news");
    dom.newsList.innerHTML = filteredItems.map(renderNewsItem).join("");
  };

  const setBottomTab = async (tab, { persist = true } = {}) => {
    const next = tab === "news" ? "news" : "sessions";
    state.bottomTab = next;
    // 切到新闻时不应残留会话聊天态
    if (next === "news") {
      state.view = "list";
      state.activeSessionId = "";
    }
    // 切到会话时不应残留新闻聊天态
    if (next === "sessions") {
      state.view = "list";
      state.activeNewsKey = "";
    }

    syncBottomNavActive();
    syncVisibility();

    if (persist) {
      try {
        localStorage.setItem(BOTTOM_TAB_KEY, next);
      } catch {
        // ignore
      }
    }

    if (next === "news") {
      renderNews();
      await fetchNews({ force: false });
    } else {
      // 回到会话页，按当前路由渲染
      applyRoute();
    }
  };

  // ---------- FAQ ----------
  const FAQ_API_URL =
    "https://api.effiy.cn/mongodb/?cname=faqs&orderBy=order&orderType=asc";

  const extractFaqList = (result) => {
    // YiPet: 数据在 result.data.list
    if (result && result.data && Array.isArray(result.data.list)) return result.data.list;
    // 兼容：直接数组
    if (Array.isArray(result)) return result;
    // 兼容：result.data 是数组
    if (result && Array.isArray(result.data)) return result.data;
    // 兼容：其它字段里有 list/items
    if (result && Array.isArray(result.list)) return result.list;
    if (result && Array.isArray(result.items)) return result.items;
    return [];
  };

  const normalizeFaqs = (list) => {
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

  const fetchFaqs = async ({ force = false } = {}) => {
    if (state.faq.loading) return state.faq.items;
    const now = Date.now();
    const isFresh = state.faq.loadedAt && now - state.faq.loadedAt < 5 * 60 * 1000;
    if (!force && isFresh && state.faq.items.length > 0) return state.faq.items;

    state.faq.loading = true;
    state.faq.error = "";
    renderFaqSheet();
    try {
      const resp = await fetch(FAQ_API_URL, { headers: { ...getAuthHeaders() } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const result = await resp.json();
      const list = extractFaqList(result);
      state.faq.items = normalizeFaqs(list);
      state.faq.loadedAt = Date.now();
      state.faq.error = "";
      return state.faq.items;
    } catch (e) {
      console.warn("[YiH5] 获取常见问题失败：", e);
      if (String(e?.message || "").includes("HTTP 401")) {
        state.faq.error = "需要配置 API 鉴权（至少需要 X-Token）。请点右上角🔒设置。";
        state.faq.items = [];
        return [];
      }
      const isFile = location.protocol === "file:";
      state.faq.error = isFile
        ? "获取常见问题失败：当前以 file:// 打开页面，跨域请求可能被浏览器拦截。建议用本地静态服务器打开再试。"
        : "获取常见问题失败：请稍后重试。";
      state.faq.items = [];
      return [];
    } finally {
      state.faq.loading = false;
      renderFaqSheet();
    }
  };

  const renderFaqSheet = () => {
    if (!dom.faqList || !dom.faqEmpty) return;
    if (state.faq.loading) {
      dom.faqEmpty.hidden = false;
      dom.faqEmpty.textContent = "加载中…";
      dom.faqList.innerHTML = "";
      return;
    }
    if (state.faq.error) {
      dom.faqEmpty.hidden = false;
      dom.faqEmpty.textContent = state.faq.error;
      dom.faqList.innerHTML = "";
      return;
    }
    const items = Array.isArray(state.faq.items) ? state.faq.items : [];
    dom.faqEmpty.hidden = items.length !== 0;
    dom.faqEmpty.textContent = "暂无常见问题";
    dom.faqList.innerHTML = items
      .map(
        (faq) => `
          <button
            type="button"
            class="faqItem"
            data-action="insertFaq"
            data-faq-text="${escapeHtml(faq.text)}"
            title="点击插入"
          >${escapeHtml(faq.text)}</button>
        `,
      )
      .join("");
  };

  // ---------- 页面上下文 ----------
  const renderContextSheet = () => {
    if (!dom.contextContent) return;
    const s = findSessionById(state.activeSessionId);
    if (!s) {
      dom.contextContent.innerHTML = `
        <div class="contextSection">
          <div class="contextValue">请返回会话列表重新选择一个会话后再试。</div>
        </div>
      `;
      return;
    }

    const content = String(s.pageContent || "").trim();
    if (!content) {
      dom.contextContent.innerHTML = `
        <div class="contextSection">
          <div class="contextValue">当前会话没有保存任何 pageContent 内容。</div>
        </div>
      `;
      return;
    }

    const contentHtml = renderMarkdown(content);
    dom.contextContent.innerHTML = `
      <div class="contextSection">
        <div class="contextValue">${contentHtml}</div>
      </div>
    `;
  };

  const openContext = async () => {
    if (!dom.contextSheet || !dom.contextSheetMask) return;
    
    const sessionId = state.activeSessionId;
    if (!sessionId) {
      window.alert("请先在会话列表中选择一个会话，再使用页面上下文功能。");
      return;
    }
    
    // 先显示弹层
    dom.contextSheetMask.hidden = false;
    dom.contextSheet.classList.add("is-open");
    dom.contextSheet.setAttribute("aria-hidden", "false");
    
    // 检查当前会话是否有 pageContent，如果没有则尝试从后端获取
    const s = findSessionById(sessionId);
    if (!s || !s.pageContent || String(s.pageContent).trim() === "") {
      // 显示加载状态
      if (dom.contextContent) {
        dom.contextContent.innerHTML = `
          <div class="contextSection">
            <div class="contextValue">正在加载页面上下文...</div>
          </div>
        `;
      }
      // 尝试从后端获取最新的会话详情
      await fetchSessionDetail(sessionId);
    }
    
    // 渲染上下文内容
    renderContextSheet();
  };

  const closeContext = () => {
    if (!dom.contextSheet || !dom.contextSheetMask) return;
    dom.contextSheet.classList.remove("is-open");
    dom.contextSheet.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dom.contextSheet.classList.contains("is-open")) dom.contextSheetMask.hidden = true;
    }, 220);
  };

  // ---------- 页面描述（pageDescription） ----------
  const renderPageDescSheet = () => {
    if (!dom.pageDescContent) return;
    const s = findSessionById(state.activeSessionId);
    if (!s) {
      dom.pageDescContent.innerHTML = `
        <div class="contextSection">
          <div class="contextValue">请返回会话列表重新选择一个会话后再试。</div>
        </div>
      `;
      return;
    }

    const content = String(s.pageDescription || "").trim();
    if (!content) {
      dom.pageDescContent.innerHTML = `
        <div class="contextSection">
          <div class="contextValue">当前会话暂无 pageDescription，可点击「✨ 智能生成」根据页面上下文生成（≤200字）。</div>
        </div>
      `;
      return;
    }

    const contentHtml = renderMarkdown(content);
    dom.pageDescContent.innerHTML = `
      <div class="contextSection">
        <div class="contextValue">${contentHtml}</div>
      </div>
    `;
  };

  const openPageDescription = () => {
    if (!dom.pageDescSheet || !dom.pageDescSheetMask) return;
    dom.pageDescSheetMask.hidden = false;
    dom.pageDescSheet.classList.add("is-open");
    dom.pageDescSheet.setAttribute("aria-hidden", "false");
    renderPageDescSheet();
  };

  const closePageDescription = () => {
    if (!dom.pageDescSheet || !dom.pageDescSheetMask) return;
    dom.pageDescSheet.classList.remove("is-open");
    dom.pageDescSheet.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dom.pageDescSheet.classList.contains("is-open")) dom.pageDescSheetMask.hidden = true;
    }, 220);
  };

  // 统一的 Prompt 调用封装（参考 YiPet）
  const PROMPT_API_URL = "https://api.effiy.cn/prompt/";
  // 默认大模型：切换为 deepseek-r1:32b
  const DEFAULT_MODEL = "deepseek-r1:32b";

  // 构建 prompt 请求 payload（与 YiPet 保持一致）
  // 目标结构：
  // { fromSystem, fromUser, model, conversation_id }
  const buildPromptPayload = (fromSystem, fromUser, modelId = DEFAULT_MODEL) => {
    const sys = String(fromSystem || "").trim();
    const usr = String(fromUser || "").trim();
    const payload = {
      fromSystem: sys,
      fromUser: usr,
      model: modelId || DEFAULT_MODEL,
    };

    // 与 YiPet 一致：尽量携带会话 ID，便于后端做上下文/连续会话处理
    const conversationId = String(state?.activeSessionId || "").trim();
    if (conversationId) payload.conversation_id = conversationId;

    return payload;
  };

  const callPromptOnce = async (systemPrompt, userPrompt) => {
    const payload = buildPromptPayload(systemPrompt, userPrompt, DEFAULT_MODEL);
    const resp = await fetch(PROMPT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    // 后端可能返回 JSON，也可能返回 SSE 文本，这里做兼容处理
    const text = await resp.text();
    if (!text) return "";

    // 统一去除大模型的 think / 思考过程（参考 YiPet 的“只展示最终内容”的体验）
    // 兼容常见格式：
    // 1) <think> ... </think>
    // 2) ```think ... ```
    const stripThink = (raw) => {
      let s = String(raw || "");
      // <think>...</think>
      s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
      // ```think ... ```
      s = s.replace(/```think[\s\S]*?```/gi, "");
      return s.trim();
    };

    // 优先尝试 JSON
    try {
      const obj = JSON.parse(text);
      const content =
        obj?.content ||
        obj?.data ||
        obj?.message?.content ||
        (Array.isArray(obj?.choices) ? obj.choices.map((c) => c.message?.content || c.delta?.content || "").join("") : "");
      if (content) return stripThink(content);
    } catch {
      // ignore, 可能是 SSE 或纯文本
    }

    // SSE 兼容（形如多行 "data: {...}"）
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

    // 兜底：当作纯文本返回
    return stripThink(text);
  };

  // 统一清洗大模型返回的优化文本（参考 YiPet，做轻量处理，保留 Markdown）
  const cleanOptimizedText = (rawText) => {
    let text = String(rawText || "").trim();
    if (!text) return text;

    // 去掉首尾可能的引号
    const quotePairs = [
      ['"', '"'],
      ["'", "'"],
      ["“", "”"],
      ["‘", "’"],
      ["「", "」"],
      ["『", "』"],
      ["《", "》"],
    ];

    for (const [startQuote, endQuote] of quotePairs) {
      if (text.startsWith(startQuote) && text.endsWith(endQuote)) {
        text = text.slice(startQuote.length, -endQuote.length).trim();
        break;
      }
    }

    // 去掉模型常见的前缀说明文案
    const prefixes = [
      "优化后：",
      "优化后内容：",
      "优化后描述：",
      "优化后的内容：",
      "优化后的描述：",
      "以下是优化后的内容：",
      "下面是优化后的内容：",
      "以下是优化后的描述：",
      "下面是优化后的描述：",
    ];

    for (const prefix of prefixes) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
        break;
      }
    }

    return text.trim();
  };

  const ensureActiveSessionForContext = () => {
    const sessionId = state.activeSessionId;
    if (!sessionId) {
      window.alert("请先在会话列表中选择一个会话，再使用页面上下文功能。");
      return null;
    }
    const s = findSessionById(sessionId);
    if (!s) {
      window.alert("找不到当前会话，请返回列表后重试。");
      return null;
    }
    return s;
  };

  const ensureActiveSessionForPageDesc = () => {
    const sessionId = state.activeSessionId;
    if (!sessionId) {
      window.alert("请先在会话列表中选择一个会话，再使用页面描述功能。");
      return null;
    }
    const s = findSessionById(sessionId);
    if (!s) {
      window.alert("找不到当前会话，请返回列表后重试。");
      return null;
    }
    return s;
  };

  const withButtonLoading = async (btn, loadingText, fn) => {
    if (!btn) return fn();
    const originalText = btn.textContent;
    const originalDisabled = btn.disabled;
    btn.disabled = true;
    if (loadingText) btn.textContent = loadingText;
    btn.style.opacity = "0.6";
    btn.style.cursor = "not-allowed";
    try {
      return await fn();
    } finally {
      btn.disabled = originalDisabled;
      btn.textContent = originalText;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  };

  // 生成页面描述：清洗 + 单行化 + 截断到指定字数
  const normalizeGeneratedDescription = (rawText, maxChars = 200) => {
    let text = cleanOptimizedText(rawText);
    if (!text) return "";
    // 单行化：把换行/多空白压缩成一个空格，避免列表/段落导致预览体验差
    text = String(text).replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length <= maxChars) return text;
    // 严格控制在 maxChars 以内（不额外加省略号，避免超限）
    return text.slice(0, maxChars).trim();
  };

  const optimizePageContext = async () => {
    const s = ensureActiveSessionForContext();
    if (!s) return;
    const current = String(s.pageContent || "").trim();
    if (!current) {
      window.alert("当前会话没有可优化的页面上下文内容（pageContent）。");
      return;
    }
    const btn = document.querySelector('button[data-action="optimizePageContext"]');

    await withButtonLoading(btn, "优化中...", async () => {
      const systemPrompt = `你是一个专业的网页内容整理和文案优化专家，擅长：
1. 在不改变核心含义的前提下，优化表达，让句子更简洁、自然、易读
2. 合理调整段落结构，让重点更突出、层次更清晰
3. 尽量保留原有的 Markdown 结构（标题、列表、代码块等）
4. 避免主观评价和无关扩写，只做必要的润色和结构优化

请根据下面提供的网页上下文内容进行语言和结构优化。`;

      const userPrompt = `请在尽量保持原有结构和 Markdown 格式的前提下，优化下面的网页上下文，使其更通顺、重点更突出，适合作为 AI 的参考上下文：

${current.substring(0, 4000)}

请直接返回优化后的完整文本，不要添加任何额外说明、前后缀标题或引号。`;

      const result = await callPromptOnce(systemPrompt, userPrompt);
      const cleaned = cleanOptimizedText(result);
      if (!cleaned || cleaned === current) {
        window.alert("文本已经是最优状态，无需优化。");
        return;
      }
      s.pageContent = cleaned;
      renderContextSheet();
    });
  };

  const translatePageContext = async (targetLanguage) => {
    const s = ensureActiveSessionForContext();
    if (!s) return;
    const originalText = String(s.pageContent || "").trim();
    if (!originalText) {
      window.alert("当前会话没有可翻译的页面上下文内容（pageContent）。");
      return;
    }

    const btnSelector =
      targetLanguage === "zh"
        ? 'button[data-action="translatePageContextZh"]'
        : 'button[data-action="translatePageContextEn"]';
    const btn = document.querySelector(btnSelector);
    const langName = targetLanguage === "zh" ? "中文" : "英文";

    await withButtonLoading(btn, "翻译中...", async () => {
      const systemPrompt = `你是一个专业的网页内容翻译助手，擅长：
1. 在严格保留原文含义和关键信息的前提下进行中英文互译
2. 尽量保留原有的 Markdown 结构（标题、列表、代码块等）
3. 让译文表达自然流畅、易读，语气与原文一致
4. 不添加任何解释性内容或额外段落

请根据下面提供的网页上下文内容，将其精准翻译成${langName}。`;

      const userPrompt = `请将下面的网页上下文内容翻译成${langName}，要求：
1. 保留原有 Markdown 结构
2. 保持原意和语气不变
3. 不添加任何说明文字或额外内容

原文：

${originalText}

请直接返回翻译后的完整文本，不要添加任何额外说明、前后缀标题或引号。`;
      const result = await callPromptOnce(systemPrompt, userPrompt);
      const cleaned = cleanOptimizedText(result);
      if (!cleaned || cleaned === originalText) {
        window.alert("翻译结果与原文几乎没有差异，已保持原内容。");
        return;
      }
      s.pageContent = cleaned;
      renderContextSheet();
    });
  };

  const savePageContext = async () => {
    const s = ensureActiveSessionForContext();
    if (!s) return;

    const content = String(s.pageContent || "").trim();
    if (!content) {
      window.alert("当前会话没有可保存的页面上下文内容（pageContent）。");
      return;
    }

    const btn = document.querySelector('button[data-action="savePageContext"]');
    await withButtonLoading(btn, "保存中...", async () => {
      // 本地已经直接用 s.pageContent，列表展示暂不依赖 pageContent，这里主要是同步到后端
      try {
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

        const payload = {
          id: String(s.id),
          url: s.url || "",
          pageTitle: (s.pageTitle && String(s.pageTitle).trim()) || s.title || "",
          pageDescription: (s.pageDescription && String(s.pageDescription).trim()) || s.preview || "",
          pageContent: content,
          tags: Array.isArray(s.tags) ? s.tags : [],
          createdAt: s.createdAt || now,
          updatedAt: s.updatedAt || now,
          lastAccessTime: s.lastAccessTime || now,
          messages: messagesForBackend,
        };

        const resp = await fetch("https://api.effiy.cn/session/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          console.warn("[YiH5] 保存页面上下文到后端失败：HTTP", resp.status);
          window.alert("保存失败，请稍后重试。");
          return;
        }

        closeContext();
      } catch (e) {
        console.warn("[YiH5] 保存页面上下文到后端失败：", e);
        window.alert("保存失败，请检查网络或鉴权配置。");
      }
    });
  };

  const generatePageDescription = async () => {
    const s = ensureActiveSessionForPageDesc();
    if (!s) return;
    const btn = document.querySelector('button[data-action="generatePageDescription"]');

    await withButtonLoading(btn, "生成中...", async () => {
      // 生成依赖 pageContent；若本地为空则尝试拉取最新会话详情
      let pageContent = String(s.pageContent || "").trim();
      if (!pageContent) {
        const sessionId = String(state.activeSessionId || "").trim();
        if (dom.pageDescContent) {
          dom.pageDescContent.innerHTML = `
            <div class="contextSection">
              <div class="contextValue">正在加载页面上下文（pageContent）...</div>
            </div>
          `;
        }
        if (sessionId) await fetchSessionDetail(sessionId);
        pageContent = String((findSessionById(state.activeSessionId) || s).pageContent || "").trim();
      }

      if (!pageContent) {
        window.alert("当前会话没有可用的页面上下文（pageContent），无法智能生成页面描述。");
        renderPageDescSheet();
        return;
      }

      const title = String(s.pageTitle || s.title || "").trim();
      const url = String(s.url || "").trim();
      const tags = Array.isArray(s.tags) ? s.tags.map((t) => String(t).trim()).filter(Boolean) : [];

      const systemPrompt = `你是一个专业的“页面描述（pageDescription）”生成助手。
你的任务：根据提供的页面上下文内容（pageContent）生成一段简洁、客观、可读的中文页面描述，用于帮助 AI 快速把握页面要点。
硬性要求：
1) 只输出描述正文，不要标题/列表/引用/前后缀说明
2) 不编造、不补充上下文中不存在的信息
3) 总长度不超过 200 个汉字（含标点）`;

      const userPrompt = `请基于以下信息生成页面描述（≤200字）：

页面标题：${title || "（无）"}
页面 URL：${url || "（无）"}
标签：${tags.length ? tags.join("、") : "（无）"}

页面上下文（pageContent，可能包含 Markdown/正文片段）：
${pageContent.substring(0, 6000)}

请直接返回最终描述正文。`;

      const result = await callPromptOnce(systemPrompt, userPrompt);
      const generated = normalizeGeneratedDescription(result, 200);
      if (!generated) {
        window.alert("生成失败：未得到有效的页面描述内容，请稍后重试。");
        renderPageDescSheet();
        return;
      }

      s.pageDescription = generated;
      s.preview = generated;
      renderPageDescSheet();
    });
  };

  const translatePageDescription = async (targetLanguage) => {
    const s = ensureActiveSessionForPageDesc();
    if (!s) return;
    const originalText = String(s.pageDescription || "").trim();
    if (!originalText) {
      window.alert("当前会话没有可翻译的页面描述内容（pageDescription）。");
      return;
    }

    const btnSelector =
      targetLanguage === "zh"
        ? 'button[data-action="translatePageDescriptionZh"]'
        : 'button[data-action="translatePageDescriptionEn"]';
    const btn = document.querySelector(btnSelector);
    const langName = targetLanguage === "zh" ? "中文" : "英文";

    await withButtonLoading(btn, "翻译中...", async () => {
      const systemPrompt = `你是一个专业的页面描述翻译助手，擅长：
1. 在严格保留原文关键信息和核心含义的前提下进行中英文互译
2. 让译文简介清晰、自然流畅，适合作为页面摘要或说明
3. 保持客观中立的语气，不添加主观评价
4. 不添加任何解释性内容或额外段落

请根据下面提供的页面描述，将其精准翻译成${langName}。`;

      const userPrompt = `请将下面的页面描述翻译成${langName}，要求：
1. 保持原意和语气不变
2. 表达自然流畅，适合作为页面简介
3. 不添加任何说明文字或额外内容

原文：

${originalText}

请直接返回翻译后的完整页面描述，不要添加任何额外说明、前后缀标题或引号。`;
      const result = await callPromptOnce(systemPrompt, userPrompt);
      const cleaned = cleanOptimizedText(result);
      if (!cleaned || cleaned === originalText) {
        window.alert("翻译结果与原文几乎没有差异，已保持原内容。");
        return;
      }

      s.pageDescription = cleaned;
      s.preview = cleaned;
      renderPageDescSheet();
    });
  };

  const savePageDescription = async () => {
    const s = ensureActiveSessionForPageDesc();
    if (!s) return;

    const content = String(s.pageDescription || "").trim();
    if (!content) {
      window.alert("当前会话没有可保存的页面描述内容（pageDescription）。");
      return;
    }

    const btn = document.querySelector('button[data-action="savePageDescription"]');
    await withButtonLoading(btn, "保存中...", async () => {
      try {
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

        const pageContentToSend = String(s.pageContent || "").trim();
        const payload = {
          id: String(s.id),
          url: s.url || "",
          pageTitle: (s.pageTitle && String(s.pageTitle).trim()) || s.title || "",
          pageDescription: content,
          // 注意：仅在本地确实有 pageContent 时才一起带上，避免用空值覆盖后端已有页面上下文
          pageContent: pageContentToSend || undefined,
          tags: Array.isArray(s.tags) ? s.tags : [],
          createdAt: s.createdAt || now,
          updatedAt: s.updatedAt || now,
          lastAccessTime: s.lastAccessTime || now,
          messages: messagesForBackend,
        };

        const resp = await fetch("https://api.effiy.cn/session/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          console.warn("[YiH5] 保存页面描述到后端失败：HTTP", resp.status);
          window.alert("保存失败，请稍后重试。");
          return;
        }

        s.preview = content;
        closePageDescription();
      } catch (e) {
        console.warn("[YiH5] 保存页面描述到后端失败：", e);
        window.alert("保存失败，请检查网络或鉴权配置。");
      }
    });
  };

  const openFaq = async () => {
    if (!dom.faqSheet || !dom.faqSheetMask) return;
    dom.faqSheetMask.hidden = false;
    dom.faqSheet.classList.add("is-open");
    dom.faqSheet.setAttribute("aria-hidden", "false");
    renderFaqSheet();
    await fetchFaqs();
  };

  // ---------- Changelog / Version history ----------
  const renderChangelogSheet = () => {
    if (!dom.changelogList || !dom.changelogMeta || !dom.changelogEmpty) return;
    const loading = !!state.changelog.loading;
    const err = String(state.changelog.error || "").trim();
    const m = state.changelog.manifest;
    const current = String(m?.current || getStoredAppVersion() || "").trim();
    const generatedAt = String(m?.generatedAt || "").trim();

    dom.changelogMeta.innerHTML = `
      <div class="changelogMeta__row">
        <span class="changelogMeta__k">当前版本</span>
        <span class="changelogMeta__v">${current ? escapeHtml(current) : "—"}</span>
      </div>
      ${generatedAt ? `<div class="changelogMeta__row"><span class="changelogMeta__k">构建时间</span><span class="changelogMeta__v">${escapeHtml(generatedAt)}</span></div>` : ""}
      <div class="changelogMeta__row">
        <span class="changelogMeta__k">${loading ? "状态" : err ? "状态" : "操作"}</span>
        <span class="changelogMeta__v">
          ${
            loading
              ? "加载中…"
              : err
                ? `<span style="color:var(--danger);font-weight:700">${escapeHtml(err)}</span>`
                : `<button type="button" class="topbar__link" style="padding:6px 8px" data-action="refreshChangelog">刷新</button>`
          }
        </span>
      </div>
    `;

    const releases = Array.isArray(m?.releases) ? m.releases : [];
    if (!releases.length) {
      dom.changelogList.innerHTML = "";
      dom.changelogEmpty.hidden = false;
      return;
    }
    dom.changelogEmpty.hidden = true;

    dom.changelogList.innerHTML = releases
      .map((r) => {
        const ver = escapeHtml(String(r.version || "").trim());
        const date = escapeHtml(String(r.date || "").trim());
        const title = String(r.title || "").trim();
        const changes = Array.isArray(r.changes) ? r.changes : [];
        const notes = String(r.notes || "").trim();
        const changesHtml = changes.length
          ? `<ul class="release__changes">
              ${changes
                .map((c) => {
                  const t = escapeHtml(String(c.type || "变更"));
                  const txt = escapeHtml(String(c.text || ""));
                  if (!txt) return "";
                  return `<li class="release__change"><span class="release__tag">${t}</span><span class="release__text">${txt}</span></li>`;
                })
                .join("")}
            </ul>`
          : "";
        const notesHtml = notes ? `<div class="release__notes chatBubble--md">${renderMarkdown(notes)}</div>` : "";

        return `
          <article class="release">
            <div class="release__head">
              <div class="release__ver">v${ver}</div>
              <div class="release__date">${date || ""}</div>
            </div>
            ${title ? `<div class="release__title">${escapeHtml(title)}</div>` : ""}
            ${changesHtml}
            ${notesHtml}
          </article>
        `;
      })
      .join("");

    // 支持 notes 中的 Mermaid
    renderMermaidIn(dom.changelogList);
  };

  const refreshChangelog = async ({ force = false } = {}) => {
    if (state.changelog.loading) return;
    if (!force && state.changelog.manifest && Date.now() - (state.changelog.loadedAt || 0) < 30 * 1000) {
      renderChangelogSheet();
      return;
    }
    state.changelog.loading = true;
    state.changelog.error = "";
    renderChangelogSheet();
    try {
      const m = await fetchVersionManifest();
      state.changelog.manifest = m;
      state.changelog.loadedAt = Date.now();
    } catch (e) {
      state.changelog.error = "加载失败，请稍后重试。";
      console.warn("[YiH5] 更新日志加载失败：", e);
    } finally {
      state.changelog.loading = false;
      renderChangelogSheet();
    }
  };

  const openChangelog = async () => {
    if (!dom.changelogSheet || !dom.changelogSheetMask) return;
    dom.changelogSheetMask.hidden = false;
    dom.changelogSheet.classList.add("is-open");
    dom.changelogSheet.setAttribute("aria-hidden", "false");
    renderChangelogSheet();
    await refreshChangelog({ force: true });
  };

  const closeChangelog = () => {
    if (!dom.changelogSheet || !dom.changelogSheetMask) return;
    dom.changelogSheet.classList.remove("is-open");
    dom.changelogSheet.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dom.changelogSheet.classList.contains("is-open")) dom.changelogSheetMask.hidden = true;
    }, 220);
  };

  const openUrl = () => {
    // 优先检查新闻聊天页面
    if (state.view === "newsChat" && state.activeNewsKey) {
      const n = findNewsByKey(state.activeNewsKey);
      if (!n) {
        window.alert("找不到当前新闻，请返回列表后重试。");
        return;
      }
      const url = String(n.link || "").trim();
      if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        window.alert("当前新闻没有有效的URL。");
        return;
      }
      // 在新标签页中打开URL
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        console.warn("[YiH5] 打开URL失败：", e);
        window.alert("无法打开URL，请检查URL格式是否正确。");
      }
      return;
    }
    
    // 检查会话聊天页面
    const s = findSessionById(state.activeSessionId);
    if (!s) {
      window.alert("找不到当前会话，请返回列表后重试。");
      return;
    }
    const url = String(s.url || "").trim();
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      window.alert("当前会话没有有效的URL。");
      return;
    }
    // 在新标签页中打开URL
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.warn("[YiH5] 打开URL失败：", e);
      window.alert("无法打开URL，请检查URL格式是否正确。");
    }
  };

  const closeFaq = () => {
    if (!dom.faqSheet || !dom.faqSheetMask) return;
    dom.faqSheet.classList.remove("is-open");
    dom.faqSheet.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dom.faqSheet.classList.contains("is-open")) dom.faqSheetMask.hidden = true;
    }, 220);
  };

  // 将 FAQ 文本追加到当前会话消息中，并调用 session/save 接口
  const appendFaqToSessionAndSave = async (text) => {
    const toInsert = String(text ?? "").trim();
    if (!toInsert) return;

    const sessionId = state.activeSessionId;
    if (!sessionId) {
      window.alert("请先在会话列表中选择一个会话，再使用常见问题。");
      return;
    }

    const s = findSessionById(sessionId);
    if (!s) {
      window.alert("找不到当前会话，请返回列表后重试。");
      return;
    }

    if (!Array.isArray(s.messages)) s.messages = [];

    const now = Date.now();
    // 追加用户消息
    s.messages.push({ role: "user", content: toInsert, ts: now });
    s.messageCount = s.messages.length;
    s.lastActiveAt = now;
    s.lastAccessTime = now;
    s.updatedAt = now;
    s.preview = toInsert;

    // 先本地更新 UI
    renderChat();
    // 关闭 FAQ 弹层
    closeFaq();

    // 构造与 YiPet 后端兼容的会话保存数据，并调用 https://api.effiy.cn/session/save
    try {
      const messagesForBackend = (s.messages || []).map((m) => {
        const role = normalizeRole(m); // 'user' | 'assistant'
        return {
          type: role === "user" ? "user" : "pet",
          content: normalizeText(m),
          timestamp: m.ts || m.timestamp || Date.now(),
          imageDataUrl: m.imageDataUrl || m.image || undefined,
        };
      });

      const payload = {
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

      const resp = await fetch("https://api.effiy.cn/session/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        console.warn("[YiH5] 保存会话到后端失败：HTTP", resp.status);
        return;
      }

      const data = await resp.json().catch(() => null);
      console.log("[YiH5] FAQ 已追加并保存到后端:", data);
    } catch (e) {
      console.warn("[YiH5] 调用 session/save 保存会话失败：", e);
    }
  };

  // 返回按钮：只在聊天页挂载（首页不渲染也不提供功能）
  let chatBackBtnEl = null;
  const ensureChatBackBtn = () => {
    if (chatBackBtnEl) return chatBackBtnEl;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "iconbtn topbar__backBtn";
    btn.setAttribute("aria-label", "返回");
    btn.title = "返回";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.7 6.7a1 1 0 0 1 0 1.4L10.8 12l3.9 3.9a1 1 0 1 1-1.4 1.4l-4.6-4.6a1 1 0 0 1 0-1.4l4.6-4.6a1 1 0 0 1 1.4 0Z"/>
      </svg>
    `;
    btn.addEventListener("click", async () => {
      // 根据进入聊天页面的来源标签页，切换回对应的标签页
      if (state.chatSourceTab && state.chatSourceTab !== state.bottomTab) {
        await setBottomTab(state.chatSourceTab, { persist: false });
      }
      // 返回到列表（避免退回到站点外部历史记录）
      navigateToList();
    });
    chatBackBtnEl = btn;
    return chatBackBtnEl;
  };

  const mountChatBackBtn = () => {
    if (!dom.topbarLeft) return;
    const btn = ensureChatBackBtn();
    if (!btn.isConnected) dom.topbarLeft.prepend(btn);
  };

  const unmountChatBackBtn = () => {
    if (chatBackBtnEl?.isConnected) chatBackBtnEl.remove();
  };

  // 删除会话按钮：只在会话聊天页挂载
  let chatDeleteBtnEl = null;
  const ensureChatDeleteBtn = () => {
    if (chatDeleteBtnEl) return chatDeleteBtnEl;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "iconbtn";
    btn.setAttribute("aria-label", "删除会话");
    btn.title = "删除会话";
    btn.setAttribute("data-action", "deleteSession");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    `;
    chatDeleteBtnEl = btn;
    return chatDeleteBtnEl;
  };

  const mountChatDeleteBtn = () => {
    if (!dom.topbarRight) return;
    // 只在会话聊天页面显示，不在新闻聊天页面显示
    if (state.view === "chat" && state.bottomTab === "sessions") {
      const btn = ensureChatDeleteBtn();
      if (!btn.isConnected) {
        // 插入到刷新按钮之前
        const refreshBtn = document.getElementById("refreshBtn");
        if (refreshBtn && refreshBtn.parentNode) {
          refreshBtn.parentNode.insertBefore(btn, refreshBtn);
        } else {
          dom.topbarRight.appendChild(btn);
        }
      }
    }
  };

  const unmountChatDeleteBtn = () => {
    if (chatDeleteBtnEl?.isConnected) chatDeleteBtnEl.remove();
  };

  const findSessionById = (id) => state.sessions.find((s) => String(s.id) === String(id));
  
  // 通过URL查找会话（用于新闻关联）
  const findSessionByUrl = (url) => {
    if (!url) return null;
    const urlStr = String(url).trim();
    // 先通过id查找（可能id就是url）
    let session = findSessionById(urlStr);
    if (session) return session;
    // 再通过url字段查找
    session = state.sessions.find((s) => String(s.url || "").trim() === urlStr);
    return session || null;
  };

  const findNewsByKey = (key) => state.news.items.find((n) => String(n.key) === String(key));

  const normalizeRole = (m) => {
    const r = String(m?.role ?? m?.sender ?? m?.type ?? "").toLowerCase();
    if (r === "user" || r === "me") return "user";
    if (r === "assistant" || r === "bot" || r === "ai" || r === "pet") return "assistant";
    // 兜底：如果接口没有 role，优先把 user 字段当用户消息
    if (m?.isUser === true) return "user";
    return "assistant";
  };

  const normalizeText = (m) => String(m?.content ?? m?.text ?? m?.message ?? "").trim();

  // 滚动聊天消息到底部
  const scrollChatToBottom = (smooth = false) => {
    if (!dom.chatMessages) return;
    const scrollToBottom = () => {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    };
    if (smooth) {
      dom.chatMessages.scrollTo({
        top: dom.chatMessages.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      // 使用多种方式确保滚动成功
      requestAnimationFrame(() => {
        scrollToBottom();
        // 再次确保滚动（处理异步内容加载）
        setTimeout(scrollToBottom, 0);
      });
    }
  };

  const renderChat = () => {
    const s = findSessionById(state.activeSessionId);
    if (!s) {
      dom.chatMessages.innerHTML = `<div class="empty" style="background:transparent;box-shadow:none">
        <div class="empty__icon">💬</div>
        <div class="empty__title">找不到该会话</div>
        <div class="empty__desc">请返回会话列表重试</div>
      </div>`;
      // 找不到会话时隐藏"打开原文"按钮
      if (dom.openUrlBtn) {
        dom.openUrlBtn.hidden = true;
      }
      return;
    }

    const title = (s.pageTitle && s.pageTitle.trim()) || s.title || "会话";
    dom.chatTitle.textContent = title;

    // 控制"打开原文"按钮的显示/隐藏：如果URL以http开头则显示
    const url = String(s.url || "").trim();
    const shouldShowOpenUrlBtn = url && (url.startsWith("http://") || url.startsWith("https://"));
    if (dom.openUrlBtn) {
      dom.openUrlBtn.hidden = !shouldShowOpenUrlBtn;
    }

    const msgs = Array.isArray(s.messages) ? s.messages.filter(m => m != null) : [];
    if (msgs.length === 0) {
      // 显示欢迎消息
      const welcomeHtml = createWelcomeMessageHtml(s);
      dom.chatMessages.innerHTML = `
        <div class="chatMsg chatMsg--bot" data-welcome-message="true">
          <div class="chatMsgContentRow">
            <div class="chatAvatar" aria-hidden="true">AI</div>
            <div class="chatBubbleWrap">
              <div class="chatBubble chatBubble--md">${welcomeHtml}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // 在第一条消息前显示欢迎消息
      const welcomeHtml = createWelcomeMessageHtml(s);
      dom.chatMessages.innerHTML = `
        <div class="chatMsg chatMsg--bot" data-welcome-message="true">
          <div class="chatMsgContentRow">
            <div class="chatAvatar" aria-hidden="true">AI</div>
            <div class="chatBubbleWrap">
              <div class="chatBubble chatBubble--md">${welcomeHtml}</div>
            </div>
          </div>
        </div>
      ` + msgs
        .map((m, idx) => {
          // 确保消息对象有效
          if (!m || typeof m !== 'object') return '';
          const role = normalizeRole(m);
          const text = normalizeText(m);
          const isMe = role === "user";
          const cls = isMe ? "chatMsg chatMsg--me" : "chatMsg chatMsg--bot";
          const avatar = isMe ? "我" : "AI";
          const imageDataUrl = m.imageDataUrl || m.image || "";
          
          // 构建消息内容
          let contentHtml = "";
          if (imageDataUrl) {
            contentHtml += `<div class="chatImage" style="max-width: 200px; margin-bottom: 6px;">
              <img src="${escapeHtml(imageDataUrl)}" alt="图片" style="max-width: 100%; border-radius: 4px;" />
            </div>`;
          }
          if (text) {
            contentHtml += `
              <div class="chatBubbleWrap">
                <div class="chatBubble chatBubble--md">${renderMarkdown(text)}</div>
              </div>
            `;
          }
          if (!imageDataUrl && !text) {
            contentHtml = `<div class="chatBubble">…</div>`;
          }
          
          // 格式化时间戳（包含日期）
          const timestamp = m.ts || m.timestamp || Date.now();
          let timeStr = '';
          if (timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // 判断是否是今天、昨天或其他日期
            if (msgDate.getTime() === today.getTime()) {
              // 今天：只显示时间
              timeStr = date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
            } else if (msgDate.getTime() === yesterday.getTime()) {
              // 昨天：显示"昨天 时间"
              timeStr = '昨天 ' + date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
            } else {
              // 其他日期：显示"月日 时间"
              const month = date.getMonth() + 1;
              const day = date.getDate();
              const time = date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
              timeStr = `${month}月${day}日 ${time}`;
            }
          }
          
          // 操作按钮容器（时间在第一行，按钮在第二行）
          const actionsHtml = `
            <div class="chatMsgTimeActions" data-message-index="${idx}">
              <div class="chatMsgTime">${timeStr}</div>
              <div class="chatMsgActions">
                <button class="chatMsgActionBtn chatMsgActionBtn--sort" data-action="move-up" title="上移" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
                <button class="chatMsgActionBtn chatMsgActionBtn--sort" data-action="move-down" title="下移" ${idx === msgs.length - 1 ? 'disabled' : ''}>⬇️</button>
                <button class="chatMsgActionBtn" data-action="copy" title="复制">📋</button>
                ${isMe ? `<button class="chatMsgActionBtn chatMsgActionBtn--prompt" data-action="send-prompt" title="发送到 AI" data-message-index="${idx}">
                  <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 16px; height: 16px; fill: currentColor;">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>` : ''}
                <button class="chatMsgActionBtn chatMsgActionBtn--delete" data-action="delete" title="删除" data-message-index="${idx}">
                  <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 16px; height: 16px; fill: currentColor;">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
          `;
          
          return `
            <div class="${cls}" data-message-index="${idx}">
              <div class="chatMsgContentRow">
                ${isMe ? "" : `<div class="chatAvatar" aria-hidden="true">${avatar}</div>`}
                ${contentHtml}
                ${isMe ? `<div class="chatAvatar" aria-hidden="true">${avatar}</div>` : ""}
              </div>
              ${actionsHtml}
            </div>
          `;
        })
        .join("");
    }

    // 滚到底
    scrollChatToBottom();

    // Mermaid 渲染（异步，不阻塞首屏）
    setTimeout(() => {
      renderMermaidIn(dom.chatMessages);
      // Mermaid 渲染完成后再次滚动到底部（内容高度可能变化）
      scrollChatToBottom();
    }, 0);

    // 为消息操作按钮添加事件监听器
    setTimeout(() => {
      setupMessageActions(dom.chatMessages, s);
    }, 0);
  };

  const renderNewsChat = () => {
    const n = findNewsByKey(state.activeNewsKey);
    if (!n) {
      dom.chatMessages.innerHTML = `<div class="empty" style="background:transparent;box-shadow:none">
        <div class="empty__icon">📰</div>
        <div class="empty__title">找不到该新闻</div>
        <div class="empty__desc">请返回新闻列表重试</div>
      </div>`;
      // 找不到新闻时隐藏"打开原文"按钮
      if (dom.openUrlBtn) {
        dom.openUrlBtn.hidden = true;
      }
      return;
    }

    const title = n.title || "新闻";
    dom.chatTitle.textContent = title;

    // 控制"打开原文"按钮的显示/隐藏：如果link以http开头则显示
    const url = String(n.link || "").trim();
    const shouldShowOpenUrlBtn = url && (url.startsWith("http://") || url.startsWith("https://"));
    if (dom.openUrlBtn) {
      dom.openUrlBtn.hidden = !shouldShowOpenUrlBtn;
    }

    // 获取新闻聊天消息
    const msgs = Array.isArray(state.news.chatMessages[state.activeNewsKey]) 
      ? state.news.chatMessages[state.activeNewsKey].filter(m => m != null) 
      : [];

    if (msgs.length === 0) {
      dom.chatMessages.innerHTML = `<div class="empty" style="background:transparent;box-shadow:none">
        <div class="empty__icon">🗨️</div>
        <div class="empty__title">暂无消息</div>
        <div class="empty__desc">发送一条消息开始聊天</div>
      </div>`;
    } else {
      dom.chatMessages.innerHTML = msgs
        .map((m, idx) => {
          // 确保消息对象有效
          if (!m || typeof m !== 'object') return '';
          const role = normalizeRole(m);
          const text = normalizeText(m);
          const isMe = role === "user";
          const cls = isMe ? "chatMsg chatMsg--me" : "chatMsg chatMsg--bot";
          const avatar = isMe ? "我" : "AI";
          const imageDataUrl = m.imageDataUrl || m.image || "";
          
          // 构建消息内容
          let contentHtml = "";
          if (imageDataUrl) {
            contentHtml += `<div class="chatImage" style="max-width: 200px; margin-bottom: 6px;">
              <img src="${escapeHtml(imageDataUrl)}" alt="图片" style="max-width: 100%; border-radius: 4px;" />
            </div>`;
          }
          if (text) {
            contentHtml += `
              <div class="chatBubbleWrap">
                <div class="chatBubble chatBubble--md">${renderMarkdown(text)}</div>
              </div>
            `;
          }
          if (!imageDataUrl && !text) {
            contentHtml = `<div class="chatBubble">…</div>`;
          }
          
          // 格式化时间戳（包含日期）
          const timestamp = m.ts || m.timestamp || Date.now();
          let timeStr = '';
          if (timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // 判断是否是今天、昨天或其他日期
            if (msgDate.getTime() === today.getTime()) {
              // 今天：只显示时间
              timeStr = date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
            } else if (msgDate.getTime() === yesterday.getTime()) {
              // 昨天：显示"昨天 时间"
              timeStr = '昨天 ' + date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
            } else {
              // 其他日期：显示"月日 时间"
              const month = date.getMonth() + 1;
              const day = date.getDate();
              const time = date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
              timeStr = `${month}月${day}日 ${time}`;
            }
          }
          
          // 操作按钮容器（时间在第一行，按钮在第二行）
          const actionsHtml = `
            <div class="chatMsgTimeActions" data-message-index="${idx}">
              <div class="chatMsgTime">${timeStr}</div>
              <div class="chatMsgActions">
                <button class="chatMsgActionBtn chatMsgActionBtn--sort" data-action="move-up" title="上移" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
                <button class="chatMsgActionBtn chatMsgActionBtn--sort" data-action="move-down" title="下移" ${idx === msgs.length - 1 ? 'disabled' : ''}>⬇️</button>
                <button class="chatMsgActionBtn" data-action="copy" title="复制">📋</button>
                <button class="chatMsgActionBtn chatMsgActionBtn--delete" data-action="delete" title="删除" data-message-index="${idx}">
                  <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 16px; height: 16px; fill: currentColor;">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
          `;
          
          return `
            <div class="${cls}" data-message-index="${idx}">
              <div class="chatMsgContentRow">
                ${isMe ? "" : `<div class="chatAvatar" aria-hidden="true">${avatar}</div>`}
                ${contentHtml}
                ${isMe ? `<div class="chatAvatar" aria-hidden="true">${avatar}</div>` : ""}
              </div>
              ${actionsHtml}
            </div>
          `;
        })
        .join("");
    }

    // 滚到底
    scrollChatToBottom();

    // Mermaid 渲染（异步，不阻塞首屏）
    setTimeout(() => {
      renderMermaidIn(dom.chatMessages);
      // Mermaid 渲染完成后再次滚动到底部（内容高度可能变化）
      scrollChatToBottom();
    }, 0);

    // 为消息操作按钮添加事件监听器（新闻聊天消息操作）
    setTimeout(() => {
      setupNewsChatMessageActions(dom.chatMessages, n);
    }, 0);
  };

  // 设置消息操作按钮功能
  const setupMessageActions = (container, session) => {
    if (!container || !session) return;

    // 移除旧的事件监听器（如果存在）
    if (container._messageActionsSetup) {
      container.removeEventListener('click', container._messageActionsSetup);
    }

    // 创建统一的事件处理函数
    const handleMessageActions = async (e) => {
      // 复制功能
      const copyBtn = e.target.closest('[data-action="copy"]');
      if (copyBtn) {
        e.stopPropagation();
        const msgDiv = copyBtn.closest('.chatMsg');
        if (!msgDiv) return;

        try {
          // 获取消息内容
          const bubble = msgDiv.querySelector('.chatBubble--md') || msgDiv.querySelector('.chatBubble');
          if (!bubble) return;

          // 获取原始文本内容（去除 HTML 标签）
          let messageContent = bubble.textContent || bubble.innerText || '';
          
          // 如果没有文本内容，尝试从消息数据中获取
          if (!messageContent.trim()) {
            const msgIndex = parseInt(msgDiv.getAttribute('data-message-index') || '-1');
            if (msgIndex >= 0 && session.messages && session.messages[msgIndex]) {
              messageContent = normalizeText(session.messages[msgIndex]);
            }
          }

          if (!messageContent.trim()) {
            showToast('消息内容为空，无法复制');
            return;
          }

          // 复制到剪贴板
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(messageContent.trim());
            showToast('已复制到剪贴板');
            
            // 临时改变按钮图标
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓';
            copyBtn.style.color = '#4caf50';
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.style.color = '';
            }, 1000);
          } else {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = messageContent.trim();
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('已复制到剪贴板');
            
            // 临时改变按钮图标
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓';
            copyBtn.style.color = '#4caf50';
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.style.color = '';
            }, 1000);
          }
        } catch (error) {
          console.error('复制失败:', error);
          showToast('复制失败，请重试');
        }
        return;
      }

      // 上移消息
      const moveUpBtn = e.target.closest('[data-action="move-up"]');
      if (moveUpBtn && !moveUpBtn.disabled) {
        e.stopPropagation();
        const msgDiv = moveUpBtn.closest('.chatMsg');
        if (!msgDiv) return;

        const currentIndex = parseInt(msgDiv.getAttribute('data-message-index') || '-1');
        if (currentIndex <= 0) return;

        await moveMessageUp(session, currentIndex, container);
        return;
      }

      // 下移消息
      const moveDownBtn = e.target.closest('[data-action="move-down"]');
      if (moveDownBtn && !moveDownBtn.disabled) {
        e.stopPropagation();
        const msgDiv = moveDownBtn.closest('.chatMsg');
        if (!msgDiv) return;

        const currentIndex = parseInt(msgDiv.getAttribute('data-message-index') || '-1');
        if (currentIndex < 0 || !session.messages || currentIndex >= session.messages.length - 1) return;

        await moveMessageDown(session, currentIndex, container);
        return;
      }

      // 发送 prompt 接口
      const sendPromptBtn = e.target.closest('[data-action="send-prompt"]');
      if (sendPromptBtn) {
        e.stopPropagation();
        const msgDiv = sendPromptBtn.closest('.chatMsg');
        if (!msgDiv) return;

        const msgIndex = parseInt(sendPromptBtn.getAttribute('data-message-index') || '-1');
        if (msgIndex < 0 || !session.messages || !session.messages[msgIndex]) return;

        await handleSendPrompt(session, msgIndex, sendPromptBtn);
        return;
      }

      // 删除消息
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.stopPropagation();
        e.preventDefault();
        
        // 防止重复点击
        if (deleteBtn.disabled || deleteBtn.dataset.deleting === 'true') {
          return;
        }
        
        const msgDiv = deleteBtn.closest('.chatMsg');
        if (!msgDiv) return;

        // 重新获取最新的会话对象，避免使用闭包中可能过时的引用
        const currentSession = findSessionById(state.activeSessionId);
        if (!currentSession) {
          console.warn("[YiH5] 删除消息失败：找不到当前会话", { activeSessionId: state.activeSessionId });
          showToast('找不到当前会话，请刷新页面重试');
          return;
        }

        const msgIndex = parseInt(deleteBtn.getAttribute('data-message-index') || '-1');
        if (msgIndex < 0 || !currentSession.messages || !currentSession.messages[msgIndex]) {
          console.warn("[YiH5] 删除消息失败：无效的索引", { msgIndex, messagesLength: currentSession.messages?.length, sessionId: currentSession.id });
          showToast('消息索引无效，请刷新页面重试');
          return;
        }

        // 确认删除
        if (!confirm('确定要删除这条消息吗？')) {
          return;
        }

        // 标记为正在删除，防止重复点击
        deleteBtn.disabled = true;
        deleteBtn.dataset.deleting = 'true';
        const originalHTML = deleteBtn.innerHTML;
        deleteBtn.innerHTML = '...';
        deleteBtn.style.opacity = '0.5';

        try {
          console.log("[YiH5] 开始删除消息", { msgIndex, sessionId: currentSession.id, messagesLength: currentSession.messages.length });
          await deleteMessage(currentSession, msgIndex, container);
          console.log("[YiH5] 删除消息完成", { sessionId: currentSession.id, messagesLength: currentSession.messages.length });
        } catch (error) {
          console.error("[YiH5] 删除消息时发生错误", error);
          showToast('删除消息时发生错误：' + (error.message || '未知错误'));
        } finally {
          // 恢复按钮状态（如果消息还在）
          if (deleteBtn.isConnected) {
            deleteBtn.disabled = false;
            deleteBtn.dataset.deleting = 'false';
            deleteBtn.innerHTML = originalHTML;
            deleteBtn.style.opacity = '';
          }
        }
        return;
      }
    };

    // 保存事件处理函数引用，以便后续移除
    container._messageActionsSetup = handleMessageActions;
    container.addEventListener('click', handleMessageActions);

    // 更新所有按钮的禁用状态
    updateMessageActionButtons(container);
  };

  // 设置新闻聊天消息操作按钮功能
  const setupNewsChatMessageActions = (container, news) => {
    if (!container || !news) return;

    // 移除旧的事件监听器（如果存在）
    if (container._newsChatMessageActionsSetup) {
      container.removeEventListener('click', container._newsChatMessageActionsSetup);
    }

    // 创建统一的事件处理函数
    const handleMessageActions = async (e) => {
      // 复制功能
      const copyBtn = e.target.closest('[data-action="copy"]');
      if (copyBtn) {
        e.stopPropagation();
        const msgDiv = copyBtn.closest('.chatMsg');
        if (!msgDiv) return;

        try {
          // 获取消息内容
          const bubble = msgDiv.querySelector('.chatBubble--md') || msgDiv.querySelector('.chatBubble');
          if (!bubble) return;

          // 获取原始文本内容（去除 HTML 标签）
          let messageContent = bubble.textContent || bubble.innerText || '';
          
          // 如果没有文本内容，尝试从消息数据中获取
          if (!messageContent.trim()) {
            const msgIndex = parseInt(msgDiv.getAttribute('data-message-index') || '-1');
            const msgs = state.news.chatMessages[state.activeNewsKey] || [];
            if (msgIndex >= 0 && msgs[msgIndex]) {
              messageContent = normalizeText(msgs[msgIndex]);
            }
          }

          if (!messageContent.trim()) {
            showToast('消息内容为空，无法复制');
            return;
          }

          // 复制到剪贴板
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(messageContent.trim());
            showToast('已复制到剪贴板');
            
            // 临时改变按钮图标
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓';
            copyBtn.style.color = '#4caf50';
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.style.color = '';
            }, 1000);
          } else {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = messageContent.trim();
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('已复制到剪贴板');
            
            // 临时改变按钮图标
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓';
            copyBtn.style.color = '#4caf50';
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.style.color = '';
            }, 1000);
          }
        } catch (error) {
          console.error('复制失败:', error);
          showToast('复制失败，请重试');
        }
        return;
      }

      // 删除消息
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.stopPropagation();
        e.preventDefault();
        
        // 防止重复点击
        if (deleteBtn.disabled || deleteBtn.dataset.deleting === 'true') {
          return;
        }
        
        const msgDiv = deleteBtn.closest('.chatMsg');
        if (!msgDiv) return;

        const msgIndex = parseInt(deleteBtn.getAttribute('data-message-index') || '-1');
        const msgs = state.news.chatMessages[state.activeNewsKey] || [];
        
        if (msgIndex < 0 || !msgs || !msgs[msgIndex]) {
          console.warn("[YiH5] 删除新闻消息失败：无效的索引", { msgIndex, messagesLength: msgs?.length });
          showToast('消息索引无效，请刷新页面重试');
          return;
        }

        // 确认删除
        if (!confirm('确定要删除这条消息吗？')) {
          return;
        }

        // 标记为正在删除，防止重复点击
        deleteBtn.disabled = true;
        deleteBtn.dataset.deleting = 'true';
        const originalHTML = deleteBtn.innerHTML;
        deleteBtn.innerHTML = '...';
        deleteBtn.style.opacity = '0.5';

        try {
          // 删除消息
          msgs.splice(msgIndex, 1);
          
          // 重新渲染
          renderNewsChat();
          
          showToast('消息已删除');
        } catch (error) {
          console.error("[YiH5] 删除新闻消息时发生错误", error);
          showToast('删除消息时发生错误：' + (error.message || '未知错误'));
        } finally {
          // 恢复按钮状态（如果消息还在）
          if (deleteBtn.isConnected) {
            deleteBtn.disabled = false;
            deleteBtn.dataset.deleting = 'false';
            deleteBtn.innerHTML = originalHTML;
            deleteBtn.style.opacity = '';
          }
        }
        return;
      }
    };

    // 保存事件处理函数引用，以便后续移除
    container._newsChatMessageActionsSetup = handleMessageActions;
    container.addEventListener('click', handleMessageActions);
  };

  // 上移消息
  const moveMessageUp = async (session, currentIndex, container) => {
    if (!session.messages || currentIndex <= 0 || currentIndex >= session.messages.length) return;

    // 获取所有消息元素
    const allMessages = Array.from(container.querySelectorAll('.chatMsg'));
    if (currentIndex >= allMessages.length) return;

    const currentMsgDiv = allMessages[currentIndex];
    const previousMsgDiv = allMessages[currentIndex - 1];
    
    if (!currentMsgDiv || !previousMsgDiv) return;

    // 保存当前滚动位置
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;

    // 先交换数组中的位置
    const temp = session.messages[currentIndex];
    session.messages[currentIndex] = session.messages[currentIndex - 1];
    session.messages[currentIndex - 1] = temp;

    // 在DOM中交换位置（添加动画效果）
    currentMsgDiv.style.transition = 'transform 0.3s ease';
    previousMsgDiv.style.transition = 'transform 0.3s ease';
    
    // 使用 insertBefore 交换位置
    container.insertBefore(currentMsgDiv, previousMsgDiv);

    // 更新所有消息的 data-message-index 属性
    const updatedMessages = Array.from(container.querySelectorAll('.chatMsg'));
    updatedMessages.forEach((msgDiv, index) => {
      msgDiv.setAttribute('data-message-index', index);
      // 更新内部的时间操作容器的 data-message-index
      const timeActions = msgDiv.querySelector('.chatMsgTimeActions');
      if (timeActions) {
        timeActions.setAttribute('data-message-index', index);
      }
    });

    // 更新会话时间戳
    session.updatedAt = Date.now();

    // 更新所有按钮状态
    updateMessageActionButtons(container);

    // 恢复滚动位置（保持相对位置）
    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - scrollHeight;
      container.scrollTop = scrollTop + scrollDiff;
    });

    // 尝试同步到后端
    try {
      const sessionId = session._id || session.id;
      if (sessionId) {
        await fetch(`https://api.effiy.cn/session/${encodeURIComponent(sessionId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            messages: session.messages,
          }),
        });
      }
    } catch (error) {
      console.error('同步消息顺序失败:', error);
    }
  };

  // 下移消息
  const moveMessageDown = async (session, currentIndex, container) => {
    if (!session.messages || currentIndex < 0 || currentIndex >= session.messages.length - 1) return;

    // 获取所有消息元素
    const allMessages = Array.from(container.querySelectorAll('.chatMsg'));
    if (currentIndex >= allMessages.length - 1) return;

    const currentMsgDiv = allMessages[currentIndex];
    const nextMsgDiv = allMessages[currentIndex + 1];
    
    if (!currentMsgDiv || !nextMsgDiv) return;

    // 保存当前滚动位置
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;

    // 先交换数组中的位置
    const temp = session.messages[currentIndex];
    session.messages[currentIndex] = session.messages[currentIndex + 1];
    session.messages[currentIndex + 1] = temp;

    // 在DOM中交换位置（添加动画效果）
    currentMsgDiv.style.transition = 'transform 0.3s ease';
    nextMsgDiv.style.transition = 'transform 0.3s ease';
    
    // 使用 insertBefore 交换位置（将当前消息插入到下一个消息之后）
    currentMsgDiv.remove();
    if (nextMsgDiv.nextSibling) {
      container.insertBefore(currentMsgDiv, nextMsgDiv.nextSibling);
    } else {
      container.appendChild(currentMsgDiv);
    }

    // 更新所有消息的 data-message-index 属性
    const updatedMessages = Array.from(container.querySelectorAll('.chatMsg'));
    updatedMessages.forEach((msgDiv, index) => {
      msgDiv.setAttribute('data-message-index', index);
      // 更新内部的时间操作容器的 data-message-index
      const timeActions = msgDiv.querySelector('.chatMsgTimeActions');
      if (timeActions) {
        timeActions.setAttribute('data-message-index', index);
      }
    });

    // 更新会话时间戳
    session.updatedAt = Date.now();

    // 更新所有按钮状态
    updateMessageActionButtons(container);

    // 恢复滚动位置（保持相对位置）
    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - scrollHeight;
      container.scrollTop = scrollTop + scrollDiff;
    });

    // 尝试同步到后端
    try {
      const sessionId = session._id || session.id;
      if (sessionId) {
        await fetch(`https://api.effiy.cn/session/${encodeURIComponent(sessionId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            messages: session.messages,
          }),
        });
      }
    } catch (error) {
      console.error('同步消息顺序失败:', error);
    }
  };

  // 构建会话上下文（参考 YiPet 项目）
  const buildConversationContext = (session, currentMsgIndex) => {
    const context = {
      messages: [],
      pageContent: '',
      hasHistory: false
    };

    if (!session) return context;

    // 获取消息历史（排除当前消息）
    if (session.messages && Array.isArray(session.messages) && session.messages.length > 0) {
      context.messages = session.messages
        .filter((msg, index) => {
          // 只包含当前消息之前的消息，排除当前消息本身
          if (index >= currentMsgIndex) return false;
          const role = normalizeRole(msg);
          return role === 'user' || role === 'assistant';
        });
      context.hasHistory = context.messages.length > 0;
    }

    // 获取页面内容
    if (session.pageContent && String(session.pageContent).trim()) {
      context.pageContent = String(session.pageContent).trim();
    }

    return context;
  };

  // 处理发送 prompt 接口
  const handleSendPrompt = async (session, msgIndex, button) => {
    if (!session || !session.messages || msgIndex < 0 || msgIndex >= session.messages.length) {
      showToast('消息不存在');
      return;
    }

    const message = session.messages[msgIndex];
    const messageContent = normalizeText(message);
    
    if (!messageContent.trim()) {
      showToast('消息内容为空，无法发送');
      return;
    }

    // 禁用按钮，显示加载状态
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳';
    button.style.opacity = '0.5';

    try {
      // 构建 prompt 请求
      const systemPrompt = '你是一个专业的AI助手，请根据用户提供的消息内容和上下文进行回复。';
      
      // 构建用户提示词：只使用当前消息内容和页面上下文，不包含其他消息历史或其他内容
      let userPrompt = messageContent.trim();

      // 只添加页面上下文（pageContent），不包含页面描述、页面标题或其他消息历史
      if (session.pageContent && String(session.pageContent).trim()) {
        const pageContent = String(session.pageContent).trim();
        userPrompt += `\n\n## 页面内容：\n\n${pageContent}`;
      }

      // 调用 prompt 接口（只传递当前消息内容和页面上下文）
      const aiResponse = await callPromptOnce(systemPrompt, userPrompt);

      if (!aiResponse || !aiResponse.trim()) {
        showToast('AI 回复为空');
        return;
      }

      // 添加 AI 回复到会话（在调用接口消息之后追加）
      const now = Date.now();
      const aiMessage = {
        role: 'assistant',
        content: aiResponse.trim(),
        ts: now
      };

      // 找到调用接口消息的位置，在其后追加 AI 回复
      // 总是追加，不替换现有的回复
      const insertIndex = msgIndex + 1;
      session.messages.splice(insertIndex, 0, aiMessage);

      // 更新会话信息
      session.messageCount = session.messages.length;
      session.lastActiveAt = now;
      session.lastAccessTime = now;
      session.updatedAt = now;

      // 重新渲染聊天界面
      renderChat();

      // 保存会话到后端（参考 YiPet 项目，确保 AI 回复被保存）
      try {
        const messagesForBackend = (session.messages || []).map((m) => {
          const role = normalizeRole(m);
          return {
            type: role === "user" ? "user" : "pet",
            content: normalizeText(m),
            timestamp: m.ts || m.timestamp || now,
            imageDataUrl: m.imageDataUrl || m.image || undefined,
          };
        });

        const payload = {
          id: String(session.id),
          url: session.url || "",
          pageTitle: (session.pageTitle && String(session.pageTitle).trim()) || session.title || "",
          pageDescription: (session.pageDescription && String(session.pageDescription).trim()) || session.preview || "",
          pageContent: session.pageContent || "",
          tags: Array.isArray(session.tags) ? session.tags : [],
          createdAt: session.createdAt || now,
          updatedAt: session.updatedAt || now,
          lastAccessTime: session.lastAccessTime || now,
          messages: messagesForBackend,
        };

        const resp = await fetch("https://api.effiy.cn/session/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          console.warn("[YiH5] 保存会话到后端失败：HTTP", resp.status);
        } else {
          const data = await resp.json().catch(() => null);
          console.log("[YiH5] AI 回复已保存到后端:", data);
        }
      } catch (e) {
        console.warn("[YiH5] 调用 session/save 保存会话失败：", e);
      }

      showToast('AI 回复已添加');
    } catch (error) {
      console.error('发送 prompt 失败:', error);
      showToast('发送失败，请重试');
    } finally {
      // 恢复按钮状态
      button.disabled = false;
      button.innerHTML = originalHTML;
      button.style.opacity = '';
    }
  };

  // 删除消息
  const deleteMessage = async (session, msgIndex, container) => {
    console.log("[YiH5] deleteMessage 调用", { sessionId: session?.id, msgIndex, messagesLength: session?.messages?.length });
    
    if (!session || !session.messages) {
      console.warn("[YiH5] 删除消息失败：会话或消息数组不存在", { sessionId: session?.id });
      throw new Error('会话或消息数组不存在');
    }
    
    if (msgIndex < 0 || msgIndex >= session.messages.length) {
      console.warn("[YiH5] 删除消息失败：无效的索引", { msgIndex, messagesLength: session.messages.length, sessionId: session.id });
      throw new Error(`无效的消息索引: ${msgIndex}，消息总数: ${session.messages.length}`);
    }

    // 获取所有消息元素
    const allMessages = Array.from(container.querySelectorAll('.chatMsg'));
    console.log("[YiH5] DOM 消息数量", { domMessagesLength: allMessages.length, arrayMessagesLength: session.messages.length });
    
    if (msgIndex >= allMessages.length) {
      console.warn("[YiH5] 删除消息失败：DOM 元素数量不匹配，直接重新渲染", { msgIndex, domMessagesLength: allMessages.length, arrayMessagesLength: session.messages.length });
      // 如果 DOM 和数组不匹配，先尝试从数组中删除，然后重新渲染
      session.messages.splice(msgIndex, 1);
      session.messageCount = session.messages.length;
      session.updatedAt = Date.now();
      
      // 确保 state.sessions 中的会话对象也被更新
      const sessionInState = findSessionById(session.id);
      if (sessionInState && sessionInState !== session) {
        sessionInState.messages = session.messages;
        sessionInState.messageCount = session.messageCount;
        sessionInState.updatedAt = session.updatedAt;
      }
      
      // 直接重新渲染
      renderChat();
      return;
    }

    const msgDiv = allMessages[msgIndex];
    if (!msgDiv) {
      console.warn("[YiH5] 删除消息失败：找不到 DOM 元素，直接重新渲染", { msgIndex });
      // 即使找不到DOM元素，也尝试从数组中删除，然后重新渲染
      session.messages.splice(msgIndex, 1);
      session.messageCount = session.messages.length;
      session.updatedAt = Date.now();
      
      // 确保 state.sessions 中的会话对象也被更新
      const sessionInState = findSessionById(session.id);
      if (sessionInState && sessionInState !== session) {
        sessionInState.messages = session.messages;
        sessionInState.messageCount = session.messageCount;
        sessionInState.updatedAt = session.updatedAt;
      }
      
      // 直接重新渲染
      renderChat();
      return;
    }

    // 保存当前滚动位置
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const msgHeight = msgDiv.offsetHeight;

    // 从数组中删除消息
    const deletedMessage = session.messages[msgIndex];
    session.messages.splice(msgIndex, 1);
    console.log("[YiH5] 已从数组中删除消息", { msgIndex, deletedMessageContent: deletedMessage?.content?.substring(0, 50), newMessagesLength: session.messages.length });

    // 更新会话信息
    session.messageCount = session.messages.length;
    session.updatedAt = Date.now();
    
    // 确保 state.sessions 中的会话对象也被更新
    const sessionInState = findSessionById(session.id);
    if (sessionInState && sessionInState !== session) {
      // 如果 state 中的会话对象和传入的会话对象不同，同步更新
      sessionInState.messages = session.messages;
      sessionInState.messageCount = session.messageCount;
      sessionInState.updatedAt = session.updatedAt;
      console.log("[YiH5] 已同步更新 state.sessions 中的会话对象");
    }

    // 从DOM中删除消息元素（添加淡出动画）
    msgDiv.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    msgDiv.style.opacity = '0';
    msgDiv.style.transform = 'translateX(-20px)';
    
    setTimeout(() => {
      // 完全重新渲染聊天界面，确保 DOM 和数组完全同步
      renderChat();

      // 恢复滚动位置（保持相对位置）
      // 重新渲染后需要重新获取 container，因为 DOM 已经重新创建
      requestAnimationFrame(() => {
        const chatContainer = dom.chatMessages;
        if (chatContainer) {
          const newScrollHeight = chatContainer.scrollHeight;
          const scrollDiff = newScrollHeight - scrollHeight;
          chatContainer.scrollTop = Math.max(0, scrollTop + scrollDiff - msgHeight);
        }
      });
    }, 200);

    // 尝试同步到后端
    try {
      const messagesForBackend = (session.messages || []).map((m) => {
        const role = normalizeRole(m);
        return {
          type: role === "user" ? "user" : "pet",
          content: normalizeText(m),
          timestamp: m.ts || m.timestamp || Date.now(),
          imageDataUrl: m.imageDataUrl || m.image || undefined,
        };
      });

      const payload = {
        id: String(session.id),
        url: session.url || "",
        pageTitle: (session.pageTitle && String(session.pageTitle).trim()) || session.title || "",
        pageDescription: (session.pageDescription && String(session.pageDescription).trim()) || session.preview || "",
        pageContent: session.pageContent || "",
        tags: Array.isArray(session.tags) ? session.tags : [],
        createdAt: session.createdAt || Date.now(),
        updatedAt: session.updatedAt || Date.now(),
        lastAccessTime: session.lastAccessTime || Date.now(),
        messages: messagesForBackend,
      };

      const resp = await fetch("https://api.effiy.cn/session/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        console.warn("[YiH5] 保存会话到后端失败：HTTP", resp.status);
        showToast('消息已删除，但保存到服务器失败');
      } else {
        const data = await resp.json().catch(() => null);
        console.log("[YiH5] 消息删除已保存到后端:", data);
        showToast('消息已删除');
      }
    } catch (e) {
      console.warn("[YiH5] 调用 session/save 保存会话失败：", e);
      showToast('消息已删除，但保存到服务器失败');
    }

    // 更新会话列表（如果当前在会话列表页面）
    if (state.view === "sessions") {
      renderList();
    }
  };

  // 更新消息操作按钮的禁用状态
  const updateMessageActionButtons = (container) => {
    const allMessages = Array.from(container.querySelectorAll('.chatMsg'));
    allMessages.forEach((msgDiv, index) => {
      const actions = msgDiv.querySelector('.chatMsgActions');
      if (!actions) return;

      const moveUpBtn = actions.querySelector('[data-action="move-up"]');
      const moveDownBtn = actions.querySelector('[data-action="move-down"]');

      if (moveUpBtn) {
        const canMoveUp = index > 0;
        moveUpBtn.disabled = !canMoveUp;
        // 同时更新样式以保持一致性
        moveUpBtn.style.opacity = canMoveUp ? '0.7' : '0.3';
      }
      if (moveDownBtn) {
        const canMoveDown = index < allMessages.length - 1;
        moveDownBtn.disabled = !canMoveDown;
        // 同时更新样式以保持一致性
        moveDownBtn.style.opacity = canMoveDown ? '0.7' : '0.3';
      }
    });
  };

  // 显示提示消息
  const showToast = (message, type = 'info') => {
    // 简单的提示实现，可以后续优化
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  };

  const setView = (view) => {
    state.view = view;
    syncVisibility();
  };

  const navigateToList = () => {
    location.hash = "#/";
  };

  const navigateToChat = (id) => {
    location.hash = `#/chat?id=${encodeURIComponent(String(id))}`;
  };

  const navigateToNewsChat = async (key) => {
    // 记录进入聊天页面的来源标签页（从新闻视图进入）
    state.chatSourceTab = "news";
    
    // 查找新闻
    const news = findNewsByKey(key);
    if (!news) {
      console.warn("[YiH5] 找不到新闻，key:", key);
      location.hash = `#/news-chat?key=${encodeURIComponent(String(key))}`;
      return;
    }

    // 标记新闻为已读
    markNewsAsRead(key);
    // 更新新闻项的 isRead 状态
    news.isRead = true;
    const newsInState = state.news.items.find(n => String(n.key) === String(key));
    if (newsInState) {
      newsInState.isRead = true;
    }

    // 获取新闻的link作为会话ID（后端会自动将URL转换为MD5）
    const newsLink = String(news.link || "").trim();
    if (!newsLink) {
      console.warn("[YiH5] 新闻没有link，无法创建会话");
      location.hash = `#/news-chat?key=${encodeURIComponent(String(key))}`;
      return;
    }

    // 使用新闻link作为会话ID（后端会自动处理URL到MD5的转换）
    const sessionId = newsLink;

    // 如果新闻已经有 sessionId 字段，说明已经转换为会话，直接进入会话聊天页面
    if (news.sessionId) {
      navigateToChat(news.sessionId);
      return;
    }

    // 检查会话是否已存在
    let existingSession = findSessionById(sessionId);
    
    // 如果本地没有找到，尝试从后端获取（确保会话列表已加载）
    if (!existingSession) {
      await fetchSessions();
      existingSession = findSessionById(sessionId);
    }

    // 如果会话已存在，更新新闻的 sessionId 字段并进入会话聊天页面
    if (existingSession) {
      // 使用实际的会话ID（可能和原始sessionId不同，比如后端转换为MD5）
      const actualSessionId = String(existingSession.id);
      // 更新新闻的 sessionId 字段
      news.sessionId = actualSessionId;
      // 同时更新 state.news.items 中对应的新闻
      const newsInState = state.news.items.find(n => String(n.key) === String(key));
      if (newsInState) {
        newsInState.sessionId = actualSessionId;
      }
      navigateToChat(actualSessionId);
      return;
    }

    // 如果会话不存在，创建新会话
    if (!existingSession) {
      const newsDescription = String(news.description || "").trim();
      const newsTitle = String(news.title || "").trim();
      const now = Date.now();

      // 创建新会话数据
      const newSession = {
        id: sessionId,
        url: newsLink,
        pageTitle: newsTitle || "新闻",
        pageDescription: newsDescription,
        pageContent: newsDescription, // 新闻描述也赋值给会话上下文字段
        messages: [],
        tags: Array.isArray(news.tags) ? news.tags : [],
        createdAt: now,
        updatedAt: now,
        lastAccessTime: now,
      };

      // 保存会话到后端
      try {
        const resp = await fetch("https://api.effiy.cn/session/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(newSession),
        });

        if (resp.ok) {
          const data = await resp.json().catch(() => null);
          console.log("[YiH5] 新闻会话已创建并保存:", data);
          
          // 如果后端返回了会话数据，更新到本地状态
          if (data && data.data && data.data.session) {
            const savedSession = data.data.session;
            // 使用后端返回的会话ID（可能和原始sessionId不同，比如后端转换为MD5）
            const actualSessionId = String(savedSession.id || sessionId);
            
            // 检查会话是否已存在（避免重复添加）
            let foundSession = findSessionById(actualSessionId);
            if (!foundSession && actualSessionId !== String(sessionId)) {
              foundSession = findSessionById(sessionId);
            }
            
            if (foundSession) {
              // 如果已存在，更新现有会话
              existingSession = foundSession;
              // 更新会话信息
              if (savedSession.title) foundSession.title = savedSession.title;
              if (savedSession.pageTitle) foundSession.pageTitle = savedSession.pageTitle;
              if (savedSession.pageDescription) foundSession.pageDescription = savedSession.pageDescription;
              if (Array.isArray(savedSession.messages)) {
                foundSession.messages = savedSession.messages;
                foundSession.messageCount = savedSession.messages.length;
              }
            } else {
              // 映射为页面使用的统一结构
              const mappedSession = {
                id: actualSessionId,
                title: (savedSession.title ?? savedSession.pageTitle ?? newsTitle).trim() || "未命名会话",
                preview: (savedSession.pageDescription ?? savedSession.preview ?? newsDescription).trim(),
                tags: Array.isArray(savedSession.tags) ? savedSession.tags : [],
                url: savedSession.url || newsLink,
                pageTitle: savedSession.pageTitle || newsTitle,
                pageDescription: savedSession.pageDescription || newsDescription,
                pageContent: savedSession.pageContent || newsDescription,
                messageCount: Array.isArray(savedSession.messages) ? savedSession.messages.length : 0,
                messages: Array.isArray(savedSession.messages) ? savedSession.messages : [],
                createdAt: Number(savedSession.createdAt || now),
                updatedAt: Number(savedSession.updatedAt || now),
                lastAccessTime: Number(savedSession.lastAccessTime || now),
                lastActiveAt: Number(savedSession.lastAccessTime || now),
              };
              
              // 添加到本地会话列表
              state.sessions.push(mappedSession);
              existingSession = mappedSession;
            }
            
            // 更新新闻的 sessionId 字段，使用后端返回的实际ID
            news.sessionId = actualSessionId;
            // 同时更新 state.news.items 中对应的新闻
            const newsInState = state.news.items.find(n => String(n.key) === String(key));
            if (newsInState) {
              newsInState.sessionId = actualSessionId;
            }
          } else {
            // 如果后端没有返回会话数据，检查是否已存在，避免重复添加
            let foundSession = findSessionById(sessionId);
            if (foundSession) {
              existingSession = foundSession;
            } else {
              // 使用本地创建的数据
              const newSession = {
                id: sessionId,
                title: newsTitle || "未命名会话",
                preview: newsDescription,
                tags: Array.isArray(news.tags) ? news.tags : [],
                url: newsLink,
                pageTitle: newsTitle,
                pageDescription: newsDescription,
                pageContent: newsDescription,
                messageCount: 0,
                messages: [],
                createdAt: now,
                updatedAt: now,
                lastAccessTime: now,
                lastActiveAt: now,
              };
              state.sessions.push(newSession);
              existingSession = newSession;
            }
            
            // 更新新闻的 sessionId 字段，标记已转换为会话
            news.sessionId = sessionId;
            // 同时更新 state.news.items 中对应的新闻
            const newsInState = state.news.items.find(n => String(n.key) === String(key));
            if (newsInState) {
              newsInState.sessionId = sessionId;
            }
          }
        } else {
          console.warn("[YiH5] 保存新闻会话失败：HTTP", resp.status);
        }
      } catch (e) {
        console.warn("[YiH5] 保存新闻会话失败：", e);
      }
    }

    // 如果会话已存在或已创建，进入会话聊天页面
    if (existingSession) {
      navigateToChat(existingSession.id);
    } else {
      // 如果创建失败，仍然进入新闻聊天页面
      location.hash = `#/news-chat?key=${encodeURIComponent(String(key))}`;
    }
  };

  const parseRoute = () => {
    const raw = String(location.hash || "#/").replace(/^#/, "");
    if (!raw || raw === "/") return { name: "list" };
    if (raw.startsWith("/chat")) {
      const qIdx = raw.indexOf("?");
      const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
      const params = new URLSearchParams(qs);
      return { name: "chat", id: params.get("id") || "" };
    }
    if (raw.startsWith("/news-chat")) {
      const qIdx = raw.indexOf("?");
      const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
      const params = new URLSearchParams(qs);
      return { name: "newsChat", key: params.get("key") || "" };
    }
    return { name: "list" };
  };

  // 获取会话详情
  const fetchSessionDetail = async (sessionId) => {
    if (!sessionId) return null;
    
    try {
      const response = await fetch(`https://api.effiy.cn/session/${encodeURIComponent(sessionId)}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // 处理返回的数据（支持多种可能的返回格式）
      const sessionData = data?.data || data;
      if (!sessionData || typeof sessionData !== 'object') {
        console.warn("[YiH5] 会话详情数据格式异常:", data);
        return null;
      }
      
      // 使用后端返回的实际ID或传入的sessionId来查找会话
      const actualSessionId = String(sessionData.id || sessionId);
      let s = findSessionById(actualSessionId);
      
      // 如果使用实际ID找不到，尝试用传入的sessionId查找（兼容ID不一致的情况）
      if (!s && actualSessionId !== String(sessionId)) {
        s = findSessionById(sessionId);
      }
      
      // 如果本地找不到会话，将获取到的会话添加到本地状态中
      if (!s) {
        const tags = Array.isArray(sessionData.tags) ? sessionData.tags : (sessionData.tags ? [sessionData.tags] : []);
        const title = (sessionData.title ?? sessionData.pageTitle ?? "").trim() || "未命名会话";
        const preview = (sessionData.pageDescription ?? sessionData.preview ?? sessionData.summary ?? "").trim();
        const updatedAt = Number(sessionData.updatedAt ?? sessionData.updated_at ?? Date.now());
        const createdAt = Number(sessionData.createdAt ?? sessionData.created_at ?? updatedAt);
        const lastAccessTime = Number(sessionData.lastAccessTime ?? sessionData.last_access_time ?? updatedAt);
        const lastActiveAt = Number(sessionData.lastActiveAt ?? sessionData.last_active_at ?? lastAccessTime ?? updatedAt);
        
        // 转换消息格式
        const messages = Array.isArray(sessionData.messages) ? sessionData.messages.map((msg) => {
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
        }) : [];
        
        const messageCount = messages.length;
        
        // 创建新的会话对象并添加到本地状态
        s = {
          id: actualSessionId,
          title,
          preview,
          tags,
          url: sessionData.url || "",
          pageTitle: sessionData.pageTitle || "",
          pageDescription: sessionData.pageDescription || "",
          pageContent: sessionData.pageContent || sessionData.content || "",
          messageCount,
          messages,
          createdAt,
          updatedAt,
          lastAccessTime,
          muted: sessionData.muted !== undefined ? !!sessionData.muted : false,
          lastActiveAt,
        };
        
        // 添加前再次检查，避免重复
        const existing = findSessionById(actualSessionId);
        if (!existing) {
          state.sessions.push(s);
        } else {
          // 如果已存在，使用已存在的会话对象
          s = existing;
        }
      } else {
        // 如果返回了 messages 字段，更新到会话中
        if (Array.isArray(sessionData.messages)) {
          // 转换消息格式：type: "user" -> role: "user", type: "pet" -> role: "assistant"
          s.messages = sessionData.messages.map((msg) => {
            // 处理消息类型：user -> user, pet -> assistant
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
          });
          s.messageCount = s.messages.length;
        }
        
        // 更新其他会话信息（无论是否有 messages）
        if (sessionData.title) s.title = sessionData.title;
        if (sessionData.pageTitle) s.pageTitle = sessionData.pageTitle;
        if (sessionData.pageDescription) s.pageDescription = sessionData.pageDescription;
        if (sessionData.preview) s.preview = sessionData.preview;
        // 如果接口返回了页面上下文，更新到会话上（即使为空字符串也要更新，避免显示旧数据）
        if (sessionData.pageContent !== undefined) s.pageContent = sessionData.pageContent || "";
      }
      
      return sessionData;
    } catch (error) {
      console.error("获取会话详情失败:", error);
      return null;
    }
  };

  const applyRoute = async () => {
    const r = parseRoute();
    
    // 处理会话聊天路由
    if (r.name === "chat" && r.id) {
      // 记录进入聊天页面的来源标签页（如果还没有记录）
      if (state.chatSourceTab === null) {
        state.chatSourceTab = state.bottomTab;
      }
      // 如果当前不在会话标签页，先切换到会话标签页
      if (state.bottomTab !== "sessions") {
        await setBottomTab("sessions", { persist: false });
      }
      state.activeSessionId = r.id;
      state.activeNewsKey = "";
      setView("chat");
      // 先渲染一次（可能使用本地缓存的数据）
      renderChat();
      // 然后调用接口获取最新的会话详情
      await fetchSessionDetail(r.id);
      // 获取详情后重新渲染
      renderChat();
      return;
    }
    
    // 处理新闻聊天路由
    if (r.name === "newsChat" && r.key) {
      // 只有在新闻视图时才处理新闻聊天路由
      if (state.bottomTab !== "news") {
        return;
      }
      // 记录进入聊天页面的来源标签页
      state.chatSourceTab = state.bottomTab;
      state.activeNewsKey = r.key;
      state.activeSessionId = "";
      setView("newsChat");
      // 渲染新闻聊天页面
      renderNewsChat();
      return;
    }
    
    // 默认返回列表视图
    state.activeSessionId = "";
    state.activeNewsKey = "";
    state.chatSourceTab = null; // 清除来源记录
    setView("list");
    if (state.bottomTab === "sessions") {
      renderList();
    } else {
      renderNews();
    }
  };

  // 从所有会话中提取唯一标签列表
  const getAllTags = () => {
    const tagSet = new Set();
    state.sessions.forEach((s) => {
      if (Array.isArray(s.tags)) {
        s.tags.forEach((tag) => {
          if (tag && tag.trim()) {
            tagSet.add(tag.trim());
          }
        });
      }
    });
    return Array.from(tagSet).sort();
  };

  // 按“保存的顺序 + 默认优先标签 + 其余字母序”得到用于展示的标签顺序
  const getOrderedTags = () => {
    const all = getAllTags();
    if (all.length === 0) return [];

    const saved = loadTagOrder();
    if (!saved || saved.length === 0) {
      const pinned = DEFAULT_PINNED_TAGS.filter((t) => all.includes(t));
      const rest = all.filter((t) => !pinned.includes(t));
      return [...pinned, ...rest];
    }

    const used = new Set();
    const ordered = [];

    for (const t of saved) {
      if (!t) continue;
      if (!all.includes(t)) continue;
      if (used.has(t)) continue;
      used.add(t);
      ordered.push(t);
    }

    // 新出现的默认优先标签：不打乱用户已有顺序，只在末尾优先追加
    for (const t of DEFAULT_PINNED_TAGS) {
      if (!all.includes(t)) continue;
      if (used.has(t)) continue;
      used.add(t);
      ordered.push(t);
    }

    // 其余新增标签（字母序）
    for (const t of all) {
      if (used.has(t)) continue;
      used.add(t);
      ordered.push(t);
    }

    return ordered;
  };

  // 计算每个标签对应的会话数量
  const getTagCount = (tag) => {
    return state.sessions.filter((s) => {
      const sessionTags = Array.isArray(s.tags) ? s.tags.map((t) => String(t).trim()) : [];
      return sessionTags.includes(tag);
    }).length;
  };

  const computeChips = () => {
    const c = [];
    const f = state.filter;
    if (state.q.trim()) c.push({ key: "q", label: `搜索：${state.q.trim()}` });
    // 日期标签已移除，日期筛选功能保留
    // 显示选中的标签
    f.selectedTags.forEach((tag) => {
      c.push({ key: `tag_${tag}`, label: tag, tagValue: tag });
    });
    return c;
  };

  const filterAndSort = () => {
    const q = state.q.trim().toLowerCase();
    const f = state.filter;
    let arr = state.sessions.slice();

    if (q) {
      arr = arr.filter((s) => {
        const hay = `${s.title} ${s.pageTitle || ""} ${s.preview || ""} ${s.url || ""} ${s.tags.join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // 标签筛选：如果选中了标签，会话必须包含至少一个选中的标签
    if (f.selectedTags.length > 0) {
      arr = arr.filter((s) => {
        const sessionTags = Array.isArray(s.tags) ? s.tags.map((t) => String(t).trim()) : [];
        return f.selectedTags.some((selectedTag) => sessionTags.includes(selectedTag));
      });
    }

    // 日期过滤：只有在没有选中标签时才生效
    if (f.selectedTags.length === 0 && state.selectedDate) {
      const selectedDate = dateUtil.parseYMD(state.selectedDate);
      if (selectedDate) {
        const selectedYear = selectedDate.getFullYear();
        const selectedMonth = selectedDate.getMonth();
        const selectedDay = selectedDate.getDate();

        arr = arr.filter((s) => {
          const sessionDate = new Date(s.lastActiveAt);
          return (
            sessionDate.getFullYear() === selectedYear &&
            sessionDate.getMonth() === selectedMonth &&
            sessionDate.getDate() === selectedDay
          );
        });
      }
    }

    // 判断是否有筛选条件
    const hasFilter = q || f.selectedTags.length > 0 || state.selectedDate;

    // 排序逻辑
    if (!hasFilter) {
      // 没有筛选条件：按修改时间倒序排序（最新的在前面）
      arr.sort((a, b) => {
        const aTime = a.updatedAt || a.lastAccessTime || a.lastActiveAt || a.createdAt || 0;
        const bTime = b.updatedAt || b.lastAccessTime || b.lastActiveAt || b.createdAt || 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        // 如果时间相同，按会话ID排序（确保完全稳定）
        const aId = a.id || '';
        const bId = b.id || '';
        return aId.localeCompare(bId);
      });
    } else {
      // 有筛选条件：按文件名排序（与 YiPet 保持一致）
      arr.sort((a, b) => {
        // 获取会话的显示标题（文件名）
        const aTitle = (a.pageTitle || a.title || '').trim();
        const bTitle = (b.pageTitle || b.title || '').trim();
        
        // 按文件名排序（不区分大小写，支持中文和数字）
        const titleCompare = aTitle.localeCompare(bTitle, 'zh-CN', { numeric: true, sensitivity: 'base' });
        if (titleCompare !== 0) {
          return titleCompare;
        }
        
        // 如果文件名相同，按更新时间排序（最新更新的在前）
        const aTime = a.updatedAt || a.createdAt || 0;
        const bTime = b.updatedAt || b.createdAt || 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        
        // 如果更新时间也相同，按会话ID排序（确保完全稳定）
        const aId = a.id || '';
        const bId = b.id || '';
        return aId.localeCompare(bId);
      });
    }
    return arr;
  };

  const renderChips = () => {
    const chips = computeChips();
    dom.chips.innerHTML = chips
      .map(
        (c) => `
          <span class="chip" data-chip="${c.key}">
            <span>${escapeHtml(c.label)}</span>
            <button class="chip__x" type="button" aria-label="移除" data-action="removeChip" data-key="${c.key}" ${c.tagValue ? `data-tag-value="${escapeHtml(c.tagValue)}"` : ''}>×</button>
          </span>
        `,
      )
      .join("");
  };

  const renderList = () => {
    if (state.sessionsLoading) {
      disableVList("sessions");
      renderChips();
      dom.empty.hidden = false;
      dom.empty.querySelector(".empty__title")?.replaceChildren(document.createTextNode("加载中…"));
      dom.empty.querySelector(".empty__desc")?.replaceChildren(document.createTextNode("正在获取会话列表"));
      dom.list.innerHTML = "";
      return;
    }
    const arr = filterAndSort();
    renderChips();

    dom.empty.hidden = arr.length !== 0;
    dom.empty.querySelector(".empty__title")?.replaceChildren(document.createTextNode(state.lastError ? "加载失败" : "暂无匹配会话"));
    dom.empty.querySelector(".empty__desc")?.replaceChildren(
      document.createTextNode(state.lastError ? state.lastError : "试试清空搜索或调整筛选条件（也可清空日期过滤）"),
    );
    if (arr.length >= VLIST_MIN_ITEMS) {
      const v = vlist.sessions;
      v.enabled = true;
      v.container = dom.list;
      v.items = arr;
      v.render = renderItem;
      v.start = -1;
      v.end = -1;
      // 先同步出骨架，避免短暂显示旧内容
      const parts = ensureVListDOM(v.container);
      if (parts?.top) parts.top.style.height = "0px";
      if (parts?.bottom) parts.bottom.style.height = "0px";
      if (parts?.mid) parts.mid.innerHTML = "";
      requestVListUpdate("sessions", { force: true });
      return;
    }
    disableVList("sessions");
    dom.list.innerHTML = arr.map(renderItem).join("");
  };

  const renderItem = (s) => {
    // 消息数量badge（单独处理，用于第一行）
    const messageBadge = s.messageCount > 0
      ? `<span class="badge">消息 ${escapeHtml(String(s.messageCount))}</span>`
      : `<span class="badge">暂无消息</span>`;
    
    // 其他badges（免打扰等，用于第二行）
    const otherBadges = [
      s.muted ? `<span class="badge">免打扰</span>` : "",
    ].join("");

    const mutedCls = s.muted ? " is-muted" : "";
    // 优先显示 pageTitle，如果没有则显示 title
    const displayTitle = (s.pageTitle && s.pageTitle.trim()) || s.title || "未命名会话";
    // 优先显示 pageDescription，如果没有则显示 preview
    const displayDesc = (s.pageDescription && s.pageDescription.trim()) || s.preview || "—";
    // 会话标签渲染：参考新闻列表的标签样式，但使用不同颜色
    const rawTags = Array.isArray(s.tags) ? s.tags : s.tags ? [s.tags] : [];
    const normTags = rawTags.map((t) => String(t || "").trim()).filter(Boolean);
    const displayTags = normTags.length ? normTags : ["无标签"];
    const tagBadges = displayTags
      .slice(0, 4)
      .map((t, idx) => {
        const colorCls = `is-sessionTag-${idx % 4}`;
        return `<span class="badge ${colorCls}">${escapeHtml(t)}</span>`;
      })
      .join("");
    
    // 格式化会话日期：yyyy-MM-dd
    const ts = s.lastAccessTime || s.lastActiveAt;
    let displayDate = "—";
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        displayDate = dateUtil.formatYMD(d);
      }
    }

    return `
      <div class="swipe-item-wrapper">
        <article class="item${mutedCls}" data-id="${s.id}">
          <div class="item__mid">
            <div class="item__row1">
              <div class="item__title"><span>${escapeHtml(displayTitle)}</span></div>
              <div class="item__meta">
                ${messageBadge}
              </div>
            </div>
            <div class="item__row2">
              <div class="item__preview">${escapeHtml(displayDesc)}</div>
            </div>
            <div class="item__row2" style="margin-top:6px">
              <div class="item__tags">${tagBadges}</div>
              <div class="item__meta">
                <span class="time">${escapeHtml(displayDate)}</span>
                ${otherBadges}
              </div>
            </div>
          </div>
          <div class="item__right">
          </div>
        </article>
        <div class="swipe-item__actions">
          <button class="swipe-item__delete" data-action="swipeDelete" data-id="${s.id}" aria-label="删除会话">
            删除
          </button>
        </div>
      </div>
    `;
  };


  const openFilter = () => {
    // 同步草稿
    state.filterDraft = {
      selectedTags: [...state.filter.selectedTags],
    };
    
    // 先渲染标签列表（会根据filterDraft自动设置选中状态）
    renderTagFilters();

    dom.sheetMask.hidden = false;
    dom.sheet.classList.add("is-open");
    dom.sheet.setAttribute("aria-hidden", "false");
  };

  const openNewsFilter = () => {
    // 同步草稿
    state.newsFilterDraft = {
      selectedTags: [...state.news.filter.selectedTags],
    };
    
    // 先渲染标签列表（会根据newsFilterDraft自动设置选中状态）
    renderNewsTagFilters();

    dom.sheetMask.hidden = false;
    dom.sheet.classList.add("is-open");
    dom.sheet.setAttribute("aria-hidden", "false");
  };

  // 渲染标签筛选列表
  const renderTagFilters = () => {
    const tagContainer = $("#tagFilters");
    if (!tagContainer) return;
    
    const allTags = getOrderedTags();
    if (allTags.length === 0) {
      tagContainer.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px 0;">暂无标签</div>';
      return;
    }
    
    tagContainer.innerHTML = allTags
      .map((tag) => {
        const isSelected = state.filterDraft.selectedTags.includes(tag);
        const count = getTagCount(tag);
        return `
          <button
            type="button"
            class="option is-draggable ${isSelected ? 'is-selected' : ''}"
            data-action="toggleTag"
            data-tag="${escapeHtml(tag)}"
            draggable="true"
            title="拖拽调整顺序（点击可筛选）"
          >
            <span>${escapeHtml(tag)}</span>
            <span class="option__count">${count}</span>
          </button>
        `;
      })
      .join("");

    // 绑定拖拽排序（每次渲染重新绑定到新节点）
    bindTagDragSort(tagContainer);
  };

  // 渲染新闻标签筛选列表
  const renderNewsTagFilters = () => {
    const tagContainer = $("#tagFilters");
    if (!tagContainer) return;
    
    const allTags = getNewsTags();
    if (allTags.length === 0) {
      tagContainer.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px 0;">暂无标签</div>';
      return;
    }
    
    tagContainer.innerHTML = allTags
      .map((tag) => {
        const isSelected = state.newsFilterDraft.selectedTags.includes(tag);
        const count = getNewsTagCount(tag);
        return `
          <button
            type="button"
            class="option is-draggable ${isSelected ? 'is-selected' : ''}"
            data-action="toggleNewsTag"
            data-tag="${escapeHtml(tag)}"
            draggable="true"
            title="拖拽调整顺序（点击可筛选）"
          >
            <span>${escapeHtml(tag)}</span>
            <span class="option__count">${count}</span>
          </button>
        `;
      })
      .join("");

    // 绑定拖拽排序（每次渲染重新绑定到新节点）
    bindTagDragSort(tagContainer);
  };

  const clearDragIndicators = (root) => {
    $$(".option.is-draggable", root).forEach((el) => {
      el.classList.remove("is-dragging", "is-dragover-top", "is-dragover-bottom");
    });
  };

  const getDomTagOrder = (tagContainer) => {
    return $$(".option.is-draggable[data-tag]", tagContainer)
      .map((b) => String(b.dataset.tag || "").trim())
      .filter(Boolean);
  };

  const reorderByDrop = ({ tagContainer, draggedTag, targetTag, insertAfter }) => {
    const order = getDomTagOrder(tagContainer);
    const draggedIndex = order.indexOf(draggedTag);
    const targetIndex = order.indexOf(targetTag);
    if (draggedIndex === -1 || targetIndex === -1) return;

    let insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
    if (draggedIndex < insertIndex) insertIndex -= 1;

    const next = order.slice();
    next.splice(draggedIndex, 1);
    next.splice(insertIndex, 0, draggedTag);
    saveTagOrder(next);
  };

  // 标签拖拽排序（桌面：HTML5 DnD；移动：长按 + Pointer Events）
  const bindTagDragSort = (tagContainer) => {
    const items = $$(".option.is-draggable[data-tag]", tagContainer);
    if (items.length <= 1) return;

    // 桌面 DnD
    items.forEach((btn) => {
      btn.addEventListener("dragstart", (e) => {
        state.isDraggingTag = true;
        btn.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(btn.dataset.tag || ""));
      });

      btn.addEventListener("dragend", () => {
        clearDragIndicators(tagContainer);
        // 用一个微小延迟，吃掉 drop 后可能冒出来的 click
        window.setTimeout(() => {
          state.isDraggingTag = false;
        }, 0);
      });

      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.classList.contains("is-dragging")) return;

        const rect = btn.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        clearDragIndicators(tagContainer);

        if (e.clientY < midY) {
          btn.classList.add("is-dragover-top");
        } else {
          btn.classList.add("is-dragover-bottom");
        }
      });

      btn.addEventListener("dragleave", () => {
        btn.classList.remove("is-dragover-top", "is-dragover-bottom");
      });

      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const draggedTag = String(e.dataTransfer.getData("text/plain") || "").trim();
        const targetTag = String(btn.dataset.tag || "").trim();
        if (!draggedTag || !targetTag || draggedTag === targetTag) return;

        const rect = btn.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertAfter = e.clientY >= midY;

        reorderByDrop({ tagContainer, draggedTag, targetTag, insertAfter });
        clearDragIndicators(tagContainer);
        renderTagFilters();
      });
    });

    // 移动端：长按拖动排序（Pointer Events）
    let pressTimer = null;
    let touch = null; // { pointerId, draggedEl, draggedTag }

    const cleanupTouch = () => {
      if (pressTimer) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (touch?.draggedEl) {
        touch.draggedEl.releasePointerCapture?.(touch.pointerId);
        touch.draggedEl.classList.remove("is-dragging");
      }
      touch = null;
      clearDragIndicators(tagContainer);
      window.setTimeout(() => {
        state.isDraggingTag = false;
      }, 0);
    };

    items.forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        if (!e.isPrimary) return;

        // 长按进入拖动模式（避免影响“点按筛选”）
        pressTimer = window.setTimeout(() => {
          state.isDraggingTag = true;
          touch = {
            pointerId: e.pointerId,
            draggedEl: btn,
            draggedTag: String(btn.dataset.tag || "").trim(),
          };
          btn.classList.add("is-dragging");
          btn.setPointerCapture?.(e.pointerId);
        }, 260);
      });

      btn.addEventListener("pointermove", (e) => {
        if (!touch || touch.pointerId !== e.pointerId) return;
        e.preventDefault();

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el?.closest?.(".option.is-draggable[data-tag]");
        if (!target || target === touch.draggedEl) return;

        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertAfter = e.clientY >= midY;

        clearDragIndicators(tagContainer);
        target.classList.add(insertAfter ? "is-dragover-bottom" : "is-dragover-top");

        if (insertAfter) {
          target.after(touch.draggedEl);
        } else {
          target.before(touch.draggedEl);
        }
      });

      btn.addEventListener("pointerup", (e) => {
        if (pressTimer) {
          window.clearTimeout(pressTimer);
          pressTimer = null;
        }
        if (!touch || touch.pointerId !== e.pointerId) return;

        // 结束：保存 DOM 当前顺序
        const next = getDomTagOrder(tagContainer);
        saveTagOrder(next);
        cleanupTouch();
        renderTagFilters();
      });

      btn.addEventListener("pointercancel", () => cleanupTouch());
    });
  };

  const closeFilter = () => {
    dom.sheet.classList.remove("is-open");
    dom.sheet.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dom.sheet.classList.contains("is-open")) dom.sheetMask.hidden = true;
    }, 220);
  };

  const applyFilter = () => {
    // 收集选中的标签（从filterDraft中获取，因为点击时已经更新了）
    const next = {
      selectedTags: [...state.filterDraft.selectedTags],
    };
    state.filter = next;
    closeFilter();
    renderList();
  };

  const applyNewsFilter = () => {
    // 收集选中的标签（从newsFilterDraft中获取，因为点击时已经更新了）
    const next = {
      selectedTags: [...state.newsFilterDraft.selectedTags],
    };
    state.news.filter = next;
    closeFilter();
    renderNews();
  };

  const resetFilter = () => {
    if (state.bottomTab === "news") {
      state.newsFilterDraft = {
        selectedTags: [],
      };
      // 重新渲染标签列表以更新选中状态
      renderNewsTagFilters();
    } else {
      state.filterDraft = {
        selectedTags: [],
      };
      // 重新渲染标签列表以更新选中状态
      renderTagFilters();
    }
  };

  const deleteOne = async (id) => {
    if (!id) {
      showToast('会话ID不能为空');
      return;
    }

    // 确认删除
    if (!confirm('确定要删除这个会话吗？删除后无法恢复。')) {
      return;
    }

    try {
      // 调用后端 API 删除会话
      const response = await fetch(`https://api.effiy.cn/session/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `删除失败: HTTP ${response.status}`);
      }

      const result = await response.json();
      const message = result.message || '会话删除成功';

      // 在删除会话之前，先获取会话的 URL，用于更新对应新闻的状态
      const deletedSession = state.sessions.find((s) => String(s.id) === String(id));
      const sessionUrl = deletedSession?.url;

      // 从本地状态中删除会话
      state.sessions = state.sessions.filter((x) => x.id !== id);

      // 如果会话有 URL，清除对应新闻的 sessionId 和 isRead 状态
      if (sessionUrl) {
        state.news.items.forEach((newsItem) => {
          if (newsItem.link === sessionUrl) {
            // 清除 sessionId 和 isRead 状态
            delete newsItem.sessionId;
            newsItem.isRead = false;
          }
        });
      }

      // 如果当前正在查看被删除的会话，则返回到列表页面
      if (state.activeSessionId === id) {
        navigateToList();
      }

      // 重新渲染列表
      renderList();
      
      // 如果当前在新闻页面，重新渲染新闻列表
      if (state.bottomTab === "news") {
        renderNews();
      }

      // 显示成功消息
      showToast(message);

      // 将删除成功的消息存储到 localStorage，以便刷新页面后也能显示
      try {
        const deleteSuccessKey = 'YiH5.deleteSuccess.v1';
        localStorage.setItem(deleteSuccessKey, JSON.stringify({
          message: message,
          timestamp: Date.now()
        }));
      } catch (e) {
        // ignore localStorage errors
      }
    } catch (error) {
      console.error('[YiH5] 删除会话失败:', error);
      showToast('删除会话失败：' + (error.message || '未知错误'));
    }
  };

  const kv = (k, v) => `<div class="kv"><div class="kv__k">${escapeHtml(k)}</div><div class="kv__v">${escapeHtml(v)}</div></div>`;

  const removeChip = (key, tagValue) => {
    if (key === "q") state.q = "";
    if (key === "date") {
      // 统一走 setSelectedDate，确保会话/新闻联动一致
      setSelectedDate("", { syncPicker: true, render: false });
    }
    if (key.startsWith("tag_")) {
      // 从selectedTags中移除对应的标签
      if (tagValue) {
        state.filter.selectedTags = state.filter.selectedTags.filter((t) => t !== tagValue);
      } else {
        // 如果没有传入tagValue，尝试从key中提取
        const extractedTag = key.replace("tag_", "");
        state.filter.selectedTags = state.filter.selectedTags.filter((t) => t !== extractedTag);
      }
    }
    dom.q.value = state.q;
    if (state.bottomTab === "news") renderNews();
    else renderList();
  };

  const removeNewsChip = (key, tagValue) => {
    if (key === "q") state.news.q = "";
    if (key.startsWith("tag_")) {
      // 从selectedTags中移除对应的标签
      if (tagValue) {
        state.news.filter.selectedTags = state.news.filter.selectedTags.filter((t) => t !== tagValue);
      } else {
        // 如果没有传入tagValue，尝试从key中提取
        const extractedTag = key.replace("tag_", "");
        state.news.filter.selectedTags = state.news.filter.selectedTags.filter((t) => t !== extractedTag);
      }
    }
    if (dom.newsQ) dom.newsQ.value = state.news.q;
    renderNews();
  };

  // ---------- Date picker presentation ----------
  const DATE_EMPTY_LABEL = "全部日期";
  const isValidYMD = (s) => {
    const str = String(s || "").trim();
    // 支持 YYYY-MM-DD 和 YYYY/MM/DD 两种格式
    return /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(str) && dateUtil.parseYMD(str) !== null;
  };

  // 原生 input[type="date"] 在为空时很多浏览器会强制显示 yyyy/mm/dd 之类的系统占位。
  // 这里用“空值时切为 text + placeholder”的方式，实现“全部日期”的展示。
  const syncDatePickerUI = () => {
    if (!dom.datePicker) return;
    const hasDate = !!state.selectedDate;
    if (hasDate) {
      if (dom.datePicker.type !== "date") dom.datePicker.type = "date";
      dom.datePicker.placeholder = "";
      dom.datePicker.value = state.selectedDate;
    } else {
      if (dom.datePicker.type !== "text") dom.datePicker.type = "text";
      dom.datePicker.value = "";
      dom.datePicker.placeholder = DATE_EMPTY_LABEL;
      // 避免某些输入法弹键盘（点击会触发打开日期选择器）
      dom.datePicker.setAttribute("inputmode", "none");
    }
  };

  const setSelectedDate = (ymd, { syncPicker = true, render = true } = {}) => {
    state.selectedDate = isValidYMD(ymd) ? ymd : "";
    if (syncPicker) syncDatePickerUI();
    if (!render) return;

    // 按当前底部 tab 做一致的联动：
    // - 会话：本地按日期过滤并重绘
    // - 新闻：按日期请求接口并重绘（日期变化应立即生效）
    if (state.bottomTab === "news") {
      renderNews();
      fetchNews({ force: true });
    } else {
      renderList();
    }
  };

  const toggleTag = (tag) => {
    const index = state.filterDraft.selectedTags.indexOf(tag);
    if (index > -1) {
      // 如果已选中，则取消选中
      state.filterDraft.selectedTags.splice(index, 1);
    } else {
      // 如果未选中，则选中
      state.filterDraft.selectedTags.push(tag);
    }
    // 重新渲染标签列表以更新选中状态
    renderTagFilters();
  };

  const toggleNewsTag = (tag) => {
    const index = state.newsFilterDraft.selectedTags.indexOf(tag);
    if (index > -1) {
      // 如果已选中，则取消选中
      state.newsFilterDraft.selectedTags.splice(index, 1);
    } else {
      // 如果未选中，则选中
      state.newsFilterDraft.selectedTags.push(tag);
    }
    // 重新渲染标签列表以更新选中状态
    renderNewsTagFilters();
  };

  // ---------- Refresh helpers ----------
  const refreshSessions = async () => {
    // 刷新会话列表接口数据
    state.lastError = "";
    renderList();
    await fetchSessions();
    // 按当前视图刷新 UI
    if (state.view === "chat") return renderChat();
    return renderList();
  };

  const refreshNews = async () => {
    return fetchNews({ force: true });
  };

  const refreshFaq = async () => {
    return fetchFaqs({ force: true });
  };

  // ---------- Manual refresh（替代下拉刷新） ----------
  let manualRefreshing = false;
  const manualRefresh = async () => {
    if (manualRefreshing) return;
    manualRefreshing = true;
    const btn = document.getElementById("refreshBtn");
    btn?.classList.add("is-spinning");
    try {
      // 更新日志弹层打开时：刷新更新日志
      if (dom.changelogSheet?.classList.contains("is-open")) {
        await refreshChangelog({ force: true });
        return;
      }
      // 优先：FAQ 弹层打开时刷新 FAQ
      if (dom.faqSheet?.classList.contains("is-open")) {
        await refreshFaq();
        return;
      }
      // 其次：当前底部 tab
      if (state.bottomTab === "news") {
        await refreshNews();
        return;
      }
      await refreshSessions();
    } finally {
      manualRefreshing = false;
      btn?.classList.remove("is-spinning");
    }
  };

  const onAction = (el, action, ev) => {
    if (!action) return;
    if (action === "noop") return;
    // 图片预览（点击放大/长按保存）
    if (action === "closeImgPreview") return closeImgPreview();
    if (action === "closeImgPreviewActions") return hideImgPreviewActions();
    if (action === "imgPreviewPrev") return setImgPreviewIndex(imgPreviewState.index - 1);
    if (action === "imgPreviewNext") return setImgPreviewIndex(imgPreviewState.index + 1);
    if (action === "saveImgPreview") {
      const src = imgPreviewState.src;
      hideImgPreviewActions();
      if (!src) return;
      // iOS：优先打开新页，让用户长按“保存到相册”（比 download 更符合相册预期）
      if (isIOS()) {
        try {
          window.open(src, "_blank", "noopener,noreferrer");
        } catch {
          // ignore
        }
        showImgPreviewToast("已打开图片新页面：请在新页面长按“保存到相册”");
        return;
      }

      showImgPreviewToast("正在准备保存…");
      saveImageByUrl(src).then((ok) => {
        if (ok) {
          showImgPreviewToast("已开始下载图片（如在部分 App 内，请到“下载/文件”中查看）");
          return;
        }
        // 兜底：打开新页，交给系统长按保存
        try {
          window.open(src, "_blank", "noopener,noreferrer");
        } catch {
          // ignore
        }
        window.alert("无法自动保存（可能是图片跨域限制）。已为你打开图片新页面，请在新页面长按“保存到相册”。");
      });
      return;
    }
    if (action === "openFilter") return openFilter();
    if (action === "openNewsFilter") return openNewsFilter();
    if (action === "closeFilter") return closeFilter();
    if (action === "applyFilter") {
      if (state.bottomTab === "news") {
        return applyNewsFilter();
      } else {
        return applyFilter();
      }
    }
    if (action === "resetFilter") return resetFilter();
    if (action === "openFaq") return openFaq();
    if (action === "openChangelog") return openChangelog();
    if (action === "openUrl") return openUrl();
    if (action === "openContext") return openContext();
    if (action === "openPageDescription") return openPageDescription();
    if (action === "openAuth") return openAuth();
    if (action === "closeFaq") return closeFaq();
    if (action === "closeChangelog") return closeChangelog();
    if (action === "closeContext") return closeContext();
    if (action === "closePageDescription") return closePageDescription();
    if (action === "manualRefresh") return manualRefresh();
    if (action === "refreshFaq") return refreshFaq();
    if (action === "refreshChangelog") return refreshChangelog({ force: true });
    if (action === "refreshSessions") return refreshSessions();
    if (action === "insertFaq") {
      const t = el.dataset.faqText;
      return appendFaqToSessionAndSave(t);
    }
    if (action === "optimizePageContext") return optimizePageContext();
    if (action === "translatePageContextZh") return translatePageContext("zh");
    if (action === "translatePageContextEn") return translatePageContext("en");
    if (action === "savePageContext") return savePageContext();
    if (action === "generatePageDescription") return generatePageDescription();
    if (action === "translatePageDescriptionZh") return translatePageDescription("zh");
    if (action === "translatePageDescriptionEn") return translatePageDescription("en");
    if (action === "savePageDescription") return savePageDescription();
    if (action === "switchBottomTab") {
      const tab = el.dataset.tab || "sessions";
      return setBottomTab(tab);
    }
    if (action === "refreshNews") {
      return refreshNews();
    }
    if (action === "toggleTag") {
      // 拖拽排序时会触发 click（尤其是移动端），这里直接吞掉
      if (state.isDraggingTag) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        return;
      }
      const tag = el.dataset.tag;
      if (tag) return toggleTag(tag);
    }
    if (action === "toggleNewsTag") {
      // 拖拽排序时会触发 click（尤其是移动端），这里直接吞掉
      if (state.isDraggingTag) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        return;
      }
      const tag = el.dataset.tag;
      if (tag) return toggleNewsTag(tag);
    }

    if (action === "removeChip") {
      const chipKey = el.dataset.key;
      const tagValue = el.dataset.tagValue;
      return removeChip(chipKey, tagValue);
    }
    if (action === "removeNewsChip") {
      const chipKey = el.dataset.key;
      const tagValue = el.dataset.tagValue;
      return removeNewsChip(chipKey, tagValue);
    }
    if (action === "deleteSession") {
      // 删除当前会话
      if (state.activeSessionId) {
        return deleteOne(state.activeSessionId);
      } else {
        showToast('找不到当前会话');
        return;
      }
    }

    if (action === "swipeDelete") {
      // 左滑删除会话
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      const sessionId = el.dataset.id;
      if (sessionId) {
        // 收起滑动状态
        const wrapper = el.closest('.swipe-item-wrapper');
        if (wrapper) {
          wrapper.classList.remove('is-swiped');
          const item = wrapper.querySelector('.item');
          if (item) {
            item.style.transform = '';
          }
        }
        return deleteOne(sessionId);
      }
    }

  };

  const wire = () => {
    // date picker
    const ensureDateType = () => {
      if (dom.datePicker.type !== "date") dom.datePicker.type = "date";
      // type 切换可能重置 value，这里按状态再同步一次
      dom.datePicker.value = state.selectedDate || "";
    };

    const openNativeDatePicker = ({ fromInputClick = false } = {}) => {
      const wasNotDate = dom.datePicker.type !== "date";
      ensureDateType();
      // showPicker: Chrome/Edge 等支持；iOS/部分 WebView 可能没有
      if (typeof dom.datePicker.showPicker === "function") {
        dom.datePicker.showPicker();
        return;
      }
      dom.datePicker.focus();
      // 对于不支持 showPicker 的浏览器，尝试触发点击
      // 注意：如果本来就是 input 自己的 click 事件里触发，再 click() 可能递归
      if (!fromInputClick) {
        dom.datePicker.click();
        return;
      }
      // 但如果是从 text 切换为 date 后的“首次点击”，默认行为未必会打开日期面板；
      // 这里延迟触发一次 click，让浏览器按 date 类型走默认打开逻辑，同时避免递归。
      if (wasNotDate) {
        setTimeout(() => {
          try {
            dom.datePicker.click();
          } catch {
            // ignore
          }
        }, 0);
      }
    };

    // 点到"日期区域"也能弹出（避免小屏被遮挡/点不到 input）
    dom.dateNav?.addEventListener("click", (e) => {
      if (e.target === dom.datePicker) return;
      e.preventDefault();
      e.stopPropagation();
      openNativeDatePicker();
    });
    dom.datePicker.addEventListener("click", (e) => {
      e.stopPropagation();
      openNativeDatePicker({ fromInputClick: true });
    });

    // 同时监听 change 和 input 事件，确保兼容性
    const handleDateChange = () => {
      const value = String(dom.datePicker.value || "").trim();
      // 允许清空日期（value 为空字符串时也更新状态）
      // 具体刷新逻辑交给 setSelectedDate 统一处理，避免入口分散导致交互不一致
      setSelectedDate(isValidYMD(value) ? value : "");
    };
    dom.datePicker.addEventListener("change", handleDateChange);
    dom.datePicker.addEventListener("input", handleDateChange);
    // 某些移动浏览器可能需要 blur 事件
    dom.datePicker.addEventListener("blur", handleDateChange);
    
    dom.prevDay?.addEventListener("click", () => {
      const next = dateUtil.addDaysYMD(state.selectedDate || dateUtil.todayYMD(), -1);
      setSelectedDate(next);
    });
    dom.nextDay?.addEventListener("click", () => {
      const next = dateUtil.addDaysYMD(state.selectedDate || dateUtil.todayYMD(), 1);
      setSelectedDate(next);
    });

    // search
    dom.q.addEventListener("input", () => {
      state.q = dom.q.value;
      renderList();
    });
    dom.clearQ.addEventListener("click", () => {
      state.q = "";
      dom.q.value = "";
      dom.q.focus();
      renderList();
    });

    // news search
    dom.newsQ?.addEventListener("input", () => {
      state.news.q = dom.newsQ.value;
      renderNews();
    });
    dom.clearNewsQ?.addEventListener("click", () => {
      state.news.q = "";
      dom.newsQ.value = "";
      dom.newsQ.focus();
      renderNews();
    });

    // tabs
    $$(".seg__btn").forEach((b) => {
      b.addEventListener("click", () => {
        $$(".seg__btn").forEach((x) => {
          x.classList.remove("is-active");
          x.setAttribute("aria-selected", "false");
          x.setAttribute("tabindex", "-1");
        });
        b.classList.add("is-active");
        b.setAttribute("aria-selected", "true");
        b.setAttribute("tabindex", "0");
        state.tab = b.dataset.tab || "all";
        renderList();
      });
    });

    // global action delegation
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      // 防止一些按钮触发 item 的 :active 手感问题
      onAction(el, action, ev);
    });

    // 图片预览（点击放大 / 长按保存）
    wireImagePreview();

    // 左滑删除功能
    let swipeState = {
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      isSwiping: false,
      currentWrapper: null,
      deleteButtonWidth: 80
    };

    // 重置所有滑动状态
    const resetAllSwipes = () => {
      document.querySelectorAll('.swipe-item-wrapper').forEach(wrapper => {
        wrapper.classList.remove('is-swiped');
        const item = wrapper.querySelector('.item');
        if (item) {
          item.style.transform = '';
        }
      });
    };

    // 处理触摸开始
    const handleTouchStart = (e) => {
      const wrapper = e.target.closest('.swipe-item-wrapper');
      if (!wrapper) return;

      const touch = e.touches[0];
      swipeState.startX = touch.clientX;
      swipeState.startY = touch.clientY;
      swipeState.currentX = touch.clientX;
      swipeState.currentY = touch.clientY;
      swipeState.isSwiping = false;
      swipeState.currentWrapper = wrapper;

      // 如果点击的是删除按钮，不处理滑动
      if (e.target.closest('.swipe-item__delete')) {
        return;
      }
    };

    // 处理触摸移动
    const handleTouchMove = (e) => {
      if (!swipeState.currentWrapper) return;

      const touch = e.touches[0];
      swipeState.currentX = touch.clientX;
      swipeState.currentY = touch.clientY;

      const deltaX = swipeState.currentX - swipeState.startX;
      const deltaY = swipeState.currentY - swipeState.startY;

      // 判断是否为水平滑动（水平距离大于垂直距离）
      if (!swipeState.isSwiping) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
          swipeState.isSwiping = true;
          // 重置其他已滑开的项
          document.querySelectorAll('.swipe-item-wrapper').forEach(wrapper => {
            if (wrapper !== swipeState.currentWrapper) {
              wrapper.classList.remove('is-swiped');
              const item = wrapper.querySelector('.item');
              if (item) {
                item.style.transform = '';
              }
            }
          });
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
          // 垂直滑动，取消滑动状态
          swipeState.isSwiping = false;
          swipeState.currentWrapper = null;
          return;
        }
      }

      if (swipeState.isSwiping) {
        e.preventDefault(); // 防止页面滚动

        const item = swipeState.currentWrapper.querySelector('.item');
        if (!item) return;

        // 只允许向左滑动（负值）
        const translateX = Math.max(-swipeState.deleteButtonWidth, Math.min(0, deltaX));
        item.style.transform = `translateX(${translateX}px)`;
      }
    };

    // 处理触摸结束
    const handleTouchEnd = (e) => {
      if (!swipeState.currentWrapper || !swipeState.isSwiping) {
        swipeState.currentWrapper = null;
        swipeState.isSwiping = false;
        return;
      }

      const deltaX = swipeState.currentX - swipeState.startX;
      const item = swipeState.currentWrapper.querySelector('.item');
      
      if (!item) {
        swipeState.currentWrapper = null;
        swipeState.isSwiping = false;
        return;
      }

      // 如果滑动距离超过删除按钮宽度的一半，则展开；否则收起
      if (deltaX < -swipeState.deleteButtonWidth / 2) {
        swipeState.currentWrapper.classList.add('is-swiped');
        item.style.transform = `translateX(-${swipeState.deleteButtonWidth}px)`;
      } else {
        swipeState.currentWrapper.classList.remove('is-swiped');
        item.style.transform = '';
      }

      swipeState.currentWrapper = null;
      swipeState.isSwiping = false;
    };

    // 绑定触摸事件到列表容器
    if (dom.list) {
      dom.list.addEventListener('touchstart', handleTouchStart, { passive: true });
      dom.list.addEventListener('touchmove', handleTouchMove, { passive: false });
      dom.list.addEventListener('touchend', handleTouchEnd, { passive: true });
      
      // 点击列表外部时收起所有滑动
      document.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.swipe-item-wrapper')) {
          resetAllSwipes();
        }
      });
    }

    // 点击会话进入聊天（需要排除删除按钮）
    dom.list?.addEventListener("click", (ev) => {
      // 如果点击的是删除按钮，不处理
      if (ev.target.closest('.swipe-item__delete')) {
        return;
      }
      
      const item = ev.target.closest(".item");
      if (!item) return;
      const id = item.dataset.id;
      if (!id) return;
      
      // 如果当前项是滑动状态，先收起再进入聊天
      const wrapper = item.closest('.swipe-item-wrapper');
      if (wrapper && wrapper.classList.contains('is-swiped')) {
        wrapper.classList.remove('is-swiped');
        item.style.transform = '';
        return;
      }
      
      navigateToChat(id);
    });

    // 点击新闻进入聊天（点击标题链接时保持原有跳转行为）
    dom.newsList?.addEventListener("click", (ev) => {
      // 如果点击的是标题链接，不处理（保持原有跳转行为）
      if (ev.target.closest(".newsTitleLink")) {
        return;
      }
      // 点击新闻项的其他部分
      const item = ev.target.closest(".newsItem");
      if (!item) return;
      
      // 如果是会话项（从已读新闻转换来的），进入会话聊天
      if (item.classList.contains("newsItem--session")) {
        const id = item.dataset.id;
        if (id) {
          ev.preventDefault();
          navigateToChat(id);
          return;
        }
      }
      
      // 普通新闻项，进入新闻聊天
      const key = item.dataset.key;
      if (!key) return;
      ev.preventDefault();
      navigateToNewsChat(key);
    });

    // 发送消息
    dom.chatComposer?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const text = String(dom.chatInput?.value ?? "").trim();
      if (!text) return;
      
      // 处理新闻聊天
      if (state.view === "newsChat" && state.activeNewsKey) {
        const n = findNewsByKey(state.activeNewsKey);
        if (!n) return;
        
        // 初始化消息数组
        if (!Array.isArray(state.news.chatMessages[state.activeNewsKey])) {
          state.news.chatMessages[state.activeNewsKey] = [];
        }
        const msgs = state.news.chatMessages[state.activeNewsKey];
        
        const now = Date.now();
        const userMessage = { role: "user", content: text, ts: now };
        msgs.push(userMessage);
        
        // 清空输入框并立即渲染用户消息
        dom.chatInput.value = "";
        renderNewsChat();
        // 确保消息发送后滚动到底部
        scrollChatToBottom();
        
        // 添加临时"正在思考..."消息，并禁用发送按钮
        const sendBtn = dom.chatComposer?.querySelector('.chatComposer__btn--send');
        const originalBtnText = sendBtn?.textContent || '发送';
        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.textContent = '发送中...';
          sendBtn.style.opacity = '0.6';
        }
        
        const thinkingMessage = { role: "assistant", content: "正在思考...", ts: Date.now() };
        msgs.push(thinkingMessage);
        renderNewsChat();
        
        // 调用 AI API 获取回复
        try {
          const systemPrompt = '你是一个专业的AI助手，请根据用户提供的消息内容和新闻内容进行回复。';
          
          // 构建用户提示词：包含新闻标题、描述和用户消息
          let userPrompt = `## 新闻标题：\n${n.title || ""}\n\n`;
          if (n.description) {
            userPrompt += `## 新闻描述：\n${n.description}\n\n`;
          }
          userPrompt += `## 用户问题：\n${text}`;
          
          // 调用 prompt 接口
          const aiResponse = await callPromptOnce(systemPrompt, userPrompt);
          
          // 移除"正在思考..."消息
          const thinkingIndex = msgs.findIndex(m => m.content === "正在思考...");
          if (thinkingIndex >= 0) {
            msgs.splice(thinkingIndex, 1);
          }
          
          if (aiResponse && aiResponse.trim()) {
            const aiMessage = {
              role: 'assistant',
              content: aiResponse.trim(),
              ts: Date.now()
            };
            msgs.push(aiMessage);
            
            // 重新渲染聊天界面
            renderNewsChat();
            // 确保 AI 回复后滚动到底部
            scrollChatToBottom();
          } else {
            // 如果没有回复，移除"正在思考..."消息
            renderNewsChat();
          }
        } catch (error) {
          console.error("[YiH5] 发送消息失败：", error);
          // 移除"正在思考..."消息
          const thinkingIndex = msgs.findIndex(m => m.content === "正在思考...");
          if (thinkingIndex >= 0) {
            msgs.splice(thinkingIndex, 1);
          }
          renderNewsChat();
          window.alert("发送消息失败，请稍后重试。");
        } finally {
          // 恢复发送按钮
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = originalBtnText;
            sendBtn.style.opacity = '1';
          }
        }
        return;
      }
      
      // 处理会话聊天（参考 YiPet 项目，只插入消息，不调用 prompt 接口）
      const s = findSessionById(state.activeSessionId);
      if (!s) return;
      if (!Array.isArray(s.messages)) s.messages = [];

      const now = Date.now();
      const userMessage = { role: "user", content: text, ts: now };
      s.messages.push(userMessage);
      s.messageCount = s.messages.length;
      s.lastActiveAt = now;
      s.lastAccessTime = now;
      s.updatedAt = now;
      s.preview = text;

      // 清空输入框并立即渲染用户消息
      dom.chatInput.value = "";
      renderChat();
      // 确保消息发送后滚动到底部
      scrollChatToBottom();

      // 保存会话到后端（参考 YiPet 项目，确保消息被保存）
      try {
        const messagesForBackend = (s.messages || []).map((m) => {
          const role = normalizeRole(m);
          return {
            type: role === "user" ? "user" : "pet",
            content: normalizeText(m),
            timestamp: m.ts || m.timestamp || Date.now(),
            imageDataUrl: m.imageDataUrl || m.image || undefined,
          };
        });

        const payload = {
          id: String(s.id),
          url: s.url || "",
          pageTitle: (s.pageTitle && String(s.pageTitle).trim()) || s.title || "",
          pageDescription: (s.pageDescription && String(s.pageDescription).trim()) || s.preview || "",
          pageContent: s.pageContent || "",
          tags: Array.isArray(s.tags) ? s.tags : [],
          createdAt: s.createdAt || Date.now(),
          updatedAt: s.updatedAt || Date.now(),
          lastAccessTime: s.lastAccessTime || Date.now(),
          messages: messagesForBackend,
        };

        const resp = await fetch("https://api.effiy.cn/session/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          console.warn("[YiH5] 保存会话到后端失败：HTTP", resp.status);
        } else {
          const data = await resp.json().catch(() => null);
          console.log("[YiH5] 消息已保存到后端:", data);
        }
      } catch (e) {
        console.warn("[YiH5] 调用 session/save 保存会话失败：", e);
      }
    });

    // masks
    dom.sheetMask.addEventListener("click", closeFilter);
    dom.faqSheetMask?.addEventListener("click", closeFaq);
    dom.changelogSheetMask?.addEventListener("click", closeChangelog);
    dom.contextSheetMask?.addEventListener("click", closeContext);
    dom.pageDescSheetMask?.addEventListener("click", closePageDescription);

    // mobile: prevent overscroll glow inside sheets
    ["sheet", "faqSheet", "changelogSheet", "contextSheet", "pageDescSheet"].forEach((k) => {
      const el = dom[k];
      el?.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
    });

    // 全局滚动/尺寸变化：驱动虚拟列表刷新（passive 不阻塞滚动线程）
    const onScrollOrResize = () => {
      // 仅在对应页面可见时更新，减少无意义工作
      if (state.bottomTab === "news") requestVListUpdate("news");
      else if (state.view === "list") requestVListUpdate("sessions");
    };
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
  };

  // ---------- Image preview ----------

  const isInWeChat = () => /MicroMessenger/i.test(navigator.userAgent || "");
  const hasWxPreview = () => {
    try {
      return !!(window.wx && typeof window.wx.previewImage === "function");
    } catch {
      return false;
    }
  };

  const isIOS = () => /iPad|iPhone|iPod/i.test(navigator.userAgent || "");

  const isEligiblePreviewImg = (imgEl) => {
    if (!imgEl || imgEl.tagName !== "IMG") return false;
    // 排除预览层内部的 img（避免递归触发）
    if (imgEl.closest?.("#imgPreviewOverlay")) return false;
    // 只对聊天、上下文、页面描述等内容区生效
    return !!imgEl.closest?.(
      ".chatPage__messages, .chatBubble--md, .contextContent, #contextContent, #pageDescContent, .sheet",
    );
  };

  const collectSiblingImageUrls = (imgEl) => {
    const root =
      imgEl.closest?.(".chatPage__messages") ||
      imgEl.closest?.(".contextContent") ||
      imgEl.closest?.("#contextContent") ||
      imgEl.closest?.("#pageDescContent") ||
      imgEl.closest?.(".sheet") ||
      document;
    const imgs = Array.from(root.querySelectorAll("img"));
    const urls = imgs
      .map((x) => String(x.currentSrc || x.src || "").trim())
      .filter(Boolean);
    // 去重但保序
    const seen = new Set();
    const uniq = [];
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      uniq.push(u);
    }
    return uniq;
  };

  const createImagePreviewOverlay = () => {
    if (document.getElementById("imgPreviewOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "imgPreviewOverlay";
    overlay.className = "imgPreviewOverlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="imgPreviewOverlay__backdrop" data-action="closeImgPreview"></div>
      <div class="imgPreviewOverlay__topbar">
        <div class="imgPreviewOverlay__count" id="imgPreviewCount" hidden></div>
        <button type="button" class="imgPreviewOverlay__close" data-action="closeImgPreview" aria-label="关闭预览" title="关闭">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18.3 5.7a1 1 0 0 1 0 1.4L13.4 12l4.9 4.9a1 1 0 1 1-1.4 1.4L12 13.4l-4.9 4.9a1 1 0 1 1-1.4-1.4L10.6 12 5.7 7.1a1 1 0 0 1 1.4-1.4L12 10.6l4.9-4.9a1 1 0 0 1 1.4 0Z"/>
          </svg>
        </button>
      </div>
      <div class="imgPreviewOverlay__content">
        <button type="button" class="imgPreviewNav imgPreviewNav--prev" id="imgPreviewPrevBtn" data-action="imgPreviewPrev" aria-label="上一张" title="上一张" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.7 6.7a1 1 0 0 1 0 1.4L10.8 12l3.9 3.9a1 1 0 1 1-1.4 1.4l-4.6-4.6a1 1 0 0 1 0-1.4l4.6-4.6a1 1 0 0 1 1.4 0Z"/>
          </svg>
        </button>
        <img id="imgPreviewImg" class="imgPreviewOverlay__img" alt="预览图片" />
        <button type="button" class="imgPreviewNav imgPreviewNav--next" id="imgPreviewNextBtn" data-action="imgPreviewNext" aria-label="下一张" title="下一张" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.3 17.3a1 1 0 0 1 0-1.4l3.9-3.9-3.9-3.9a1 1 0 1 1 1.4-1.4l4.6 4.6a1 1 0 0 1 0 1.4l-4.6 4.6a1 1 0 0 1-1.4 0Z"/>
          </svg>
        </button>
      </div>
      <div class="imgPreviewOverlay__hint">
        <div class="imgPreviewOverlay__hintText">点击空白处关闭</div>
      </div>
      <div class="imgPreviewToast" id="imgPreviewToast" aria-hidden="true">
        <div class="imgPreviewToast__text" id="imgPreviewToastText"> </div>
      </div>
      <div class="imgPreviewActions" id="imgPreviewActions" hidden>
        <div class="imgPreviewActions__panel">
          <button type="button" class="imgPreviewActions__btn is-primary" data-action="saveImgPreview">保存图片</button>
          <button type="button" class="imgPreviewActions__btn is-cancel" data-action="closeImgPreviewActions">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  };

  const imgPreviewState = {
    open: false,
    src: "",
    urls: [],
    index: 0,
    swipeStart: null, // { x, y, pointerId }
  };

  const setImgPreviewOpen = (open) => {
    createImagePreviewOverlay();
    const overlay = document.getElementById("imgPreviewOverlay");
    if (!overlay) return;
    imgPreviewState.open = !!open;
    overlay.hidden = !open;
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("is-imgPreviewOpen", open);
    if (!open) {
      imgPreviewState.src = "";
      imgPreviewState.urls = [];
      imgPreviewState.index = 0;
      const img = document.getElementById("imgPreviewImg");
      if (img) img.removeAttribute("src");
      hideImgPreviewActions();
    }
  };

  const syncImgPreviewNav = () => {
    const prevBtn = document.getElementById("imgPreviewPrevBtn");
    const nextBtn = document.getElementById("imgPreviewNextBtn");
    const countEl = document.getElementById("imgPreviewCount");
    const total = Array.isArray(imgPreviewState.urls) ? imgPreviewState.urls.length : 0;
    const idx = Number(imgPreviewState.index) || 0;
    const showNav = total > 1;
    if (prevBtn) prevBtn.hidden = !showNav;
    if (nextBtn) nextBtn.hidden = !showNav;
    if (countEl) {
      countEl.hidden = total <= 1;
      countEl.textContent = total > 1 ? `${Math.min(idx + 1, total)}/${total}` : "";
    }
  };

  const setImgPreviewIndex = (nextIndex) => {
    const urls = Array.isArray(imgPreviewState.urls) ? imgPreviewState.urls : [];
    if (urls.length === 0) return;
    let idx = Number(nextIndex);
    if (!Number.isFinite(idx)) idx = 0;
    // 循环切换
    idx = ((idx % urls.length) + urls.length) % urls.length;
    const url = String(urls[idx] || "").trim();
    if (!url) return;
    createImagePreviewOverlay();
    const img = document.getElementById("imgPreviewImg");
    if (img) img.src = url;
    imgPreviewState.index = idx;
    imgPreviewState.src = url;
    syncImgPreviewNav();
  };

  const openImgPreview = (src, { urls = null } = {}) => {
    const url = String(src || "").trim();
    if (!url) return;
    createImagePreviewOverlay();
    const list = Array.isArray(urls) && urls.length ? urls : [url];
    imgPreviewState.urls = list;
    const idx = list.indexOf(url);
    imgPreviewState.index = idx >= 0 ? idx : 0;
    setImgPreviewOpen(true);
    setImgPreviewIndex(imgPreviewState.index);
  };

  const closeImgPreview = () => setImgPreviewOpen(false);

  const showImgPreviewToast = (text, { ms = 1600 } = {}) => {
    const toast = document.getElementById("imgPreviewToast");
    const t = document.getElementById("imgPreviewToastText");
    if (!toast || !t) return;
    t.textContent = String(text || "");
    toast.classList.add("is-show");
    window.setTimeout(() => toast.classList.remove("is-show"), ms);
  };

  const showImgPreviewActions = () => {
    const box = document.getElementById("imgPreviewActions");
    if (!box) return;
    box.hidden = false;
  };

  const hideImgPreviewActions = () => {
    const box = document.getElementById("imgPreviewActions");
    if (!box) return;
    box.hidden = true;
  };

  const dataUrlToBlob = (dataUrl) => {
    const s = String(dataUrl || "");
    const comma = s.indexOf(",");
    if (comma < 0) return null;
    const header = s.slice(0, comma);
    const base64 = s.slice(comma + 1);
    const m = header.match(/data:([^;]+);base64/i);
    const mime = m ? m[1] : "application/octet-stream";
    try {
      const bin = atob(base64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch {
      return null;
    }
  };

  const pickExtByMime = (mime) => {
    const m = String(mime || "").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    if (m.includes("gif")) return "gif";
    if (m.includes("webp")) return "webp";
    if (m.includes("bmp")) return "bmp";
    return "png";
  };

  const triggerDownloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "image";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const saveImageByUrl = async (src) => {
    const url = String(src || "").trim();
    if (!url) return false;

    // data url：直接转 blob
    if (url.startsWith("data:")) {
      const blob = dataUrlToBlob(url);
      if (!blob) return false;
      const ext = pickExtByMime(blob.type);
      triggerDownloadBlob(blob, `image_${Date.now()}.${ext}`);
      return true;
    }

    // 尝试 fetch（需要 CORS 允许）
    try {
      const resp = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const ext = pickExtByMime(blob.type);
      triggerDownloadBlob(blob, `image_${Date.now()}.${ext}`);
      return true;
    } catch (e) {
      console.warn("[YiH5] 保存图片失败，可能是跨域/无 CORS：", e);
      return false;
    }
  };

  const wireImagePreview = () => {
    createImagePreviewOverlay();

    // 点击图片：打开预览
    document.addEventListener("click", (ev) => {
      const img = ev.target?.closest?.("img");
      if (!img || !isEligiblePreviewImg(img)) return;
      const src = img.currentSrc || img.src || "";
      if (!src) return;

      // 微信环境：优先使用 wx.previewImage（自带保存到相册）
      if (isInWeChat() && hasWxPreview()) {
        const urls = collectSiblingImageUrls(img);
        try {
          window.wx.previewImage({
            current: src,
            urls: urls.length ? urls : [src],
          });
          return;
        } catch (e) {
          console.warn("[YiH5] wx.previewImage 调用失败，回退自定义预览：", e);
        }
      }

      openImgPreview(src, { urls: collectSiblingImageUrls(img) });
    });

    // 预览层内：滑动切换图片
    const overlay = document.getElementById("imgPreviewOverlay");
    overlay?.addEventListener(
      "pointerdown",
      (ev) => {
        const img = ev.target?.closest?.("#imgPreviewImg");
        if (!img) return;
        if (!ev.isPrimary) return;
        imgPreviewState.swipeStart = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
      },
      { passive: true },
    );
    overlay?.addEventListener(
      "pointerup",
      (ev) => {
        const s = imgPreviewState.swipeStart;
        if (!s || s.pointerId !== ev.pointerId) {
          imgPreviewState.swipeStart = null;
          return;
        }
        const dx = ev.clientX - s.x;
        const dy = ev.clientY - s.y;
        imgPreviewState.swipeStart = null;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        // 横向明显滑动才算（避免误触）
        if (absX < 40) return;
        if (absX < absY * 1.2) return;
        if (!Array.isArray(imgPreviewState.urls) || imgPreviewState.urls.length <= 1) return;
        if (dx < 0) setImgPreviewIndex(imgPreviewState.index + 1);
        else setImgPreviewIndex(imgPreviewState.index - 1);
      },
      { passive: true },
    );
    overlay?.addEventListener(
      "pointercancel",
      () => {
        imgPreviewState.swipeStart = null;
      },
      { passive: true },
    );
  };

  const init = async () => {
    loadAuthFromStorage();
    setupVisualViewportBottomInset();
    // 恢复折叠展开状态（跨会话/返回仍保留）
    try {
      state.chatUi.foldExpanded = loadChatFoldState();
    } catch {
      state.chatUi.foldExpanded = {};
    }
    // 默认显示全部会话（不设置日期过滤）
    setSelectedDate("", { syncPicker: true, render: false });
    // 默认显示会话视图（不读取 localStorage，始终默认会话）
    state.bottomTab = "sessions";
    // 确保初始状态是列表页（不显示回退按钮）
    setView("list");
    wire();
    // 从API获取数据
    await fetchSessions();
    // 初次渲染由路由决定
    await setBottomTab("sessions", { persist: false });
    
    // 检查并显示删除成功的消息（如果存在）
    // 延迟显示，确保页面已经渲染完成
    setTimeout(() => {
      try {
        const deleteSuccessKey = 'YiH5.deleteSuccess.v1';
        const deleteSuccessData = localStorage.getItem(deleteSuccessKey);
        if (deleteSuccessData) {
          const data = JSON.parse(deleteSuccessData);
          // 只显示最近5分钟内的删除成功消息
          if (Date.now() - data.timestamp < 5 * 60 * 1000) {
            showToast(data.message);
          }
          // 清除已显示的消息
          localStorage.removeItem(deleteSuccessKey);
        }
      } catch (e) {
        // ignore localStorage errors
      }
    }, 500);
  };

  window.addEventListener("hashchange", applyRoute);
  init();
})();










