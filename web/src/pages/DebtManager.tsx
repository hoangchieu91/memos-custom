import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ClockIcon,
  LoaderIcon,
  SearchIcon,
  UserIcon,
  WalletIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";

// ============================================================================
// Parsing Utilities
// ============================================================================

/**
 * Parse price from Vietnamese text
 */
function parseAmount(text: string): number {
  // Patterns with multiplier units (dot = decimal point: 1.2tr = 1,200,000)
  const unitPatterns: [RegExp, number][] = [
    [/(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)/i, 1_000_000],
    [/(\d+(?:[.,]\d+)?)\s*k/i, 1_000],
  ];
  for (const [regex, multiplier] of unitPatterns) {
    const match = text.match(regex);
    if (match) {
      const numStr = match[1].replace(/,/g, ".");
      const num = parseFloat(numStr);
      if (!isNaN(num)) return Math.round(num * multiplier);
    }
  }

  // Patterns with absolute values (dot = thousands separator: 1.200.000đ)
  const absPatterns: [RegExp, number][] = [
    [/(\d[\d.,]*)\s*(?:đ|VND|vnđ|đồng)/i, 1],
  ];
  for (const [regex, multiplier] of absPatterns) {
    const match = text.match(regex);
    if (match) {
      const numStr = match[1].replace(/\./g, "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!isNaN(num)) return Math.round(num * multiplier);
    }
  }

  // Fallback: find standalone numbers > 1000
  const numMatch = text.match(/\b(\d{4,})\b/);
  if (numMatch) return parseInt(numMatch[1]);
  return 0;
}

/**
 * Parse person name from @mentions or common patterns
 */
function parsePerson(text: string): string {
  // @mention pattern
  const atMatch = text.match(/@([\w\u00C0-\u024F\u1E00-\u1EFF]+)/);
  if (atMatch) return atMatch[1];
  // Common Vietnamese patterns
  const namePatterns = [
    /(?:cho|của|mua hộ|bán chịu|nợ|trả)\s+([\p{L}]+(?:\s[\p{L}]+)?)/u,
    /(?:anh|chị|bạn|em)\s+([\p{L}]+)/u,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return "Không rõ";
}

function formatVND(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return `${amount.toLocaleString("vi-VN")}đ`;
}

// ============================================================================
// Types
// ============================================================================

interface DebtEntry {
  uid: string;
  content: string;
  date: string;
  dateObj: Date;
  type: "receivable" | "payable" | "settled";
  amount: number;
  person: string;
  preview: string;
  tags: string[];
  daysAgo: number;
}

interface PersonSummary {
  name: string;
  totalReceivable: number;
  totalPayable: number;
  totalSettled: number;
  balance: number; // positive = they owe you
  transactionCount: number;
  lastActivity: Date;
  isOverdue: boolean; // > 30 days
}

type TabType = "all" | "receivable" | "payable" | "settled";

// ============================================================================
// Component
// ============================================================================

const DebtManager = () => {
  const [tab, setTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  const { data, isLoading } = useInfiniteMemos({
    pageSize: 500,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });

  const allMemos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.memos || []);
  }, [data]);

  // Parse debt entries
  const debtEntries: DebtEntry[] = useMemo(() => {
    return allMemos
      .filter((memo) => {
        const content = memo.content || "";
        return /#debt/.test(content);
      })
      .map((memo) => {
        const content = memo.content || "";
        const name = memo.name || "";
        const tags = content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || [];

        let type: DebtEntry["type"] = "receivable";
        if (tags.some((t) => t.includes("debt/payable"))) type = "payable";
        else if (tags.some((t) => t.includes("debt/settled"))) type = "settled";

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
          .replace(/@[\w\u00C0-\u024F\u1E00-\u1EFF]+/g, "")
          .replace(/\n+/g, " ")
          .trim()
          .substring(0, 150);

        const uid = name.split("/")[1] || name;
        const daysAgo = dayjs().diff(dayjs(dt), "day");

        return {
          uid,
          content,
          date: dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }),
          dateObj: dt,
          type,
          amount: parseAmount(content),
          person: parsePerson(content),
          preview,
          tags,
          daysAgo,
        };
      });
  }, [allMemos]);

  // Per-person summaries
  const personSummaries: PersonSummary[] = useMemo(() => {
    const map: Record<string, PersonSummary> = {};

    for (const entry of debtEntries) {
      const name = entry.person;
      if (!map[name]) {
        map[name] = {
          name,
          totalReceivable: 0,
          totalPayable: 0,
          totalSettled: 0,
          balance: 0,
          transactionCount: 0,
          lastActivity: entry.dateObj,
          isOverdue: false,
        };
      }

      map[name].transactionCount++;
      if (entry.dateObj > map[name].lastActivity) map[name].lastActivity = entry.dateObj;

      if (entry.type === "receivable") map[name].totalReceivable += entry.amount;
      else if (entry.type === "payable") map[name].totalPayable += entry.amount;
      else if (entry.type === "settled") map[name].totalSettled += entry.amount;
    }

    return Object.values(map).map((p) => {
      p.balance = p.totalReceivable - p.totalPayable - p.totalSettled;
      p.isOverdue = p.balance !== 0 && dayjs().diff(dayjs(p.lastActivity), "day") > 30;
      return p;
    }).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [debtEntries]);

  // Global stats
  const stats = useMemo(() => {
    const totalReceivable = personSummaries.reduce((s, p) => s + Math.max(0, p.balance), 0);
    const totalPayable = personSummaries.reduce((s, p) => s + Math.max(0, -p.balance), 0);
    const overdueCount = personSummaries.filter((p) => p.isOverdue).length;
    return {
      totalReceivable,
      totalPayable,
      net: totalReceivable - totalPayable,
      receivableCount: debtEntries.filter((e) => e.type === "receivable").length,
      payableCount: debtEntries.filter((e) => e.type === "payable").length,
      settledCount: debtEntries.filter((e) => e.type === "settled").length,
      overdueCount,
      total: debtEntries.length,
    };
  }, [debtEntries, personSummaries]);

  // Filter
  const filteredEntries = useMemo(() => {
    let result = debtEntries;
    if (tab !== "all") result = result.filter((e) => e.type === tab);
    if (selectedPerson) result = result.filter((e) => e.person === selectedPerson);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.preview.toLowerCase().includes(q) || e.person.toLowerCase().includes(q));
    }
    return result;
  }, [debtEntries, tab, selectedPerson, search]);

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <WalletIcon className="w-6 h-6 text-rose-500" />
          Công Nợ
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Theo dõi mua hộ, bán chịu · phải thu & phải trả
        </p>
      </div>

      {/* ========================= SUMMARY CARDS ========================= */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <ArrowDownIcon className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-emerald-500">{formatVND(stats.totalReceivable)}</p>
          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Phải thu</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <ArrowUpIcon className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-red-500">{formatVND(stats.totalPayable)}</p>
          <p className="text-[10px] text-red-600 uppercase tracking-wider">Phải trả</p>
        </div>
        <div className={`${stats.net >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"} border rounded-xl p-4 text-center`}>
          <WalletIcon className={`w-5 h-5 mx-auto mb-1 ${stats.net >= 0 ? "text-emerald-500" : "text-red-500"}`} />
          <p className={`text-xl font-bold ${stats.net >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {stats.net >= 0 ? "+" : ""}{formatVND(Math.abs(stats.net))}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ròng</p>
        </div>
      </div>

      {/* ========================= PERSON LIST ========================= */}
      {personSummaries.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-rose-500" />
            Theo người ({personSummaries.length})
            {stats.overdueCount > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full">
                ⚠️ {stats.overdueCount} quá hạn
              </span>
            )}
          </h3>
          <div className="space-y-2">
            {personSummaries.map((person) => (
              <button
                key={person.name}
                onClick={() => setSelectedPerson(selectedPerson === person.name ? null : person.name)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-left ${
                  selectedPerson === person.name
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-border hover:border-rose-500/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium">{person.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {person.transactionCount} giao dịch
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {person.isOverdue && <AlertTriangleIcon className="w-4 h-4 text-amber-500" />}
                  <span className={`text-sm font-bold ${person.balance > 0 ? "text-emerald-500" : person.balance < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {person.balance > 0 ? `+${formatVND(person.balance)}` : person.balance < 0 ? `-${formatVND(Math.abs(person.balance))}` : "✅ Tất toán"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ========================= TABS & SEARCH ========================= */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-3 pt-1 -mx-4 px-4 border-b border-border/50">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {([
            { key: "all" as TabType, label: "Tất cả", icon: "📋", count: stats.total },
            { key: "receivable" as TabType, label: "Phải thu", icon: "💚", count: stats.receivableCount },
            { key: "payable" as TabType, label: "Phải trả", icon: "🔴", count: stats.payableCount },
            { key: "settled" as TabType, label: "Đã tất toán", icon: "✅", count: stats.settledCount },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelectedPerson(null); }}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                tab === t.key ? "bg-rose-500 text-white border-rose-500" : "bg-card text-muted-foreground border-border hover:border-rose-500/50"
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
            placeholder="Tìm giao dịch, tên người..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
      </div>

      {/* ========================= HOW TO USE ========================= */}
      {debtEntries.length === 0 && (
        <div className="mt-6 bg-card border border-border rounded-xl p-5">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <WalletIcon className="w-4 h-4 text-rose-500" /> Cách ghi công nợ
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-foreground mb-1">💚 Mua hộ / Bán chịu (họ nợ mình):</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">Mua hộ Tuấn 2 ESP32 500k #debt/receivable @Tuấn</code>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">🔴 Mình nợ người khác:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">Mượn Minh 5 cuốn sách 1tr #debt/payable @Minh</code>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">✅ Thanh toán / Tất toán:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">Tuấn trả 300k #debt/settled @Tuấn</code>
            </div>
          </div>
        </div>
      )}

      {/* ========================= TRANSACTION LIST ========================= */}
      <div className="mt-4 space-y-3">
        {filteredEntries.map((entry) => {
          const isReceivable = entry.type === "receivable";
          const isSettled = entry.type === "settled";
          return (
            <div
              key={entry.uid}
              className="bg-card border border-border rounded-xl px-4 py-3 hover:border-rose-500/20 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${
                  isSettled ? "bg-green-500/10 text-green-500" : isReceivable ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                }`}>
                  {isSettled ? <CheckCircleIcon className="w-4 h-4" /> : isReceivable ? <ArrowDownIcon className="w-4 h-4" /> : <ArrowUpIcon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${isSettled ? "text-green-500" : isReceivable ? "text-emerald-500" : "text-red-500"}`}>
                        {isSettled ? "Đã tất toán" : isReceivable ? "Phải thu" : "Phải trả"}
                      </span>
                      <span className="text-xs bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded">@{entry.person}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${isSettled ? "text-green-500" : isReceivable ? "text-emerald-500" : "text-red-500"}`}>
                        {entry.amount > 0 ? formatVND(entry.amount) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">{entry.date}</span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed line-clamp-2">{entry.preview}</p>
                  {entry.daysAgo > 30 && entry.type !== "settled" && (
                    <div className="flex items-center gap-1 mt-1.5 text-amber-500 text-xs">
                      <ClockIcon className="w-3 h-3" />
                      <span>{entry.daysAgo} ngày trước — quá hạn!</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredEntries.length === 0 && debtEntries.length > 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <SearchIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Không tìm thấy kết quả</p>
        </div>
      )}
    </div>
  );
};

export default DebtManager;
