import {
  FileTextIcon, PlusIcon, SearchIcon, AlertTriangleIcon, CheckCircleIcon,
  ClockIcon, XIcon, TrashIcon, PrinterIcon,
} from "lucide-react";
import { useState, useMemo } from "react";

type ContractStatus = "draft" | "signed" | "active" | "settled" | "cancelled";

interface Contract {
  id: string;
  number: string;
  name: string;
  partyA: string;
  partyB: string;
  value: number;
  signDate: string;
  endDate: string;
  status: ContractStatus;
  notes: string;
  projectId?: string;
}

const STATUS_CFG: Record<ContractStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: "Soạn thảo",  color: "text-blue-500",   bg: "bg-blue-500/10",   icon: <FileTextIcon className="w-3.5 h-3.5" /> },
  signed:    { label: "Đã ký kết",  color: "text-emerald-500",bg: "bg-emerald-500/10",icon: <CheckCircleIcon className="w-3.5 h-3.5" /> },
  active:    { label: "Đang thực hiện", color: "text-amber-500", bg: "bg-amber-500/10", icon: <ClockIcon className="w-3.5 h-3.5" /> },
  settled:   { label: "Đã thanh lý", color: "text-slate-400",  bg: "bg-slate-400/10",  icon: <CheckCircleIcon className="w-3.5 h-3.5" /> },
  cancelled: { label: "Hủy bỏ",     color: "text-rose-500",   bg: "bg-rose-500/10",   icon: <XIcon className="w-3.5 h-3.5" /> },
};

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n.toLocaleString("vi-VN")}đ`;
}

const STORAGE_KEY = "personal_os_contracts";
function load(): Contract[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function save(c: Contract[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

function daysLeft(dateStr: string): number {
  if (!dateStr) return Infinity;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const ContractModal = ({ initial, onSave, onClose }: { initial?: Contract; onSave: (c: Contract) => void; onClose: () => void }) => {
  const blank: Contract = {
    id: Date.now().toString(), number: "", name: "", partyA: "Công ty TNGo",
    partyB: "", value: 0, signDate: new Date().toISOString().slice(0, 10),
    endDate: "", status: "draft", notes: "",
  };
  const [form, setForm] = useState<Contract>(initial ?? blank);
  const set = (k: keyof Contract, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{initial ? "Chỉnh sửa hợp đồng" : "Hợp đồng mới"}</h2>
          <button onClick={onClose}><XIcon className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Số HĐ (VD: HĐ-2026-001)" value={form.number} onChange={(e) => set("number", e.target.value)} />
            <select className="bg-muted rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => set("status", e.target.value as ContractStatus)}>
              {(Object.keys(STATUS_CFG) as ContractStatus[]).map((s) => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
            </select>
          </div>
          <input className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Tên hợp đồng *" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <input className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Bên A" value={form.partyA} onChange={(e) => set("partyA", e.target.value)} />
          <input className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Bên B (khách hàng)" value={form.partyB} onChange={(e) => set("partyB", e.target.value)} />
          <input type="number" className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Giá trị hợp đồng (VND)" value={form.value} onChange={(e) => set("value", Number(e.target.value))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ngày ký</label>
              <input type="date" className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.signDate} onChange={(e) => set("signDate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hết hạn</label>
              <input type="date" className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </div>
          <textarea className="w-full bg-muted rounded-lg px-3 py-2 text-sm resize-none" rows={2} placeholder="Ghi chú" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-muted">Hủy</button>
          <button onClick={() => { if (form.name) { onSave(form); onClose(); } }} className="px-4 py-2 text-sm rounded-lg bg-violet-500 text-white hover:bg-violet-600">Lưu</button>
        </div>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const ContractManager = () => {
  const [contracts, setContracts] = useState<Contract[]>(load);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ContractStatus | "all">("all");
  const [modal, setModal] = useState<"new" | Contract | null>(null);

  const persist = (c: Contract[]) => { setContracts(c); save(c); };
  const upsert = (c: Contract) => persist(contracts.some((x) => x.id === c.id) ? contracts.map((x) => x.id === c.id ? c : x) : [...contracts, c]);
  const remove = (id: string) => persist(contracts.filter((c) => c.id !== id));

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const q = search.toLowerCase();
      const matchQ = !search || c.name.toLowerCase().includes(q) || c.partyB.toLowerCase().includes(q) || c.number.toLowerCase().includes(q);
      const matchS = filterStatus === "all" || c.status === filterStatus;
      return matchQ && matchS;
    });
  }, [contracts, search, filterStatus]);

  const alerts = useMemo(() =>
    contracts.filter((c) => c.status === "active" && c.endDate && daysLeft(c.endDate) <= 30 && daysLeft(c.endDate) > 0),
    [contracts]);

  const totalValue = contracts.filter((c) => c.status !== "cancelled").reduce((s, c) => s + c.value, 0);

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileTextIcon className="w-6 h-6 text-violet-500" />
            Quản lý Hợp đồng
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Theo dõi hợp đồng A/B, trạng thái & cảnh báo hết hạn</p>
        </div>
        <button onClick={() => setModal("new")} className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 transition-colors">
          <PlusIcon className="w-4 h-4" /> Hợp đồng mới
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">⚠️ {alerts.length} hợp đồng sắp hết hạn!</p>
            {alerts.map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">{c.name}</span> — còn {daysLeft(c.endDate)} ngày
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Tổng HĐ", value: contracts.length, color: "text-violet-500" },
          { label: "Đang thực hiện", value: contracts.filter((c) => c.status === "active").length, color: "text-amber-500" },
          { label: "Đã thanh lý", value: contracts.filter((c) => c.status === "settled").length, color: "text-slate-400" },
          { label: "Tổng giá trị", value: fmt(totalValue), color: "text-emerald-500" },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Tìm hợp đồng..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", ...Object.keys(STATUS_CFG)] as (ContractStatus | "all")[]).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 text-xs rounded-full border transition-all ${filterStatus === s ? "bg-violet-500 text-white border-violet-500" : "bg-card text-muted-foreground border-border"}`}>
              {s === "all" ? "Tất cả" : STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty */}
      {contracts.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
          <FileTextIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">Chưa có hợp đồng nào</h3>
          <button onClick={() => setModal("new")} className="px-4 py-2 bg-violet-500 text-white rounded-xl text-sm hover:bg-violet-600">Tạo hợp đồng đầu tiên</button>
        </div>
      )}

      {/* Contract List */}
      <div className="space-y-2">
        {filtered.map((c) => {
          const cfg = STATUS_CFG[c.status];
          const days = c.endDate ? daysLeft(c.endDate) : null;
          const urgent = days !== null && days <= 30 && days > 0 && c.status === "active";
          return (
            <div key={c.id} className={`bg-card border rounded-xl px-4 py-3 flex items-center gap-4 hover:border-violet-500/30 cursor-pointer transition-colors group ${urgent ? "border-amber-500/40" : "border-border"}`} onClick={() => setModal(c)}>
              <div className={`p-2 rounded-lg ${cfg.bg} ${cfg.color} shrink-0`}>{cfg.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {c.number && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{c.number}</span>}
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  {urgent && <span className="text-[10px] text-amber-500 font-semibold">⚠️ còn {days}d</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {c.partyB && <span>B: {c.partyB}</span>}
                  {c.signDate && <span>Ký: {c.signDate}</span>}
                  {c.endDate && <span>Hết: {c.endDate}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {c.value > 0 && <span className="text-sm font-bold text-emerald-500">{fmt(c.value)}</span>}
                <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-all">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modal && <ContractModal initial={modal === "new" ? undefined : modal} onSave={upsert} onClose={() => setModal(null)} />}
    </div>
  );
};

export default ContractManager;
