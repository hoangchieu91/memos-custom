import {
  BriefcaseIcon, PlusIcon, SearchIcon, CheckCircleIcon, ClockIcon,
  AlertCircleIcon, PlayCircleIcon, StarIcon, CalendarIcon, TrashIcon,
  XIcon, ChevronRightIcon,
} from "lucide-react";
import { useState, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "planning" | "active" | "review" | "done" | "paused";

interface Project {
  id: string;
  name: string;
  description: string;
  client: string;
  status: Status;
  startDate: string;
  endDate: string;
  value: number;
  progress: number; // 0-100
  tags: string[];
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  planning: { label: "Lên kế hoạch", color: "text-blue-500",    bg: "bg-blue-500/10",   icon: <CalendarIcon className="w-3.5 h-3.5" /> },
  active:   { label: "Đang triển khai", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: <PlayCircleIcon className="w-3.5 h-3.5" /> },
  review:   { label: "Nghiệm thu",      color: "text-amber-500",  bg: "bg-amber-500/10",  icon: <StarIcon className="w-3.5 h-3.5" /> },
  done:     { label: "Hoàn thành",      color: "text-slate-500",  bg: "bg-slate-500/10",  icon: <CheckCircleIcon className="w-3.5 h-3.5" /> },
  paused:   { label: "Tạm dừng",        color: "text-rose-500",   bg: "bg-rose-500/10",   icon: <AlertCircleIcon className="w-3.5 h-3.5" /> },
};

const KANBAN_COLS: Status[] = ["planning", "active", "review", "done"];

const STORAGE_KEY = "personal_os_projects";

function loadProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}
function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n.toLocaleString("vi-VN")}đ`;
}

// ── Modal for adding/editing project ─────────────────────────────────────────
const ProjectModal = ({
  initial,
  onSave,
  onClose,
}: {
  initial?: Project;
  onSave: (p: Project) => void;
  onClose: () => void;
}) => {
  const blank: Project = {
    id: Date.now().toString(),
    name: "", description: "", client: "", status: "planning",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "", value: 0, progress: 0, tags: [],
  };
  const [form, setForm] = useState<Project>(initial ?? blank);
  const set = (k: keyof Project, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{initial ? "Chỉnh sửa dự án" : "Dự án mới"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XIcon className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Tên dự án *" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <textarea className="w-full bg-muted rounded-lg px-3 py-2 text-sm resize-none" rows={2} placeholder="Mô tả" value={form.description} onChange={(e) => set("description", e.target.value)} />
          <input className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Khách hàng" value={form.client} onChange={(e) => set("client", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Bắt đầu</label>
              <input type="date" className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Kết thúc</label>
              <input type="date" className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Giá trị (VND)</label>
              <input type="number" className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.value} onChange={(e) => set("value", Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tiến độ (%)</label>
              <input type="number" min={0} max={100} className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.progress} onChange={(e) => set("progress", Math.min(100, Math.max(0, Number(e.target.value))))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Trạng thái</label>
            <select className="w-full bg-muted rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => set("status", e.target.value as Status)}>
              {(Object.keys(STATUS_CONFIG) as Status[]).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          <input className="w-full bg-muted rounded-lg px-3 py-2 text-sm" placeholder="Tags (phân cách bằng dấu phẩy)" value={form.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-muted hover:bg-muted/70">Hủy</button>
          <button
            onClick={() => { if (form.name) { onSave(form); onClose(); } }}
            className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ProjectManager = () => {
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | Project | null>(null);

  const persist = (updated: Project[]) => { setProjects(updated); saveProjects(updated); };
  const upsert = (p: Project) => persist(projects.some((x) => x.id === p.id) ? projects.map((x) => x.id === p.id ? p : x) : [...projects, p]);
  const remove = (id: string) => persist(projects.filter((p) => p.id !== id));

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q));
  }, [projects, search]);

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    done: projects.filter((p) => p.status === "done").length,
    totalValue: projects.reduce((s, p) => s + p.value, 0),
  }), [projects]);

  const handleExport = (project: Project) => {
    const lines = [
      `# Báo cáo tiến độ dự án: ${project.name}`,
      ``,
      `| Hạng mục | Nội dung |`,
      `|---|---|`,
      `| Khách hàng | ${project.client || "—"} |`,
      `| Trạng thái | ${STATUS_CONFIG[project.status].label} |`,
      `| Bắt đầu | ${project.startDate} |`,
      `| Kết thúc dự kiến | ${project.endDate || "—"} |`,
      `| Giá trị hợp đồng | ${fmt(project.value)} |`,
      `| Tiến độ | ${project.progress}% |`,
      ``,
      `## Mô tả`,
      project.description || "Chưa có mô tả.",
      ``,
      `---`,
      `*Xuất ngày: ${new Date().toLocaleDateString("vi-VN")}*`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bao-cao-${project.name.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
  };

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BriefcaseIcon className="w-6 h-6 text-blue-500" />
            Quản lý Dự án
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Catalog, Kanban tiến độ & Xuất báo cáo</p>
        </div>
        <button onClick={() => setModal("new")} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors">
          <PlusIcon className="w-4 h-4" /> Dự án mới
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Tổng dự án", value: stats.total, color: "text-blue-500" },
          { label: "Đang triển khai", value: stats.active, color: "text-emerald-500" },
          { label: "Hoàn thành", value: stats.done, color: "text-slate-500" },
          { label: "Tổng giá trị", value: fmt(stats.totalValue), color: "text-amber-500" },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Tìm kiếm dự án..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {(["kanban", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs rounded-md transition-all ${view === v ? "bg-blue-500 text-white" : "text-muted-foreground hover:bg-muted"}`}>
              {v === "kanban" ? "Kanban" : "Danh sách"}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
          <BriefcaseIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">Chưa có dự án nào</h3>
          <p className="text-sm text-muted-foreground mb-4">Bắt đầu bằng cách tạo một dự án mới</p>
          <button onClick={() => setModal("new")} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600">
            Tạo dự án đầu tiên
          </button>
        </div>
      )}

      {/* Kanban View */}
      {view === "kanban" && projects.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KANBAN_COLS.map((status) => {
            const cfg = STATUS_CONFIG[status];
            const cols = filtered.filter((p) => p.status === status);
            return (
              <div key={status} className="bg-card border border-border rounded-xl p-3 min-h-40">
                <div className={`flex items-center gap-1.5 mb-3 text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                  {cfg.icon} {cfg.label} ({cols.length})
                </div>
                <div className="space-y-2">
                  {cols.map((p) => (
                    <div key={p.id} className="bg-background border border-border rounded-lg p-3 cursor-pointer hover:border-blue-500/50 transition-colors group" onClick={() => setModal(p)}>
                      <p className="text-sm font-semibold line-clamp-2 mb-1">{p.name}</p>
                      {p.client && <p className="text-[10px] text-muted-foreground mb-2">{p.client}</p>}
                      {/* Progress bar */}
                      <div className="w-full bg-muted rounded-full h-1 mb-1">
                        <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{p.progress}%</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); handleExport(p); }} className="text-[10px] text-blue-500 hover:underline">Export</button>
                          <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="text-[10px] text-rose-500 hover:underline">Xóa</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === "list" && projects.length > 0 && (
        <div className="space-y-2">
          {filtered.map((p) => {
            const cfg = STATUS_CONFIG[p.status];
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4 hover:border-blue-500/30 transition-colors cursor-pointer group" onClick={() => setModal(p)}>
                <div className={`p-2 rounded-lg ${cfg.bg} ${cfg.color} shrink-0`}>{cfg.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {p.client && <span>{p.client}</span>}
                    {p.endDate && <span>Đến: {p.endDate}</span>}
                    {p.value > 0 && <span className="text-amber-500 font-medium">{fmt(p.value)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Tiến độ</p>
                    <p className="text-sm font-bold text-blue-500">{p.progress}%</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); handleExport(p); }} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-500" title="Xuất báo cáo"><ChevronRightIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ProjectModal
          initial={modal === "new" ? undefined : modal}
          onSave={upsert}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default ProjectManager;
