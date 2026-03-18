import {
  BanknoteIcon, HandCoinsIcon, LoaderIcon, PlusIcon, TrendingDownIcon,
  TrendingUpIcon, WalletIcon, SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseVND(text: string): number {
  const unit: [RegExp, number][] = [
    [/(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)/i, 1_000_000],
    [/(\d+(?:[.,]\d+)?)\s*k/i, 1_000],
    [/(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty)/i, 1_000_000_000],
  ];
  for (const [re, mul] of unit) {
    const m = text.match(re);
    if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * mul);
  }
  const m2 = text.match(/(\d[\d.,]*)\s*(?:đ|VND|vnđ)/i);
  if (m2) return Math.round(parseFloat(m2[1].replace(/\./g, "").replace(",", "")));
  return 0;
}
function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n.toLocaleString("vi-VN")}đ`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type TxType = "salary" | "transfer" | "allowance";

interface Tx {
  uid: string;
  type: TxType;
  amount: number;
  preview: string;
  date: string;
  month: string;
}

const TX_LABELS: Record<TxType, { label: string; color: string; bg: string; emoji: string }> = {
  salary:    { label: "Nhận lương",      color: "text-emerald-500", bg: "bg-emerald-500/10", emoji: "💵" },
  transfer:  { label: "Chuyển vợ",       color: "text-rose-500",    bg: "bg-rose-500/10",    emoji: "↗️" },
  allowance: { label: "Vợ cấp tiêu dần", color: "text-blue-500",    bg: "bg-blue-500/10",    emoji: "🪙" },
};

// ── Component ─────────────────────────────────────────────────────────────────
const SalaryManager = () => {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useInfiniteMemos({
    pageSize: 500,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });

  const allMemos = useMemo(() => data?.pages.flatMap((p) => p.memos || []) ?? [], [data]);

  const transactions: Tx[] = useMemo(() => {
    return allMemos
      .filter((m) => /#salary/i.test(m.content))
      .map((m) => {
        const c = m.content;
        const type: TxType = /#salary\/transfer/i.test(c)
          ? "transfer"
          : /#salary\/allowance/i.test(c)
          ? "allowance"
          : "salary";

        let dt = new Date();
        try {
          dt = m.displayTime ? timestampDate(m.displayTime) : m.createTime ? timestampDate(m.createTime) : new Date();
        } catch { /**/ }

        return {
          uid: m.name,
          type,
          amount: parseVND(c),
          preview: c.replace(/#\S+/g, "").replace(/\n+/g, " ").trim().substring(0, 100),
          date: dayjs(dt).format("DD/MM/YYYY"),
          month: dayjs(dt).format("YYYY-MM"),
        };
      });
  }, [allMemos]);

  const stats = useMemo(() => {
    const thisMonth = dayjs().format("YYYY-MM");
    const monthly = transactions.filter((t) => t.month === thisMonth);
    const salary   = monthly.filter((t) => t.type === "salary").reduce((s, t) => s + t.amount, 0);
    const transfer = monthly.filter((t) => t.type === "transfer").reduce((s, t) => s + t.amount, 0);
    const allow    = monthly.filter((t) => t.type === "allowance").reduce((s, t) => s + t.amount, 0);
    return { salary, transfer, allow, wallet: salary - transfer + allow };
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!search) return transactions;
    const q = search.toLowerCase();
    return transactions.filter((t) => t.preview.toLowerCase().includes(q));
  }, [transactions, search]);

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HandCoinsIcon className="w-6 h-6 text-emerald-500" />
          Lương & Gia đình
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Theo dõi lương, chuyển tiền vợ & tiền được cấp</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Lương tháng này", value: stats.salary, icon: <BanknoteIcon className="w-4 h-4" />, color: "text-emerald-500", sign: "+" },
          { label: "Chuyển vợ", value: stats.transfer, icon: <TrendingDownIcon className="w-4 h-4" />, color: "text-rose-500", sign: "-" },
          { label: "Vợ cấp lại", value: stats.allow, icon: <TrendingUpIcon className="w-4 h-4" />, color: "text-blue-500", sign: "+" },
          { label: "Ví cá nhân", value: stats.wallet, icon: <WalletIcon className="w-4 h-4" />, color: stats.wallet >= 0 ? "text-emerald-500" : "text-rose-500", sign: "" },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 flex flex-col items-center text-center">
            <span className={`mb-1 ${c.color}`}>{c.icon}</span>
            <p className="text-[10px] text-muted-foreground font-medium mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.sign}{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* How to use */}
      {transactions.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl p-6 mb-6 text-center">
          <PlusIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-bold mb-2">Chưa có dữ liệu lương</h3>
          <p className="text-sm text-muted-foreground mb-4">Dùng tag <code className="bg-muted px-1 rounded">#salary</code> trong memo để bắt đầu theo dõi</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left text-xs">
            {[
              { tag: "#salary", ex: "Nhận lương tháng 3 20tr #salary" },
              { tag: "#salary/transfer", ex: "Chuyển vợ 15tr #salary/transfer" },
              { tag: "#salary/allowance", ex: "Vợ cho tiêu 2tr #salary/allowance" },
            ].map((e) => (
              <div key={e.tag} className="bg-muted/50 p-3 rounded-lg">
                <code className="text-emerald-600 dark:text-emerald-400 font-semibold">{e.tag}</code>
                <p className="text-muted-foreground mt-1">{e.ex}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Tìm kiếm giao dịch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* Transaction List */}
      <div className="space-y-2">
        {filtered.map((tx) => {
          const cfg = TX_LABELS[tx.type];
          return (
            <div key={tx.uid} className={`border border-border rounded-xl px-4 py-3 flex items-center gap-3 ${cfg.bg}`}>
              <span className="text-xl">{cfg.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">{cfg.label} · {tx.date}</p>
                <p className="text-sm truncate">{tx.preview}</p>
              </div>
              <span className={`text-sm font-bold ${cfg.color} shrink-0`}>
                {tx.type === "transfer" ? "-" : "+"}{fmt(tx.amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SalaryManager;
