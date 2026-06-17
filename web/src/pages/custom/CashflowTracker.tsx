import {
  BanknoteIcon,
  BarChart3Icon,
  BookOpenIcon,
  CarIcon,
  CheckCircleIcon,
  CoffeeIcon,
  ExternalLinkIcon,
  GiftIcon,
  HeartIcon,
  LoaderIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShirtIcon,
  ShoppingBagIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UtensilsIcon,
  WalletIcon,
  WrenchIcon,
  ZapIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useInfiniteMemos, useUpdateMemo, memoKeys } from "@/hooks/useMemoQueries";
import { useQueryClient } from "@tanstack/react-query";
import { State } from "@/types/proto/api/v1/common_pb";
import toast from "react-hot-toast";

// ============================================================================
// NocoDB Config (shared with AssetManager)
// ============================================================================

const NOCODB_DIRECT = `http://${window.location.hostname}:8088`;
const NOCODB_TOKEN = "_TMGGkbPEWQa_hO82Kn3BjJi3DWbPiQDTnBumzPg";
const NOCODB_TABLE = "mef80lq7kymhvtc";
const NOCODB_BASE_ID = "pakf4lho7c3mxzs";

function nocoUrl(path: string) {
  return `${NOCODB_DIRECT}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${NOCODB_TABLE}${path}`;
}
const nocoHeaders = { "xc-token": NOCODB_TOKEN, "Content-Type": "application/json" };

const ASSET_CATEGORIES = ["Điện tử", "Nội thất", "Phần mềm", "Dụng cụ", "Xe cộ", "Văn phòng", "Khác"];
const ASSET_STATUSES: Record<string, string> = {
  active: "Đang dùng", stored: "Lưu kho", lent: "Cho mượn", warranty: "Bảo hành",
  sold: "Đã bán", gifted: "Đã tặng", broken: "Hỏng", lost: "Thất lạc",
};

// ============================================================================
// Price Parsing V2 — Extracts unitPrice, quantity, total separately
// ============================================================================

interface PriceDetails {
  unitPrice: number;   // đơn giá per item
  quantity: number;    // số lượng
  total: number;       // tổng tiền (actual spend, includes ship/discounts)
}

/** Extract a VND amount from a text fragment like "259k", "1.2 tr", "490000đ" */
function extractAmount(text: string): number {
  const patterns: [RegExp, number][] = [
    [/([\d]+(?:[.,]\d+)?)\s*(?:triệu|tr)\b/i, 1_000_000],
    [/([\d]+(?:[.,]\d+)?)\s*k\b/i, 1_000],
    [/([\d]+(?:[.,]\d+)?)\s*(?:tỷ|ty)\b/i, 1_000_000_000],
    [/([\d]+(?:[.,]\d+)?)\s*(?:đ|VND|vnđ|đồng)\b/i, 1],
  ];
  for (const [regex, multiplier] of patterns) {
    const match = text.match(regex);
    if (match) {
      const numStr = match[1].replace(/,/g, ".");
      const num = parseFloat(numStr);
      if (!isNaN(num)) return Math.round(num * multiplier);
    }
  }
  // Try bare number with context
  const bareMatch = text.match(/([\d]+(?:[.,]\d+)?)/);
  if (bareMatch) {
    const num = parseFloat(bareMatch[1].replace(/,/g, "."));
    if (!isNaN(num) && num >= 1) {
      // Guess unit: <100 likely means "k" in VN context
      if (num < 100 && /giá|tổng|chi/i.test(text)) return Math.round(num * 1000);
      return Math.round(num);
    }
  }
  return 0;
}

function parsePriceDetails(text: string): PriceDetails {
  let unitPrice = 0;
  let quantity = 1;
  let total = 0;

  // Normalize: join lines for multi-line memos, work line by line for multi-item
  const lines = text.split("\n");

  // For each line, try to extract pricing info
  for (const line of lines) {
    // Skip tag-only lines
    if (/^#\S+(\s+#\S+)*\s*$/.test(line.trim())) continue;

    // 1. Look for "tổng" amount (highest priority for cashflow)
    const totalMatch = line.match(/tổng\s*(?:cộng|tiền|:)?\s*:?\s*([\d]+(?:[.,]\d+)?)\s*(k|tr|triệu|tỷ|đ|VND|vnđ)?/i);
    if (totalMatch) {
      const tVal = extractAmount(totalMatch[0]);
      if (tVal > total) total = tVal;
    }

    // 2. Look for "đơn giá" / "giá" (unit price)
    const unitMatch = line.match(/(?:đơn\s*giá|giá)\s*:?\s*([\d]+(?:[.,]\d+)?)\s*(k|tr|triệu|tỷ|đ|VND|vnđ)?/i);
    if (unitMatch) {
      const uVal = extractAmount(unitMatch[0].replace(/^(?:đơn\s*)?giá\s*:?\s*/i, ""));
      if (uVal > 0 && (unitPrice === 0 || uVal > unitPrice)) unitPrice = uVal;
    }

    // 3. Look for quantity patterns
    const qtyPatterns = [
      /(?:mua|đã mua|số lượng)\s+(\d+)\s*(?:bộ|cái|chiếc|cuộn|cặp|board|module|thẻ|đầu|ổ|mặt|hạt|dây|bảng)/i,
      /(\d+)\s*(?:bộ|cái|chiếc|cuộn|cặp|board|module|thẻ|đầu|ổ|mặt|hạt|dây|bảng)\b/i,
    ];
    for (const qRegex of qtyPatterns) {
      const qMatch = line.match(qRegex);
      if (qMatch) {
        const q = parseInt(qMatch[1]);
        if (q > 0 && q < 1000) quantity = Math.max(quantity, q);
      }
    }
  }

  // If no unitPrice found, try whole text for a single "giá Xk" or just a number
  if (unitPrice === 0 && total === 0) {
    unitPrice = parsePrice(text);
  }

  // If total not found but we only got a single price line like "giá 490k"
  // and no explicit "đơn giá", treat it as total
  if (total === 0 && unitPrice > 0 && !/đơn\s*giá/i.test(text)) {
    total = unitPrice * quantity;
  }

  return { unitPrice, quantity, total };
}

/** Cashflow amount: actual money spent (prefer tổng, which includes shipping/discounts) */
function getCashflowAmount(text: string): number {
  const d = parsePriceDetails(text);
  if (d.total > 0) return d.total;
  if (d.unitPrice > 0 && d.quantity > 0) return d.unitPrice * d.quantity;
  return d.unitPrice;
}

/** Asset value: replacement cost = max(unitPrice × qty, total) */
function getAssetValue(text: string): number {
  const d = parsePriceDetails(text);
  const computed = d.unitPrice * Math.max(d.quantity, 1);
  return Math.max(computed, d.total);
}

/** Legacy parsePrice — fallback for simple cases */
function parsePrice(text: string): number {
  const unitPatterns: [RegExp, number][] = [
    [/([\d]+(?:[.,]\d+)?)\s*(?:triệu|tr)\b/i, 1_000_000],
    [/([\d]+(?:[.,]\d+)?)\s*k\b/i, 1_000],
    [/([\d]+(?:[.,]\d+)?)\s*(?:tỷ|ty)\b/i, 1_000_000_000],
  ];
  for (const [regex, multiplier] of unitPatterns) {
    const match = text.match(regex);
    if (match) {
      const numStr = match[1].replace(/,/g, ".");
      const num = parseFloat(numStr);
      if (!isNaN(num)) return Math.round(num * multiplier);
    }
  }
  const absPatterns: [RegExp, number][] = [
    [/([\d][\d.,]*)\s*(?:đ|VND|vnđ|đồng)/i, 1],
    [/(?:giá|price|cost|chi phí|tổng|nhận)\s*:?\s*([\d][\d.,]*)/i, 1],
  ];
  for (const [regex, multiplier] of absPatterns) {
    const match = text.match(regex);
    if (match) {
      const numStr = match[1].replace(/\./g, "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!isNaN(num)) return Math.round(num * multiplier);
    }
  }
  return 0;
}

function formatVND(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}tỷ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return `${amount.toLocaleString("vi-VN")}đ`;
}

// ============================================================================
// Categories
// ============================================================================

type CashflowType = "income" | "expense";

type CategoryKey = 
  | "salary" | "freelance" | "bonus" | "perdiem" | "other_income" // Income
  | "food" | "coffee" | "clothing" | "transport" | "entertainment" | "health" | "education" | "gift" | "utilities" | "assets" | "other_expense"; // Expense

interface CategoryConfig {
  type: CashflowType;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  emoji: string;
  keywords: RegExp;
}

const CATEGORIES: Record<CategoryKey, CategoryConfig> = {
  // --- Income ---
  salary: {
    type: "income",
    label: "Lương",
    icon: <BanknoteIcon className="w-4 h-4" />,
    color: "text-emerald-500",
    bg: "bg-emerald-500",
    emoji: "💵",
    keywords: /\b(lương|salary|paycheck)\b|#salary/i,
  },
  freelance: {
    type: "income",
    label: "Freelance/Dự án",
    icon: <ZapIcon className="w-4 h-4" />,
    color: "text-blue-500",
    bg: "bg-blue-500",
    emoji: "💻",
    keywords: /\b(freelance|dự án|project|thanh toán|hợp đồng)\b/i,
  },
  bonus: {
    type: "income",
    label: "Thưởng",
    icon: <TrendingUpIcon className="w-4 h-4" />,
    color: "text-amber-500",
    bg: "bg-amber-500",
    emoji: "🎉",
    keywords: /\b(thưởng|bonus|lì xì)\b/i,
  },
  perdiem: {
    type: "income",
    label: "Công tác phí",
    icon: <CarIcon className="w-4 h-4" />,
    color: "text-cyan-500",
    bg: "bg-cyan-500",
    emoji: "✈️",
    keywords: /\b(công tác|per diem|phụ cấp|tiền ăn|vé máy bay)\b/i,
  },
  other_income: {
    type: "income",
    label: "Thu nhập khác",
    icon: <PlusIcon className="w-4 h-4" />,
    color: "text-slate-500",
    bg: "bg-slate-500",
    emoji: "💰",
    keywords: /\b(thu nhập khác|tiền về|nạp)\b/i,
  },
  // --- Expense ---
  food: {
    type: "expense",
    label: "Ăn uống",
    icon: <UtensilsIcon className="w-4 h-4" />,
    color: "text-orange-500",
    bg: "bg-orange-500",
    emoji: "🍜",
    keywords: /\b(ăn|cơm|bún|phở|bánh|pizza|gà|bò|cá|tôm|lẩu|nướng|sushi|nhà hàng|quán|grab\s*food|shopee\s*food|bếp|nấu|đồ ăn|snack|trái cây|rau)\b/i,
  },
  coffee: {
    type: "expense",
    label: "Cà phê / Trà",
    icon: <CoffeeIcon className="w-4 h-4" />,
    color: "text-amber-700",
    bg: "bg-amber-700",
    emoji: "☕",
    keywords: /\b(cà phê|cafe|coffee|trà|tea|sinh tố|smoothie|nước|bia|rượu|highlands|starbucks|phúc long|trung nguyên)\b/i,
  },
  clothing: {
    type: "expense",
    label: "Quần áo",
    icon: <ShirtIcon className="w-4 h-4" />,
    color: "text-pink-500",
    bg: "bg-pink-500",
    emoji: "👕",
    keywords: /(?:^|\s)(quần áo|quần|áo sơ mi|áo thun|áo khoác|giày|dép|túi xách|ba lô|mũ|nón|kính mát|đồng hồ|thời trang|uniqlo|zara|fashion|trang sức)(?:\s|$|[.,!?])/i,
  },
  transport: {
    type: "expense",
    label: "Đi lại",
    icon: <CarIcon className="w-4 h-4" />,
    color: "text-blue-500",
    bg: "bg-blue-500",
    emoji: "🚗",
    keywords: /\b(xăng|grab|taxi|xe|gojek|đi\s*lại|vé|bay|flight|toll|phí\s*gửi|parking|bãi đỗ|tàu|bus)\b/i,
  },
  entertainment: {
    type: "expense",
    label: "Giải trí",
    icon: <ZapIcon className="w-4 h-4" />,
    color: "text-purple-500",
    bg: "bg-purple-500",
    emoji: "🎮",
    keywords: /\b(phim|movie|game|karaoke|du lịch|chơi|vui|concert|nhạc|spotify|netflix|youtube|premium|đi chơi|picnic)\b/i,
  },
  health: {
    type: "expense",
    label: "Sức khỏe",
    icon: <HeartIcon className="w-4 h-4" />,
    color: "text-red-500",
    bg: "bg-red-500",
    emoji: "💊",
    keywords: /\b(thuốc|bác sĩ|khám|bệnh viện|gym|tập|yoga|vitamin|thực phẩm chức năng|bảo hiểm)\b/i,
  },
  education: {
    type: "expense",
    label: "Học tập",
    icon: <BookOpenIcon className="w-4 h-4" />,
    color: "text-cyan-500",
    bg: "bg-cyan-500",
    emoji: "📚",
    keywords: /\b(sách|book|khóa học|course|udemy|học|đào tạo|training|workshop)\b/i,
  },
  gift: {
    type: "expense",
    label: "Quà tặng",
    icon: <GiftIcon className="w-4 h-4" />,
    color: "text-rose-500",
    bg: "bg-rose-500",
    emoji: "🎁",
    keywords: /\b(quà|gift|sinh nhật|birthday|kỷ niệm|valentine|tặng|biếu)\b/i,
  },
  utilities: {
    type: "expense",
    label: "Hóa đơn",
    icon: <WrenchIcon className="w-4 h-4" />,
    color: "text-gray-500",
    bg: "bg-gray-500",
    emoji: "🔌",
    keywords: /\b(điện|nước|internet|wifi|điện thoại|data|4g|5g|tiền nhà|thuê|phí|cước)\b/i,
  },
  assets: {
    type: "expense",
    label: "Tài sản / Thiết bị",
    icon: <PackageIcon className="w-4 h-4" />,
    color: "text-emerald-600",
    bg: "bg-emerald-600",
    emoji: "📦",
    keywords: /\b(tài sản|thiết bị|máy móc|linh kiện|phụ tùng|công cụ|dụng cụ|license|phần mềm|software|điện tử|electronics)\b/i,
  },
  other_expense: {
    type: "expense",
    label: "Khác",
    icon: <ShoppingBagIcon className="w-4 h-4" />,
    color: "text-slate-400",
    bg: "bg-slate-400",
    emoji: "📦",
    keywords: /^$/,
  },
};

function detectCategory(text: string, tags: string[], type: CashflowType): CategoryKey {
  // Check tags first
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.includes("asset") || t.includes("inventory") || t.includes("tool") || t.includes("license")) return "assets";
    for (const [key, cfg] of Object.entries(CATEGORIES)) {
      if (cfg.type === type && (t.includes(`${type}/${key}`) || t.includes(`spend/${key}`))) {
        return key as CategoryKey;
      }
    }
  }
  // Auto-detect from content
  const cats = Object.entries(CATEGORIES) as [CategoryKey, CategoryConfig][];
  for (const [key, cfg] of cats) {
    if (cfg.type === type && key !== "other_expense" && key !== "other_income" && cfg.keywords.test(text)) {
      return key;
    }
  }
  return type === "income" ? "other_income" : "other_expense";
}

// ============================================================================
// Types
// ============================================================================

interface CashflowEntry {
  uid: string;
  memoName: string;
  content: string;
  type: CashflowType;
  date: string;
  dateKey: string;
  month: string;
  amount: number;
  category: CategoryKey;
  preview: string;
  tags: string[];
}

type TabType = "all" | "income" | "expense";

// ============================================================================
// Component
// ============================================================================

const CashflowTracker = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutateAsync: updateMemo } = useUpdateMemo();
  const [tab, setTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all");
  const [showZeroAmount, setShowZeroAmount] = useState(false);

  // Asset creation from cashflow
  const [assetModal, setAssetModal] = useState<CashflowEntry | null>(null);
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("Điện tử");
  const [assetUnitPrice, setAssetUnitPrice] = useState("");
  const [assetPrice, setAssetPrice] = useState("");
  const [assetQty, setAssetQty] = useState("1");
  const [assetStatus, setAssetStatus] = useState("active");
  const [assetNotes, setAssetNotes] = useState("");
  const [assetSaving, setAssetSaving] = useState(false);

  const { data, isLoading } = useInfiniteMemos({
    pageSize: 500,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });

  const allMemos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.memos || []);
  }, [data]);

  // Parse entries
  const entries: CashflowEntry[] = useMemo(() => {
    return allMemos
      .filter((memo) => {
        const content = memo.content || "";
        return /#(income|expense|chi|thu|asset|inventory|tool|license|salary)/i.test(content);
      })
      .map((memo) => {
        const content = memo.content || "";
        const name = memo.name || "";
        const tags = content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || [];

        const type: CashflowType = /#(income|thu)/i.test(content) ? "income" : "expense";

        let dt: Date;
        try {
          if (memo.displayTime) dt = timestampDate(memo.displayTime);
          else if (memo.createTime) dt = timestampDate(memo.createTime);
          else dt = new Date();
        } catch {
          dt = new Date();
        }

        const preview = content
          .replace(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g, "")
          .replace(/\n+/g, " ")
          .trim()
          .substring(0, 120);

        const amount = getCashflowAmount(content);

        return {
          uid: name.split("/")[1] || name,
          memoName: name,
          content,
          type,
          date: dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }),
          dateKey: dayjs(dt).format("YYYY-MM-DD"),
          month: dayjs(dt).format("YYYY-MM"),
          amount,
          category: detectCategory(content, tags, type),
          preview,
          tags,
        };
      })
      .filter((e) => showZeroAmount || e.amount > 0);
  }, [allMemos]);

  // Stats
  const stats = useMemo(() => {
    const thisMonth = dayjs().format("YYYY-MM");

    const totals = entries.reduce(
      (acc, e) => {
        if (e.type === "income") acc.income += e.amount;
        else acc.expense += e.amount;

        if (e.month === thisMonth) {
          if (e.type === "income") acc.monthIncome += e.amount;
          else acc.monthExpense += e.amount;
        }
        return acc;
      },
      { income: 0, expense: 0, monthIncome: 0, monthExpense: 0 }
    );

    // By category
    const byCategory: Record<string, { count: number; total: number }> = {};
    for (const e of entries) {
      if (tab === "all" || e.type === tab) {
        byCategory[e.category] = byCategory[e.category] || { count: 0, total: 0 };
        byCategory[e.category].count++;
        byCategory[e.category].total += e.amount;
      }
    }

    // Cashflow Trend (7 days)
    const trend: { day: string; income: number; expense: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, "day");
      const key = d.format("YYYY-MM-DD");
      const dayEntries = entries.filter((e) => e.dateKey === key);
      const income = dayEntries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
      const expense = dayEntries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
      trend.push({ day: d.format("dd"), income, expense });
    }
    const maxVal = Math.max(...trend.map((t) => Math.max(t.income, t.expense)), 1);

    return { ...totals, net: totals.income - totals.expense, monthNet: totals.monthIncome - totals.monthExpense, byCategory, trend, maxVal };
  }, [entries, tab]);

  // Filtered List
  const filtered = useMemo(() => {
    let res = entries;
    if (tab !== "all") res = res.filter((e) => e.type === tab);
    if (activeCategoryTab !== "all") res = res.filter((e) => e.category === activeCategoryTab);
    if (search) {
      const q = search.toLowerCase();
      res = res.filter((e) => e.preview.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return res;
  }, [entries, tab, activeCategoryTab, search]);

  // Navigate to source memo (route is /memos/:uid)
  const goToMemo = useCallback((memoName: string) => {
    // memoName format: "memos/{uid}" → route: "/memos/{uid}"
    navigate(`/${memoName}`);
  }, [navigate]);

  // Delete memo (soft-delete via useUpdateMemo)
  const handleDelete = useCallback(async (entry: CashflowEntry) => {
    if (!confirm(`Xóa giao dịch: ${entry.preview.substring(0, 60)}...?`)) return;
    try {
      await updateMemo({
        update: { name: entry.memoName, state: State.ARCHIVED },
        updateMask: ["state"],
      });
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
      toast.success("Đã ẩn giao dịch (memo archived)");
    } catch (e) {
      toast.error("Lỗi khi xóa: " + e);
    }
  }, [updateMemo, queryClient]);

  const openAssetModal = useCallback((entry: CashflowEntry) => {
    setAssetModal(entry);
    // Pre-fill: extract a reasonable name from the preview  
    const cleanPreview = entry.preview
      .replace(/^(Đã mua|Mua|Đặt mua|mua)\s*/i, "")
      .replace(/\s*(đơn giá|giá|tổng|ship|phí).*/i, "")
      .trim();
    setAssetName(cleanPreview.substring(0, 80) || entry.preview.substring(0, 80));
    
    // Use parsePriceDetails for smart extraction
    const pd = parsePriceDetails(entry.content);
    setAssetUnitPrice(pd.unitPrice > 0 ? String(pd.unitPrice) : "");
    setAssetPrice(pd.total > 0 ? String(pd.total) : String(entry.amount));
    setAssetQty(pd.quantity > 1 ? String(pd.quantity) : "1");
    setAssetCategory("Điện tử");
    setAssetStatus("active");
    setAssetNotes("");
  }, []);

  const submitAssetFromCashflow = useCallback(async () => {
    if (!assetModal || !assetName.trim()) return;
    setAssetSaving(true);
    try {
      const memoRef = assetModal.memoName || "";
      const payload = {
        Name: assetName.trim(),
        Category: assetCategory,
        Price: Number(assetUnitPrice) || Number(assetPrice) || 0,
        Quantity: Number(assetQty) || 1,
        Status: assetStatus,
        Notes: assetNotes || assetModal.preview.substring(0, 200),
        MemoRef: memoRef,
        Owner: "nxchieu",
        Unit: "cái",
      };
      const res = await fetch(nocoUrl(""), { method: "POST", headers: nocoHeaders, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`NocoDB error ${res.status}`);
      toast.success(`📦 Đã tạo tài sản "${assetName}"`);
      setAssetModal(null);
    } catch (err: unknown) {
      toast.error(`Lỗi tạo tài sản: ${err instanceof Error ? err.message : "?"}`);
    } finally {
      setAssetSaving(false);
    }
  }, [assetModal, assetName, assetCategory, assetUnitPrice, assetPrice, assetQty, assetStatus, assetNotes]);


  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-7xl mx-auto">

      {/* ========================= ASSET CREATION MODAL ========================= */}
      {assetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setAssetModal(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <PackageIcon className="w-5 h-5 text-emerald-500" /> Tạo tài sản từ thu chi
              </h3>
              <button onClick={() => setAssetModal(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            
            <div className="text-xs bg-muted/50 border border-border rounded-lg p-2 mb-4 text-muted-foreground line-clamp-2">
              📝 {assetModal.preview}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tên thiết bị / tài sản</label>
                <input value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="VD: ESP32-C3 DevKit"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" autoFocus />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Danh mục</label>
                  <select value={assetCategory} onChange={e => setAssetCategory(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500">
                    {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Trạng thái</label>
                  <select value={assetStatus} onChange={e => setAssetStatus(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500">
                    {Object.entries(ASSET_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Đơn giá</label>
                  <input type="number" value={assetUnitPrice} onChange={e => setAssetUnitPrice(e.target.value)} placeholder="0"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tổng tiền</label>
                  <input type="number" value={assetPrice} onChange={e => setAssetPrice(e.target.value)} placeholder="0"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Số lượng</label>
                  <input type="number" min="1" value={assetQty} onChange={e => setAssetQty(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Ghi chú</label>
                <textarea value={assetNotes} onChange={e => setAssetNotes(e.target.value)} rows={2} placeholder="Ghi chú thêm..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 border-t border-border pt-4">
              <button onClick={() => setAssetModal(null)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted font-medium transition-colors">Hủy</button>
              <button onClick={submitAssetFromCashflow} disabled={assetSaving || !assetName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors shadow-md disabled:opacity-50">
                {assetSaving ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <PackageIcon className="w-4 h-4" />}
                Tạo tài sản
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3Icon className="w-6 h-6 text-emerald-500" />
            Thu Chi (Cashflow)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Quản lý dòng tiền · lương, thưởng & chi tiêu</p>
        </div>
      </div>

      {/* ========================= DASHBOARD CARDS ========================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center">
          <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1">Thu nhập tháng này</p>
          <p className="text-2xl font-bold text-emerald-500">+{formatVND(stats.monthIncome)}</p>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingUpIcon className="w-3 h-3 text-emerald-500" /> 
            <span>Tổng: {formatVND(stats.income)}</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center">
          <p className="text-[10px] text-rose-500 font-bold uppercase tracking-wider mb-1">Chi tiêu tháng này</p>
          <p className="text-2xl font-bold text-rose-500">-{formatVND(stats.monthExpense)}</p>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingDownIcon className="w-3 h-3 text-rose-500" /> 
            <span>Tổng: {formatVND(stats.expense)}</span>
          </div>
        </div>
        <div className={`rounded-xl p-4 flex flex-col items-center justify-center text-center border ${stats.monthNet >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${stats.monthNet >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            Số dư tháng này
          </p>
          <p className={`text-2xl font-bold ${stats.monthNet >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            {stats.monthNet >= 0 ? "+" : ""}{formatVND(stats.monthNet)}
          </p>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <WalletIcon className="w-3 h-3" />
            <span>Net tích lũy: {formatVND(stats.net)}</span>
          </div>
        </div>
      </div>

      {/* ========================= TREND CHART ========================= */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
          <TrendingUpIcon className="w-4 h-4 text-emerald-500" />
          Xu hướng 7 ngày qua
        </h3>
        <div className="flex items-end gap-2 h-24">
          {stats.trend.map((t, i) => {
            const hI = stats.maxVal > 0 ? (t.income / stats.maxVal) * 100 : 0;
            const hE = stats.maxVal > 0 ? (t.expense / stats.maxVal) * 100 : 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex gap-1 items-end h-full w-full">
                  <div className="flex-1 bg-emerald-500 rounded-t-[2px] min-h-[2px]" style={{ height: `${Math.max(2, hI)}%` }} />
                  <div className="flex-1 bg-rose-500 rounded-t-[2px] min-h-[2px]" style={{ height: `${Math.max(2, hE)}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground">{t.day}</span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-center gap-4 mt-3">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" /> Thu nhập
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="w-2 h-2 bg-rose-500 rounded-full" /> Chi tiêu
          </div>
        </div>
      </div>

      {/* ========================= TABS & CATEGORIES ========================= */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-4 pt-2 -mx-4 px-4 border-b border-border/50">
        <div className="flex items-center gap-3 p-1 bg-card border border-border rounded-xl w-fit mb-4 mx-auto">
          {(["all", "income", "expense"] as TabType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setActiveCategoryTab("all"); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                tab === t ? "bg-emerald-500 text-white shadow-lg" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "all" ? "Tất cả" : t === "income" ? "Thu nhập" : "Chi tiêu"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">
          <button
            onClick={() => setActiveCategoryTab("all")}
            className={`px-3 py-1.5 text-xs rounded-full border shrink-0 transition-all ${
              activeCategoryTab === "all" ? "bg-emerald-500 text-white border-emerald-500" : "bg-card text-muted-foreground border-border"
            }`}
          >
            📊 Toàn bộ nhóm
          </button>
          {Object.entries(CATEGORIES)
            .filter(([_, cfg]) => tab === "all" || cfg.type === tab)
            .map(([key, cfg]) => {
              const data = stats.byCategory[key];
              if (!data) return null;
              return (
                <button
                  key={key}
                  onClick={() => setActiveCategoryTab(activeCategoryTab === key ? "all" : key)}
                  className={`px-3 py-1.5 text-xs rounded-full border shrink-0 transition-all ${
                    activeCategoryTab === key ? "bg-emerald-500 text-white border-emerald-500" : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  {cfg.emoji} {cfg.label} ({data.count})
                </button>
              );
            })}
        </div>

        <div className="relative mt-2">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* ========================= HOW TO USE ========================= */}
      {entries.length === 0 && (
        <div className="mt-8 bg-card border border-border rounded-xl p-6 text-center">
          <CheckCircleIcon className="w-12 h-12 text-emerald-500/20 mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Chưa có dữ liệu thu chi</h3>
          <p className="text-sm text-muted-foreground mb-6">Bắt đầu bằng cách ghi memo kèm tag #income hoặc #expense</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-xl mx-auto">
            <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
              <p className="text-xs font-bold text-emerald-500 uppercase mb-2">Ghi Thu Nhập</p>
              <code className="text-[10px] block bg-background p-2 rounded border border-border mb-2">
                Nhận lương tháng 15tr #income
              </code>
              <code className="text-[10px] block bg-background p-2 rounded border border-border">
                Freelance dự án 5tr #income
              </code>
            </div>
            <div className="p-4 bg-rose-500/5 rounded-xl border border-rose-500/20">
              <p className="text-xs font-bold text-rose-500 uppercase mb-2">Ghi Chi Tiêu</p>
              <code className="text-[10px] block bg-background p-2 rounded border border-border mb-2">
                Ăn phở sáng 45k #expense
              </code>
              <code className="text-[10px] block bg-background p-2 rounded border border-border">
                Mua áo Uniqlo 500k #expense
              </code>
            </div>
          </div>
        </div>
      )}

      {/* ========================= SHOW ZERO TOGGLE ========================= */}
      <div className="mt-4 flex items-center justify-end">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showZeroAmount}
            onChange={(e) => setShowZeroAmount(e.target.checked)}
            className="rounded"
          />
          Hiển thị ghi chú 0đ
        </label>
      </div>

      {/* ========================= TRANSACTION LIST ========================= */}
      <div className="mt-4 space-y-3">
        {filtered.map((entry) => {
          const cfg = CATEGORIES[entry.category];
          const isIncome = entry.type === "income";
          return (
            <div
              key={entry.uid}
              className={`bg-card border rounded-xl px-4 py-3 transition-colors hover:bg-muted/30 cursor-pointer group ${isIncome ? "border-emerald-500/10 hover:border-emerald-500/30" : "border-rose-500/10 hover:border-rose-500/30"}`}
              onClick={() => goToMemo(entry.memoName)}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${isIncome ? "bg-emerald-500/20 text-emerald-600" : "bg-rose-500/20 text-rose-600"}`}>
                        {isIncome ? "Thu" : "Chi"}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground truncate">{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isIncome ? "text-emerald-500" : "text-rose-500"}`}>
                        {isIncome ? "+" : "-"}{formatVND(entry.amount)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{entry.date}</span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed line-clamp-1 flex items-center gap-1">
                    {entry.preview}
                    <ExternalLinkIcon className="w-3 h-3 text-muted-foreground/50" />
                  </p>
                  {/* Action buttons — visible on hover */}
                  <div className="flex items-center gap-2 mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); goToMemo(entry.memoName); }}
                      className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600 transition-colors bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10"
                      title="Xem ghi chú gốc"
                    >
                      <ExternalLinkIcon className="w-3 h-3" /> Xem gốc
                    </button>
                    {entry.type === "expense" && entry.amount > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openAssetModal(entry); }}
                        className="flex items-center gap-1 text-[10px] text-emerald-500 hover:text-emerald-600 transition-colors bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10"
                        title="Tạo tài sản từ giao dịch này"
                      >
                        <PackageIcon className="w-3 h-3" /> Tạo tài sản
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); goToMemo(entry.memoName); }}
                      className="flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-600 transition-colors"
                      title="Sửa ghi chú"
                    >
                      <PencilIcon className="w-3 h-3" /> Sửa
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                      className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-600 transition-colors"
                      title="Xóa (ẩn ghi chú)"
                    >
                      <Trash2Icon className="w-3 h-3" /> Xóa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && entries.length > 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <SearchIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Không tìm thấy kết quả</p>
        </div>
      )}
    </div>
  );
};

export default CashflowTracker;
