/**
 * Smart Auto-Tag Engine
 * 
 * Detects content patterns and suggests tags automatically.
 * User doesn't need to remember ANY tags — just write naturally.
 * 
 * Examples:
 *   "Mua hộ Tuấn 2 ESP32 500k" → #debt/receivable @Tuấn
 *   "Mua MacBook Pro 32tr" → #asset/buy #asset/electronics
 *   "Cho anh Hùng mượn multimeter" → #asset/lend
 *   "Cần deploy server trước thứ 6" → #task #tech
 *   "Họp với team design lúc 3pm" → #meeting
 */

interface TagRule {
  tag: string;
  keywords: RegExp;
  priority: number; // Higher = checked first
}

const TAG_RULES: TagRule[] = [
  // === INCOME / REVENUE ===
  { tag: "#income", keywords: /\b(lương|thưởng|bonus|freelance|project|dự án|thu nhập|tiền về|nạp|phụ cấp|per diem|thanh toán từ)\b/i, priority: 110 },

  // === DEBT / CREDIT ===
  { tag: "#debt/receivable", keywords: /mua\s*hộ|bán\s*chịu|cho\s*(vay|mượn\s*tiền)|nợ\s*mình|họ\s*nợ/i, priority: 100 },
  { tag: "#debt/payable", keywords: /mình\s*nợ|tôi\s*nợ|mượn\s*(tiền|của)|phải\s*trả\s*(lại|cho)/i, priority: 100 },
  { tag: "#debt/settled", keywords: /đã\s*trả|tất\s*toán|thanh\s*toán\s*xong|trả\s*hết|đã\s*chuyển/i, priority: 100 },

  // === ASSET / PURCHASE ===
  { tag: "#asset/buy", keywords: /\b(mua|đặt\s*mua|order|shopee|lazada|tiki|amazon)\b/i, priority: 90 },
  { tag: "#asset/lend", keywords: /cho\s*(mượn|bạn|anh|chị|em)\s*mượn|lend/i, priority: 90 },
  { tag: "#asset/return", keywords: /\b(trả\s*lại|thu\s*hồi|lấy\s*lại|returned)\b/i, priority: 90 },
  { tag: "#asset/electronics", keywords: /\b(esp32|arduino|raspberry|macbook|laptop|iphone|ipad|tablet|camera|mic|loa|tai\s*nghe|sạc|cable|adapter|monitor|keyboard|mouse|ổ\s*cứng|ssd|ram)\b/i, priority: 80 },
  { tag: "#asset/software", keywords: /\b(license|subscription|saas|domain|hosting|ssl|github|figma|notion|adobe|office|windows|docker)\b/i, priority: 80 },

  // === EXPENSE / DAILY SPENDING ===
  { tag: "#expense", keywords: /\b(ăn|phở|bún|cơm|bánh|pizza|cà phê|cafe|coffee|trà|bia|rượu|sinh tố|nước|quần|áo|giày|dép|túi|uniqlo|xăng|grab|taxi|gojek|phim|karaoke|game|đi chơi|du lịch|gym|tập|thuốc|sách|quà|điện|internet|wifi)\b/i, priority: 85 },

  // === TASK / TODO ===
  { tag: "#task", keywords: /\b(cần|phải|todo|deadline|trước\s*ngày|hoàn\s*thành|nhắc|remember|dự\s*kiến)\b/i, priority: 70 },

  // === FINANCE ===
  { tag: "#finance", keywords: /\b(tiền|chi\s*phí|thanh\s*toán|hóa\s*đơn|invoice|lương|thưởng|thuế|ngân\s*hàng|chuyển\s*khoản|vnpay|momo)\b/i, priority: 70 },

  // === MEETING ===
  { tag: "#meeting", keywords: /\b(họp|meeting|gặp|trao\s*đổi|thảo\s*luận|call|zoom|google\s*meet|teams)\b/i, priority: 60 },

  // === CRM / CONTACTS ===
  { tag: "#crm", keywords: /\b(khách|client|công\s*ty|sđt|số\s*điện\s*thoại|email|liên\s*hệ|hợp\s*đồng|báo\s*giá|quotation)\b/i, priority: 60 },

  // === TECH ===
  { tag: "#tech", keywords: /\b(deploy|server|code|bug|fix|git|docker|api|database|firmware|ota|mqtt|esp|python|react|nodejs)\b/i, priority: 50 },

  // === PERSONAL ===
  { tag: "#personal", keywords: /\b(nhật\s*ký|hôm\s*nay|cảm\s*xúc|suy\s*nghĩ|diary|journal|tâm\s*trạng)\b/i, priority: 40 },

  // === HEALTH ===
  { tag: "#health", keywords: /\b(sức\s*khỏe|bệnh|thuốc|bác\s*sĩ|khám|tập|gym|chạy\s*bộ|yoga|cân\s*nặng|huyết\s*áp)\b/i, priority: 40 },

  // === TRAVEL ===
  { tag: "#travel", keywords: /\b(du\s*lịch|bay|flight|visa|hotel|khách\s*sạn|booking|chuyến|trip)\b/i, priority: 40 },

  // === IDEA ===
  { tag: "#idea", keywords: /\b(ý\s*tưởng|brainstorm|idea|concept|thử|experiment|nghiên\s*cứu)\b/i, priority: 30 },
];

/**
 * Extract @person mentions from text
 */
function extractPersonMention(text: string): string | null {
  const match = text.match(/@([\w\u00C0-\u024F\u1E00-\u1EFF]+)/);
  if (match) return match[1];
  
  // Auto-detect person names after key phrases
  const namePatterns = [
    /(?:mua\s*hộ|cho|bán\s*chịu\s*(?:cho)?|nợ|trả)\s+(?:anh\s+|chị\s+|em\s+|bạn\s+)?([\p{Lu}][\p{L}]+)/u,
  ];
  for (const pattern of namePatterns) {
    const m = text.match(pattern);
    if (m) return m[1];
  }
  return null;
}

/**
 * Suggest tags for a memo content.
 * Returns tags that should be appended (excludes already-present tags).
 */
export function suggestTags(content: string): string[] {
  if (!content || content.trim().length < 5) return [];

  // Find existing tags in content
  const existingTags = new Set(
    (content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || []).map((t) => t.toLowerCase())
  );

  const suggested: string[] = [];
  const sortedRules = [...TAG_RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (rule.keywords.test(content) && !existingTags.has(rule.tag.toLowerCase())) {
      suggested.push(rule.tag);
    }
  }

  // Auto-detect @person for debt tags
  if (suggested.some((t) => t.startsWith("#debt/"))) {
    const person = extractPersonMention(content);
    if (person && !content.includes(`@${person}`)) {
      suggested.push(`@${person}`);
    }
  }

  // Limit to max 4 tags to avoid clutter
  return suggested.slice(0, 4);
}

/**
 * Apply suggested tags to content (append at the end)
 */
export function applyAutoTags(content: string): string {
  const tags = suggestTags(content);
  if (tags.length === 0) return content;
  
  // Append tags on a new line at the end
  const tagLine = tags.join(" ");
  return `${content.trimEnd()}\n${tagLine}`;
}

export default suggestTags;
