/**
 * Markdown 渲染模块
 * 处理 Markdown 和 Mermaid 的渲染
 */

import { escapeHtml, isSafeUrl } from "./utils.js";

// ---------- Markdown 配置 ----------
let markedConfigured = false;

const ensureMarkedConfigured = () => {
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
    // 外链默认新开，只有以 http 开头的网址才渲染为超链接，import- 开头的转换为纯文本
    renderer.link = (href, title, text) => {
      const urlStr = String(href || "").trim();
      const label = text || href || "";
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      // 只有以 http:// 或 https:// 开头的网址才渲染为超链接，import- 开头的转换为纯文本
      if (!urlStr || 
          urlStr.startsWith("import-") || 
          (!urlStr.startsWith("http://") && !urlStr.startsWith("https://"))) {
        return `<span>${escapeHtml(label)}</span>`;
      }
      return `<a href="${escapeHtml(urlStr)}"${t} target="_blank" rel="noopener noreferrer">${label}</a>`;
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
export const renderMarkdown = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  if (typeof window.marked !== "undefined" && typeof window.marked.parse === "function") {
    try {
      ensureMarkedConfigured();
      let html = window.marked.parse(raw);
      // 处理渲染后的 HTML：将非 http 开头的链接转换为纯文本
      if (html) {
        // 使用临时 DOM 元素来处理链接
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const links = tempDiv.querySelectorAll('a');
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const urlStr = String(href).trim();
          // 只有以 http:// 或 https:// 开头的网址才保留为链接，import- 开头的转换为纯文本
          if (!urlStr || 
              urlStr.startsWith("import-") || 
              (!urlStr.startsWith("http://") && !urlStr.startsWith("https://"))) {
            // 转换为纯文本节点
            const textNode = document.createTextNode(link.textContent || href || '');
            link.parentNode.replaceChild(textNode, link);
          }
        });
        html = tempDiv.innerHTML;
      }
      return html;
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

