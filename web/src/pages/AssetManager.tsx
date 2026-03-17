import {
  BoxIcon,
  DollarSignIcon,
  HandshakeIcon,
  KeyIcon,
  LoaderIcon,
  PackageIcon,
  PieChartIcon,
  PlusIcon,
  SearchIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";

// ============================================================================
// Price Parsing Utilities
// ============================================================================

/**
 * Parse Vietnamese price formats from text.
 * Supports: 250k, 32tr, 1.5 triệu, 500000, 500.000đ, 2,500,000 VND
 */
function parsePrice(text: string): number {
  // Patterns with multiplier units (dot = decimal point: 1.2tr = 1,200,000)
  const unitPatterns: [RegExp, number][] = [
    [/(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)/i, 1_000_000],
    [/(\d+(?:[.,]\d+)?)\s*k/i, 1_000],
    [/(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty)/i, 1_000_000_000],
  ];

  for (const [regex, multiplier] of unitPatterns) {
    const match = text.match(regex);
    if (match) {
      // Treat comma as decimal separator (European style), dot stays as decimal
      const numStr = match[1].replace(/,/g, ".");
      const num = parseFloat(numStr);
      if (!isNaN(num)) return Math.round(num * multiplier);
    }
  }

  // Patterns with absolute values (dot = thousands separator: 1.200.000đ = 1,200,000)
  const absPatterns: [RegExp, number][] = [
    [/(\d[\d.,]*)\s*(?:đ|VND|vnđ|đồng)/i, 1],
    [/(?:giá|price|cost|chi phí|tổng)\s*:?\s*(\d[\d.,]*)/i, 1],
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

/**
 * Parse category from tags
 */
function parseCategory(tags: string[]): string {
  for (const tag of tags) {
    if (tag.includes("electronics") || tag.includes("dien_tu")) return "Điện tử";
    if (tag.includes("furniture") || tag.includes("noi_that")) return "Nội thất";
    if (tag.includes("software") || tag.includes("license")) return "Phần mềm";
    if (tag.includes("vehicle") || tag.includes("xe")) return "Xe cộ";
    if (tag.includes("tool")) return "Dụng cụ";
    if (tag.includes("office")) return "Văn phòng";
  }
  return "Khác";
}

/**
 * Format VND currency
 */
function formatVND(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} tr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return `${amount.toLocaleString("vi-VN")}đ`;
}

// ============================================================================
// Types
// ============================================================================

interface AssetEntry {
  uid: string;
  name: string;
  content: string;
  date: string;
  month: string;
  time: string;
  type: "buy" | "lend" | "return" | "tool" | "other";
  tags: string[];
  preview: string;
  price: number;
  category: string;
}

type TabType = "all" | "buy" | "lend" | "return" | "tool";

// ============================================================================
// Category colors for pie chart
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  "Điện tử": "bg-blue-500",
  "Nội thất": "bg-amber-500",
  "Phần mềm": "bg-violet-500",
  "Xe cộ": "bg-red-500",
  "Dụng cụ": "bg-cyan-500",
  "Văn phòng": "bg-green-500",
  "Khác": "bg-gray-400",
};

// ============================================================================
// Component
// ============================================================================

const AssetManager = () => {
  const [tab, setTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useInfiniteMemos({
    pageSize: 500,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });

  const allMemos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.memos || []);
  }, [data]);

  // Parse all asset memos with price + category
  const assetEntries: AssetEntry[] = useMemo(() => {
    return allMemos
      .filter((memo) => {
        const content = memo.content || "";
        return /#asset/.test(content) || /#inventory/.test(content) || /#tool/.test(content) || /#license/.test(content);
      })
      .map((memo) => {
        const content = memo.content || "";
        const name = memo.name || "";
        const tags = content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || [];

        let type: AssetEntry["type"] = "other";
        if (tags.some((t) => t.includes("asset/buy") || t.includes("inventory"))) type = "buy";
        else if (tags.some((t) => t.includes("asset/lend"))) type = "lend";
        else if (tags.some((t) => t.includes("asset/return"))) type = "return";
        else if (tags.some((t) => t.includes("tool") || t.includes("license"))) type = "tool";

        const preview = content
          .replace(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g, "")
          .replace(/\n+/g, " ")
          .trim()
          .substring(0, 150);

        let dt: Date;
        try {
          if (memo.displayTime) dt = timestampDate(memo.displayTime);
          else if (memo.createTime) dt = timestampDate(memo.createTime);
          else dt = new Date();
        } catch {
          dt = new Date();
        }
        const date = dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
        const month = dayjs(dt).format("YYYY-MM");
        const time = dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        const uid = name.split("/")[1] || name;

        const price = parsePrice(content);
        const category = parseCategory(tags);

        return { uid, name, content, date, month, time, type, tags, preview, price, category };
      });
  }, [allMemos]);

  // Computed stats
  const stats = useMemo(() => {
    const totalValue = assetEntries.filter((e) => e.type === "buy").reduce((sum, e) => sum + e.price, 0);
    const byCategory: Record<string, { count: number; value: number }> = {};
    const byMonth: Record<string, number> = {};

    for (const entry of assetEntries) {
      if (entry.type === "buy") {
        byCategory[entry.category] = byCategory[entry.category] || { count: 0, value: 0 };
        byCategory[entry.category].count++;
        byCategory[entry.category].value += entry.price;
        byMonth[entry.month] = (byMonth[entry.month] || 0) + entry.price;
      }
    }

    // Last 6 months spending
    const months: { month: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, "month").format("YYYY-MM");
      months.push({ month: dayjs().subtract(i, "month").format("MM/YYYY"), value: byMonth[m] || 0 });
    }

    return {
      total: assetEntries.length,
      buy: assetEntries.filter((e) => e.type === "buy").length,
      lend: assetEntries.filter((e) => e.type === "lend").length,
      return: assetEntries.filter((e) => e.type === "return").length,
      tool: assetEntries.filter((e) => e.type === "tool").length,
      totalValue,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1].value - a[1].value),
      monthlySpending: months,
      maxMonthly: Math.max(...months.map((m) => m.value), 1),
    };
  }, [assetEntries]);

  const filtered = useMemo(() => {
    let result = assetEntries;
    if (tab !== "all") result = result.filter((e) => e.type === tab);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.preview.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return result;
  }, [assetEntries, tab, search]);

  const getTypeConfig = (type: AssetEntry["type"]) => {
    switch (type) {
      case "buy": return { icon: <ShoppingCartIcon className="w-4 h-4" />, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Mua" };
      case "lend": return { icon: <HandshakeIcon className="w-4 h-4" />, color: "text-amber-500", bg: "bg-amber-500/10", label: "Cho mượn" };
      case "return": return { icon: <BoxIcon className="w-4 h-4" />, color: "text-sky-500", bg: "bg-sky-500/10", label: "Thu hồi" };
      case "tool": return { icon: <KeyIcon className="w-4 h-4" />, color: "text-violet-500", bg: "bg-violet-500/10", label: "Tool/License" };
      default: return { icon: <PackageIcon className="w-4 h-4" />, color: "text-muted-foreground", bg: "bg-muted", label: "Khác" };
    }
  };

  const tabs: { key: TabType; label: string; icon: string; count: number }[] = [
    { key: "all", label: "Tất cả", icon: "📦", count: stats.total },
    { key: "buy", label: "Đã mua", icon: "🛒", count: stats.buy },
    { key: "lend", label: "Cho mượn", icon: "🤝", count: stats.lend },
    { key: "return", label: "Thu hồi", icon: "📥", count: stats.return },
    { key: "tool", label: "Tool", icon: "🔑", count: stats.tool },
  ];

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageIcon className="w-6 h-6 text-emerald-500" />
          Asset Portfolio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quản lý tài sản, thiết bị, cho mượn & license
        </p>
      </div>

      {/* ========================= PORTFOLIO SUMMARY ========================= */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl p-5 mb-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-emerald-100 text-xs uppercase tracking-wider">Tổng giá trị tài sản</p>
            <p className="text-3xl font-bold mt-1">{formatVND(stats.totalValue)}</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <DollarSignIcon className="w-6 h-6" />
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <span>📦 {stats.total} items</span>
          <span>🛒 {stats.buy} mua</span>
          <span>🤝 {stats.lend} mượn</span>
          <span>🔑 {stats.tool} tool</span>
        </div>
      </div>

      {/* ========================= CHARTS ROW ========================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Category Breakdown */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
            <PieChartIcon className="w-4 h-4 text-emerald-500" />
            Phân loại tài sản
          </h3>
          {stats.byCategory.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {stats.byCategory.map(([category, data]) => {
                const pct = stats.totalValue > 0 ? Math.round((data.value / stats.totalValue) * 100) : 0;
                const colorClass = CATEGORY_COLORS[category] || "bg-gray-400";
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground">{category} ({data.count})</span>
                      <span className="text-muted-foreground">{formatVND(data.value)} · {pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colorClass} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Monthly Spending */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
            <TrendingUpIcon className="w-4 h-4 text-blue-500" />
            Chi tiêu theo tháng
          </h3>
          <div className="flex items-end gap-1 h-24">
            {stats.monthlySpending.map((m, i) => {
              const height = stats.maxMonthly > 0 ? Math.max(4, (m.value / stats.maxMonthly) * 100) : 4;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">{m.value > 0 ? formatVND(m.value) : ""}</span>
                  <div
                    className="w-full bg-blue-500/80 rounded-t-md transition-all hover:bg-blue-600"
                    style={{ height: `${height}%` }}
                    title={`${m.month}: ${formatVND(m.value)}`}
                  />
                  <span className="text-[9px] text-muted-foreground">{m.month.split("/")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================= TOOLBAR ========================= */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-3 pt-1 -mx-4 px-4 border-b border-border/50">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                tab === t.key ? "bg-emerald-500 text-white border-emerald-500" : "bg-card text-muted-foreground border-border hover:border-emerald-500/50"
              }`}
            >
              {t.icon} {t.label} ({t.count})
            </button>
          ))}
        </div>
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm tài sản..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* ========================= HOW TO USE ========================= */}
      {assetEntries.length === 0 && (
        <div className="mt-6 bg-card border border-border rounded-xl p-5">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <PlusIcon className="w-4 h-4 text-emerald-500" /> Cách sử dụng Asset Portfolio
          </h3>
          <p className="text-sm text-muted-foreground mb-3">Ghi memo với tag + giá để tự động xuất hiện:</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-mono">#asset/buy</span>
              <span className="text-muted-foreground">Mua ESP32 DevKit 250k #asset/electronics</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-mono">#asset/buy</span>
              <span className="text-muted-foreground">MacBook Pro M3 32tr #asset/electronics</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-mono">#asset/lend</span>
              <span className="text-muted-foreground">Cho Tuấn mượn multimeter</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================= ASSET LIST ========================= */}
      <div className="mt-4 space-y-3">
        {filtered.map((entry) => {
          const cfg = getTypeConfig(entry.type);
          return (
            <div
              key={entry.uid}
              className="bg-card border border-border rounded-xl px-4 py-3 hover:border-emerald-500/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-2 rounded-lg ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    <div className="flex items-center gap-2">
                      {entry.price > 0 && (
                        <span className="text-xs font-bold text-emerald-500">{formatVND(entry.price)}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{entry.date}</span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed line-clamp-2">{entry.preview}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.tags.map((tag, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{tag}</span>
                    ))}
                    {entry.category !== "Khác" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">📂 {entry.category}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && assetEntries.length > 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <SearchIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Không tìm thấy kết quả</p>
        </div>
      )}

      {/* NocoDB + Debt link */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 bg-card border border-border rounded-xl">
          <h3 className="text-sm font-bold mb-2">📊 Quản lý chi tiết</h3>
          <p className="text-xs text-muted-foreground mb-3">Bảng NocoDB với filters, sort, export</p>
          <a href="/nocodb" className="inline-block px-4 py-2 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
            Mở NocoDB →
          </a>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <h3 className="text-sm font-bold mb-2">💳 Công nợ</h3>
          <p className="text-xs text-muted-foreground mb-3">Theo dõi mua hộ, bán chịu, phải thu/trả</p>
          <a href="/debt" className="inline-block px-4 py-2 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors">
            Mở Công nợ →
          </a>
        </div>
      </div>
    </div>
  );
};

export default AssetManager;
