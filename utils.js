/**
 * 工具函数模块
 * 包含日期处理、字符串处理、HTML转义等通用工具
 */

// ---------- 日期工具 ----------
export const dateUtil = {
  formatYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },
  parseYMD(ymd) {
    if (!ymd) return null;
    try {
      const parts = String(ymd).split("-");
      if (!parts || !Array.isArray(parts) || parts.length !== 3) return null;
      if (!parts[0] || !parts[1] || !parts[2]) return null;
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      const dt = new Date(y, m - 1, d);
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
    return this.formatYMD(base);
  },
  todayYMD() {
    return this.formatYMD(new Date());
  },
};

// ---------- 字符串工具 ----------
export const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const cssEscape = (s) => {
  const str = String(s ?? "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(str);
  return str.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
};

// ---------- URL 验证 ----------
export const isSafeUrl = (href) => {
  const s = String(href || "").trim();
  if (!s) return false;
  if (s.startsWith("http://") || s.startsWith("https://")) return true;
  if (s.startsWith("data:")) return true;
  return false;
};

// ---------- 格式化工具 ----------
export const fmt = {
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

// ---------- 日期验证 ----------
export const isValidYMD = (ymd) => {
  if (!ymd) return false;
  return dateUtil.parseYMD(ymd) !== null;
};

// ---------- 平台检测 ----------
export const isIOS = () => /iPad|iPhone|iPod/i.test(navigator.userAgent || "");
export const isInWeChat = () => /MicroMessenger/i.test(navigator.userAgent || "");

