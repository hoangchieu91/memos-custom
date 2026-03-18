/**
 * AI Date Detector — Nhận dạng ngày quá khứ từ nội dung tự nhiên
 *
 * Hỗ trợ:
 *   - Tuyệt đối:  "15/3", "15-3-2026", "ngày 15 tháng 3"
 *   - Tương đối:  "hôm qua", "hôm kia", "3 ngày trước", "tuần trước"
 *                 "2 tuần trước", "tháng trước", "yesterday", "last week"
 *   - Thứ trong tuần: "thứ 2 tuần trước", "thứ Hai vừa rồi"
 *
 * Chỉ trả về ngày trong QUÁ KHỨ (tương lai → null)
 */

const NOW = () => new Date();

// helpers
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Vietnamese day-of-week → 0 (Sun) … 6 (Sat)
const VI_DOW: Record<string, number> = {
  "chủ nhật": 0, "cn": 0,
  "thứ hai": 1, "t2": 1, "thứ 2": 1,
  "thứ ba":  2, "t3": 2, "thứ 3": 2,
  "thứ tư":  3, "t4": 3, "thứ 4": 3,
  "thứ năm": 4, "t5": 4, "thứ 5": 4,
  "thứ sáu": 5, "t6": 5, "thứ 6": 5,
  "thứ bảy": 6, "t7": 6, "thứ 7": 6,
};

const VI_MONTH: Record<string, number> = {
  "tháng 1": 0, "tháng một": 0, "jan": 0, "january": 0,
  "tháng 2": 1, "tháng hai": 1, "feb": 1, "february": 1,
  "tháng 3": 2, "tháng ba":  2, "mar": 2, "march": 2,
  "tháng 4": 3, "tháng tư":  3, "apr": 3, "april": 3,
  "tháng 5": 4, "tháng năm": 4, "may": 4,
  "tháng 6": 5, "tháng sáu": 5, "jun": 5, "june": 5,
  "tháng 7": 6, "tháng bảy": 6, "jul": 6, "july": 6,
  "tháng 8": 7, "tháng tám": 7, "aug": 7, "august": 7,
  "tháng 9": 8, "tháng chín": 8, "sep": 8, "september": 8,
  "tháng 10": 9, "oct": 9, "october": 9,
  "tháng 11": 10, "nov": 10, "november": 10,
  "tháng 12": 11, "dec": 11, "december": 11,
};

function isPast(d: Date): boolean {
  return startOfDay(d) < startOfDay(NOW());
}

export function detectPastDate(content: string): Date | null {
  if (!content) return null;
  const text = content.toLowerCase();
  const today = startOfDay(NOW());
  const year = today.getFullYear();

  // ── 1. Exact relative keywords ────────────────────────────────────────────
  if (/\bhôm qua\b|yesterday/i.test(text)) return addDays(today, -1);
  if (/\bhôm kia\b|day before yesterday/i.test(text)) return addDays(today, -2);

  // ── 2. Relative: X days/weeks/months ago ─────────────────────────────────
  const relMatch = text.match(/(\d+)\s*(ngày|day[s]?)\s*(trước|ago)/i);
  if (relMatch) {
    const d = addDays(today, -parseInt(relMatch[1]));
    if (isPast(d)) return d;
  }
  const relWeek = text.match(/(\d+)\s*(tuần|week[s]?)\s*(trước|ago)/i);
  if (relWeek) {
    const d = addDays(today, -parseInt(relWeek[1]) * 7);
    if (isPast(d)) return d;
  }
  const relMonth = text.match(/(\d+)\s*(tháng|month[s]?)\s*(trước|ago)/i);
  if (relMonth) {
    const d = new Date(today);
    d.setMonth(d.getMonth() - parseInt(relMonth[1]));
    if (isPast(d)) return startOfDay(d);
  }

  // ── 3. "tuần trước" / "last week" ────────────────────────────────────────
  if (/tuần trước|last week/i.test(text)) return addDays(today, -7);
  if (/tháng trước|last month/i.test(text)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 1);
    return startOfDay(d);
  }

  // ── 4. Day of week + tuần trước ──────────────────────────────────────────
  for (const [dayName, dow] of Object.entries(VI_DOW)) {
    const re = new RegExp(`${dayName}\\s*(tuần trước|last week|vừa rồi)`, "i");
    if (re.test(text)) {
      const cur = today.getDay();
      let diff = cur - dow + 7; // how many days ago was last <dayName>?
      if (diff === 0) diff = 7;
      if (diff < 7) diff += 7; // ensure it's truly last week
      const d = addDays(today, -diff);
      if (isPast(d)) return d;
    }
  }

  // ── 5. Absolute date: dd/mm or dd/mm/yyyy ────────────────────────────────
  const absSlash = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/);
  if (absSlash) {
    const d = parseInt(absSlash[1]);
    const m = parseInt(absSlash[2]) - 1;
    const y = absSlash[3] ? parseInt(absSlash[3]) : year;
    const candidate = startOfDay(new Date(y, m, d));
    if (isPast(candidate) && m >= 0 && m <= 11 && d >= 1 && d <= 31) return candidate;
  }

  // ── 6. "ngày X tháng Y" ──────────────────────────────────────────────────
  const viAbsMatch = text.match(/ngày\s*(\d{1,2})\s*(tháng\s*\d{1,2}|\w+)/i);
  if (viAbsMatch) {
    const d = parseInt(viAbsMatch[1]);
    const mStr = viAbsMatch[2].trim().replace(/\s+/, " ");
    const m = VI_MONTH[mStr];
    if (m !== undefined) {
      const candidate = startOfDay(new Date(year, m, d));
      if (isPast(candidate)) return candidate;
      // Try previous year
      const prev = startOfDay(new Date(year - 1, m, d));
      if (isPast(prev)) return prev;
    }
  }

  // ── 7. "ngày X" alone (infer current/last month) ─────────────────────────
  const dayOnly = text.match(/\bngày\s*(\d{1,2})\b(?!\s*(?:tháng|tháng|\/))/i);
  if (dayOnly) {
    const d = parseInt(dayOnly[1]);
    const candidate = startOfDay(new Date(year, today.getMonth(), d));
    if (isPast(candidate)) return candidate;
    // Try last month
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const prev = startOfDay(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), d));
    if (isPast(prev)) return prev;
  }

  return null;
}

export function formatDetectedDate(d: Date): string {
  return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export default detectPastDate;
