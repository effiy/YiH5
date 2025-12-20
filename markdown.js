/**
 * Markdown 渲染模块
 * 处理 Markdown 和 Mermaid 的渲染
 */

// ---------- Markdown 配置 ----------
let markedConfigured = false;

const ensureMarkedConfigured = (escapeHtml, isSafeUrl) => {
  if (markedConfigured) return;
  if (typeof window.marked === "undefined" || typeof window.marked.parse !== "function") return;
  try {
    const renderer = new window.marked.Renderer();
    // 给 Markdown 图片加懒加载与异步解码
    renderer.image = (href, title, text) => {
      const src = isSafeUrl(href) ? String(href || "").trim() : "";
      const alt = escapeHtml(text || "");
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      if (!src) return alt ? `<span>${alt}</span>` : "";
      return `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async" fetchpriority="low"${t} />`;
    };
    // 外链默认新开
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

// ---------- Markdown 渲染 ----------
export const renderMarkdown = (text, escapeHtml, isSafeUrl) => {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  if (typeof window.marked !== "undefined" && typeof window.marked.parse === "function") {
    try {
      ensureMarkedConfigured(escapeHtml, isSafeUrl);
      return window.marked.parse(raw);
    } catch (e) {
      console.warn("[YiH5] Markdown 渲染失败，回退纯文本：", e);
    }
  }

  // 回退：纯文本换行
  return escapeHtml(raw).replaceAll("\n", "<br/>");
};

// ---------- Mermaid 初始化 ----------
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

// ---------- Mermaid 代码块替换 ----------
const replaceMermaidCodeBlocks = (root) => {
  if (!root) return [];
  const codeBlocks = root.querySelectorAll(
    "pre > code.language-mermaid, pre > code.language-mmd, code.language-mermaid, code.language-mmd",
  );
  const created = [];

  codeBlocks.forEach((code, idx) => {
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

// ---------- Mermaid 渲染 ----------
export const renderMermaidIn = async (root) => {
  if (!initMermaidOnce()) return;
  const nodes = replaceMermaidCodeBlocks(root);
  if (nodes.length === 0) return;
  try {
    await window.mermaid.run({ nodes });
  } catch (e) {
    console.warn("[YiH5] Mermaid 渲染失败：", e);
  }
};

