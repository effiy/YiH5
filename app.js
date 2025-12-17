(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  const renderMarkdown = (text) => {
    const raw = String(text ?? "").trim();
    if (!raw) return "";

    // 有 marked 就用（和插件端一致：允许基础 HTML / code fence）
    if (typeof window.marked !== "undefined" && typeof window.marked.parse === "function") {
      try {
        window.marked.setOptions({
          breaks: true,
          gfm: true,
        });
        return window.marked.parse(raw);
      } catch (e) {
        console.warn("[YiH5] Markdown 渲染失败，回退纯文本：", e);
      }
    }

    // 回退：纯文本换行
    return escapeHtml(raw).replaceAll("\n", "<br/>");
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
      return `${y}-${m}-${day}`;
    },
    parseYMD(ymd) {
      if (!ymd) return null;
      const parts = String(ymd).split("-");
      if (!Array.isArray(parts) || parts.length !== 3) return null;
      // 确保所有部分都存在且非空
      if (!parts[0] || !parts[1] || !parts[2]) return null;
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      const dt = new Date(y, m - 1, d);
      // 防止 2025-02-31 之类被 Date 自动进位
      if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
      return dt;
    },
    addDaysYMD(ymd, delta) {
      const base = this.parseYMD(ymd) || new Date();
      base.setDate(base.getDate() + delta);
      return this.formatYMD(base);
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
    view: "list", // list | chat
    activeSessionId: "",
    isDraggingTag: false, // 标签拖拽排序中（用于抑制 click 触发筛选）
    faq: {
      items: [],
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
    sessions: [],
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
    try {
      const response = await fetch("https://api.effiy.cn/session/");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // 处理API返回的数据，确保数据格式正确
      // 如果API返回的是数组，直接使用；如果是对象包含data字段，使用data字段
      const sessions = Array.isArray(data) ? data : (data.data || data.sessions || []);
      
      state.lastError = "";
      // 映射为页面使用的统一结构（兼容你提供的接口字段）
      state.sessions = sessions.map((s) => {
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
    } catch (error) {
      console.error("获取会话列表失败:", error);
      // 如果API请求失败，使用空数组，避免应用崩溃
      state.sessions = [];
      // 页面内提示（避免 alert 打断体验）
      const isFile = location.protocol === "file:";
      state.lastError = isFile
        ? "获取会话列表失败：当前以 file:// 打开页面，跨域请求可能被浏览器拦截。建议用本地静态服务器打开再试。"
        : "获取会话列表失败：请稍后重试。";
    }
  };

  const dom = {
    app: $("#app"),
    topbarLeft: $(".topbar__left"),
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
    faqSheetMask: $("#faqSheetMask"),
    faqSheet: $("#faqSheet"),
    faqList: $("#faqList"),
    faqEmpty: $("#faqEmpty"),
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
      const resp = await fetch(FAQ_API_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const result = await resp.json();
      const list = extractFaqList(result);
      state.faq.items = normalizeFaqs(list);
      state.faq.loadedAt = Date.now();
      state.faq.error = "";
      return state.faq.items;
    } catch (e) {
      console.warn("[YiH5] 获取常见问题失败：", e);
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

  const openFaq = async () => {
    if (!dom.faqSheet || !dom.faqSheetMask) return;
    dom.faqSheetMask.hidden = false;
    dom.faqSheet.classList.add("is-open");
    dom.faqSheet.setAttribute("aria-hidden", "false");
    renderFaqSheet();
    await fetchFaqs();
  };

  const closeFaq = () => {
    if (!dom.faqSheet || !dom.faqSheetMask) return;
    dom.faqSheet.classList.remove("is-open");
    dom.faqSheet.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dom.faqSheet.classList.contains("is-open")) dom.faqSheetMask.hidden = true;
    }, 220);
  };

  const insertFaqText = (text) => {
    const input = dom.chatInput;
    if (!input) return;
    const toInsert = String(text ?? "").trim();
    if (!toInsert) return;

    const value = String(input.value ?? "");
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : value.length;
    const next = value.slice(0, start) + toInsert + value.slice(end);
    input.value = next;

    const caret = start + toInsert.length;
    try {
      input.setSelectionRange(caret, caret);
    } catch {
      // ignore
    }
    input.focus();
    closeFaq();
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
    btn.addEventListener("click", () => {
      // 需求：返回到会话列表（避免退回到站点外部历史记录）
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

  const findSessionById = (id) => state.sessions.find((s) => String(s.id) === String(id));

  const normalizeRole = (m) => {
    const r = String(m?.role ?? m?.sender ?? m?.type ?? "").toLowerCase();
    if (r === "user" || r === "me") return "user";
    if (r === "assistant" || r === "bot" || r === "ai" || r === "pet") return "assistant";
    // 兜底：如果接口没有 role，优先把 user 字段当用户消息
    if (m?.isUser === true) return "user";
    return "assistant";
  };

  const normalizeText = (m) => String(m?.content ?? m?.text ?? m?.message ?? "").trim();

  const renderChat = () => {
    const s = findSessionById(state.activeSessionId);
    if (!s) {
      dom.chatMessages.innerHTML = `<div class="empty" style="background:transparent;box-shadow:none">
        <div class="empty__icon">💬</div>
        <div class="empty__title">找不到该会话</div>
        <div class="empty__desc">请返回会话列表重试</div>
      </div>`;
      return;
    }

    const title = (s.pageTitle && s.pageTitle.trim()) || s.title || "会话";
    dom.chatTitle.textContent = title;

    const msgs = Array.isArray(s.messages) ? s.messages.filter(m => m != null) : [];
    if (msgs.length === 0) {
      dom.chatMessages.innerHTML = `<div class="empty" style="background:transparent;box-shadow:none">
        <div class="empty__icon">🗨️</div>
        <div class="empty__title">暂无消息</div>
        <div class="empty__desc">发送一条消息开始聊天</div>
      </div>`;
    } else {
      dom.chatMessages.innerHTML = msgs
        .map((m) => {
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
            contentHtml += `<div class="chatImage" style="max-width: 200px; margin-bottom: 8px;">
              <img src="${escapeHtml(imageDataUrl)}" alt="图片" style="max-width: 100%; border-radius: 4px;" />
            </div>`;
          }
          if (text) {
            contentHtml += `<div class="chatBubble chatBubble--md">${renderMarkdown(text)}</div>`;
          }
          if (!imageDataUrl && !text) {
            contentHtml = `<div class="chatBubble">…</div>`;
          }
          
          return `
            <div class="${cls}">
              ${isMe ? "" : `<div class="chatAvatar" aria-hidden="true">${avatar}</div>`}
              ${contentHtml}
              ${isMe ? `<div class="chatAvatar" aria-hidden="true">${avatar}</div>` : ""}
            </div>
          `;
        })
        .join("");
    }

    // 滚到底
    requestAnimationFrame(() => {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    });

    // Mermaid 渲染（异步，不阻塞首屏）
    setTimeout(() => {
      renderMermaidIn(dom.chatMessages);
    }, 0);
  };

  const setView = (view) => {
    state.view = view;
    if (view === "chat") dom.app.classList.add("is-chat");
    else dom.app.classList.remove("is-chat");

    const isChat = view === "chat";
    dom.pageSessions.hidden = isChat;
    dom.pageChat.hidden = !isChat;

    // 首页（list）不需要返回按钮及功能：仅聊天页挂载
    if (isChat) mountChatBackBtn();
    else unmountChatBackBtn();
  };

  const navigateToList = () => {
    location.hash = "#/";
  };

  const navigateToChat = (id) => {
    location.hash = `#/chat?id=${encodeURIComponent(String(id))}`;
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
    return { name: "list" };
  };

  // 获取会话详情
  const fetchSessionDetail = async (sessionId) => {
    if (!sessionId) return null;
    
    try {
      const response = await fetch(`https://api.effiy.cn/session/${encodeURIComponent(sessionId)}`);
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
      
      // 如果返回了 messages 字段，更新到会话中
      if (Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
        const s = findSessionById(sessionId);
        if (s) {
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
          
          // 如果接口返回了其他会话信息，也更新一下
          if (sessionData.title) s.title = sessionData.title;
          if (sessionData.pageTitle) s.pageTitle = sessionData.pageTitle;
          if (sessionData.pageDescription) s.pageDescription = sessionData.pageDescription;
          if (sessionData.preview) s.preview = sessionData.preview;
        }
      }
      
      return sessionData;
    } catch (error) {
      console.error("获取会话详情失败:", error);
      return null;
    }
  };

  const applyRoute = async () => {
    const r = parseRoute();
    if (r.name === "chat" && r.id) {
      state.activeSessionId = r.id;
      setView("chat");
      // 先渲染一次（可能使用本地缓存的数据）
      renderChat();
      // 然后调用接口获取最新的会话详情
      await fetchSessionDetail(r.id);
      // 获取详情后重新渲染
      renderChat();
      return;
    }
    state.activeSessionId = "";
    setView("list");
    renderList();
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

    // 默认按最近互动排序
    arr.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
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
    const arr = filterAndSort();
    renderChips();

    dom.empty.hidden = arr.length !== 0;
    dom.empty.querySelector(".empty__title")?.replaceChildren(document.createTextNode(state.lastError ? "加载失败" : "暂无匹配会话"));
    dom.empty.querySelector(".empty__desc")?.replaceChildren(
      document.createTextNode(state.lastError ? state.lastError : "试试清空搜索或调整筛选条件（也可清空日期过滤）"),
    );
    dom.list.innerHTML = arr.map(renderItem).join("");
  };

  const renderItem = (s) => {
    const letter = (s.title || "A").trim().slice(0, 1);
    const badges = [
      s.muted ? `<span class="badge">免打扰</span>` : "",
      s.messageCount > 0 ? `<span class="badge">消息 ${escapeHtml(String(s.messageCount))}</span>` : `<span class="badge">暂无消息</span>`,
    ].join("");

    const mutedCls = s.muted ? " is-muted" : "";
    // 优先显示 pageTitle，如果没有则显示 title
    const displayTitle = (s.pageTitle && s.pageTitle.trim()) || s.title || "未命名会话";
    // 优先显示 pageDescription，如果没有则显示 preview
    const displayDesc = (s.pageDescription && s.pageDescription.trim()) || s.preview || "—";
    
    return `
      <article class="item${mutedCls}" data-id="${s.id}">
        <div class="item__left" aria-hidden="true">${escapeHtml(letter)}</div>
        <div class="item__mid">
          <div class="item__row1">
            <div class="item__title">${escapeHtml(displayTitle)}</div>
            <div class="item__meta">
              <span class="time">${escapeHtml(fmt.time(s.lastAccessTime || s.lastActiveAt))}</span>
            </div>
          </div>
          <div class="item__row2">
            <div class="item__preview">${escapeHtml(displayDesc)}</div>
          </div>
          <div class="item__row2" style="margin-top:6px">
            <div class="item__preview">${escapeHtml((s.tags && s.tags.length ? s.tags : ["无"]).join(" / "))}</div>
            <div class="item__meta">${badges}</div>
          </div>
        </div>
        <div class="item__right">
        </div>
      </article>
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

  const resetFilter = () => {
    state.filterDraft = {
      selectedTags: [],
    };
    // 重新渲染标签列表以更新选中状态
    renderTagFilters();
  };

  const deleteOne = (id) => {
    state.sessions = state.sessions.filter((x) => x.id !== id);
  };

  const kv = (k, v) => `<div class="kv"><div class="kv__k">${escapeHtml(k)}</div><div class="kv__v">${escapeHtml(v)}</div></div>`;

  const removeChip = (key, tagValue) => {
    if (key === "q") state.q = "";
    if (key === "date") {
      state.selectedDate = "";
      dom.datePicker.value = "";
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
    renderList();
  };

  const setSelectedDate = (ymd, { syncPicker = true, render = true } = {}) => {
    state.selectedDate = ymd || "";
    if (syncPicker) dom.datePicker.value = state.selectedDate;
    if (render) renderList();
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

  const onAction = (el, action, ev) => {
    if (!action) return;
    if (action === "noop") return;
    if (action === "openFilter") return openFilter();
    if (action === "closeFilter") return closeFilter();
    if (action === "applyFilter") return applyFilter();
    if (action === "resetFilter") return resetFilter();
    if (action === "openFaq") return openFaq();
    if (action === "closeFaq") return closeFaq();
    if (action === "refreshFaq") return fetchFaqs({ force: true });
    if (action === "insertFaq") {
      const t = el.dataset.faqText;
      return insertFaqText(t);
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

    if (action === "removeChip") {
      const chipKey = el.dataset.key;
      const tagValue = el.dataset.tagValue;
      return removeChip(chipKey, tagValue);
    }

  };

  const wire = () => {
    // date picker
    const openNativeDatePicker = () => {
      // showPicker: Chrome/Edge 等支持；iOS/部分 WebView 可能没有
      if (typeof dom.datePicker.showPicker === "function") {
        dom.datePicker.showPicker();
        return;
      }
      dom.datePicker.focus();
      // 对于不支持 showPicker 的浏览器，尝试触发点击
      dom.datePicker.click();
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
      openNativeDatePicker();
    });

    // 同时监听 change 和 input 事件，确保兼容性
    const handleDateChange = () => {
      const value = dom.datePicker.value;
      // 允许清空日期（value 为空字符串时也更新状态）
      setSelectedDate(value || "");
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

    // 点击会话进入聊天
    dom.list?.addEventListener("click", (ev) => {
      const item = ev.target.closest(".item");
      if (!item) return;
      const id = item.dataset.id;
      if (!id) return;
      navigateToChat(id);
    });

    // 发送消息
    dom.chatComposer?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const text = String(dom.chatInput?.value ?? "").trim();
      if (!text) return;
      const s = findSessionById(state.activeSessionId);
      if (!s) return;
      if (!Array.isArray(s.messages)) s.messages = [];

      s.messages.push({ role: "user", content: text, ts: Date.now() });
      // 简单模拟一条 AI 回复（没有后端的情况下保证聊天页可用）
      s.messages.push({ role: "assistant", content: "收到，我已记录。", ts: Date.now() });
      s.messageCount = s.messages.length;
      s.lastActiveAt = Date.now();
      s.lastAccessTime = Date.now();
      s.updatedAt = Date.now();
      s.preview = text;

      dom.chatInput.value = "";
      renderChat();
    });

    // masks
    dom.sheetMask.addEventListener("click", closeFilter);
    dom.faqSheetMask?.addEventListener("click", closeFaq);

    // mobile: prevent overscroll glow inside sheets
    ["sheet"].forEach((k) => {
      const el = dom[k];
      el.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
    });
  };

  const init = async () => {
    // 默认显示今天（并按今天过滤）；用户仍可手动清空日期来取消过滤
    setSelectedDate(dateUtil.todayYMD(), { syncPicker: true, render: false });
    // 确保初始状态是列表页（不显示回退按钮）
    setView("list");
    wire();
    // 从API获取数据
    await fetchSessions();
    // 初次渲染由路由决定
    applyRoute();
  };

  window.addEventListener("hashchange", applyRoute);
  init();
})();



