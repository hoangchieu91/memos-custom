/**
 * Board.tsx — Kanban board (v2 — mobile responsive + quick-add)
 *
 * ✅ Compact cards with truncated title + tags only
 * ✅ Search bar to filter cards
 * ✅ #task and #task/* treated as alias for #todo
 * ✅ Drag & drop (desktop)
 * ✅ Card count per column
 * ✅ Click card to open in memo detail
 * ✅ Priority badge (auto-detected)
 * ✅ Mobile responsive — columns stack vertically with collapse
 * ✅ Quick-add card per column
 * ✅ Improved empty states
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { 
  SearchIcon, XIcon, PlusIcon, ChevronDownIcon, ArrowRightIcon, 
  Settings2Icon, LayoutDashboardIcon, EyeIcon, EyeOffIcon,
  Maximize2Icon, Minimize2Icon
} from "lucide-react";
import MobileHeader from "@/components/MobileHeader";
import { useMemos, useUpdateMemo, useCreateMemo } from "@/hooks/useMemoQueries";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import useMediaQuery from "@/hooks/useMediaQuery";

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

type ColumnTag = "todo" | "doing" | "review" | "payment" | "warranty" | "done";

interface ColumnConfig {
  tag: ColumnTag;
  title: string;
  icon: string;
  colorClass: string;
  bgClass: string;
}

const COLUMNS: ColumnConfig[] = [
  { tag: "todo",     title: "Cần làm",       icon: "📌", colorClass: "bg-blue-500",    bgClass: "bg-blue-500/5" },
  { tag: "doing",    title: "Đang làm",       icon: "⏳", colorClass: "bg-amber-500",   bgClass: "bg-amber-500/5" },
  { tag: "review",   title: "Nghiệm thu",     icon: "🔍", colorClass: "bg-violet-500",  bgClass: "bg-violet-500/5" },
  { tag: "payment",  title: "Thanh toán",     icon: "💰", colorClass: "bg-emerald-500", bgClass: "bg-emerald-500/5" },
  { tag: "warranty", title: "Bảo hành",       icon: "🛡️", colorClass: "bg-sky-500",     bgClass: "bg-sky-500/5" },
  { tag: "done",     title: "Hoàn thành",     icon: "✅", colorClass: "bg-green-600",   bgClass: "bg-green-600/5" },
];

const ALL_COL_TAGS = COLUMNS.map((c) => c.tag);

function getMemoColumn(memo: Memo): ColumnTag | null {
  const tags = memo.tags || [];
  // Hierarchical task support: check endsWith(/task) or startsWith(task/) or equals(task)
  // Check todo specifically first as it has 'task' alias
  const isTodo = tags.some((t) =>
    t === "todo" || t === "task" || t.endsWith("/todo") || t.endsWith("/task") || t.startsWith("task/")
  );
  if (isTodo) return "todo";

  for (const col of COLUMNS) {
    if (col.tag === "todo") continue;
    if (tags.some((t) => t === col.tag || t.endsWith("/" + col.tag))) return col.tag;
  }
  return null;
}

function getPriority(content: string): "high" | null {
  if (/urgent|khẩn|gấp|quan trọng|priority/i.test(content)) return "high";
  return null;
}

function getTitle(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const clean = line.replace(/#\S+/g, "").trim();
    if (clean.length > 2) return clean.substring(0, 80);
  }
  return content.replace(/#\S+/g, "").trim().substring(0, 80) || "Memo";
}

// ── Compact Kanban Card ────────────────────────────────────────────────────────
const KanbanCard = ({
  memo,
  accentClass,
  onDragStart,
  nextColumn,
  onMoveNext,
  density = "compact",
}: {
  memo: Memo;
  accentClass: string;
  onDragStart: (e: React.DragEvent, name: string) => void;
  nextColumn?: ColumnConfig;
  onMoveNext?: (memoName: string, targetTag: ColumnTag) => void;
  density?: "compact" | "standard";
}) => {
  const navigate = useNavigate();
  const priority = getPriority(memo.content);
  const title = getTitle(memo.content);
  const visibleTags = (memo.tags || []).filter((t) => !(ALL_COL_TAGS as string[]).includes(t) && t !== "task").slice(0, 3);
  
  // Extract a preview for standard density
  const previewContent = useMemo(() => {
    if (density === "compact") return "";
    return memo.content.split("\n").filter(l => !l.startsWith("#") && l.trim()).slice(0, 3).join(" ");
  }, [memo.content, density]);

  const displayTime = (() => {
    try {
      if (!memo.displayTime) return "";
      const secs = Number(memo.displayTime.seconds ?? 0);
      return timeAgo(new Date(secs * 1000));
    } catch { return ""; }
  })();

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, memo.name)}
      onClick={() => navigate(`/${memo.name}`)}
      className={`group relative bg-card rounded-lg border border-border hover:border-border/80 hover:shadow-md cursor-pointer transition-all duration-150 overflow-hidden ${
        density === "standard" ? "py-2.5" : "py-2"
      }`}
    >
      <div className={`absolute left-0 top-0 w-0.5 h-full ${accentClass}`} />

      <div className="pl-3 pr-2.5">
        <div className="flex items-start gap-1.5 font-sans">
          {priority === "high" && (
            <span className="mt-0.5 shrink-0 text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/15 text-red-500 animate-pulse">HOT</span>
          )}
          <p className={`text-xs font-semibold leading-snug text-foreground flex-1 ${density === "compact" ? "line-clamp-2" : "line-clamp-1"}`}>
            {title}
          </p>

          {nextColumn && onMoveNext && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveNext(memo.name, nextColumn.tag); }}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground/60 hover:text-foreground transition-all"
              title={`Chuyển → ${nextColumn.icon} ${nextColumn.title}`}
            >
              <ArrowRightIcon className="w-3 h-3" />
            </button>
          )}
        </div>

        {density === "standard" && previewContent && (
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed line-clamp-3 font-sans opacity-80">
            {previewContent}
          </p>
        )}

        <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {visibleTags.map((tag) => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground border border-border/30">
                #{tag}
              </span>
            ))}
          </div>
          {displayTime && (
            <span className="text-[9px] text-muted-foreground/50 shrink-0 font-mono">{displayTime}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Column ─────────────────────────────────────────────────────────────────────
const KanbanColumn = ({
  config,
  items,
  onDragStart,
  onDrop,
  nextColumn,
  onMoveNext,
  isMobile,
  density,
}: {
  config: ColumnConfig;
  items: Memo[];
  onDragStart: (e: React.DragEvent, name: string) => void;
  onDrop: (e: React.DragEvent, tag: ColumnTag) => void;
  nextColumn?: ColumnConfig;
  onMoveNext: (memoName: string, targetTag: ColumnTag) => void;
  isMobile: boolean;
  density: "compact" | "standard";
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCardText, setNewCardText] = useState("");
  const createMemo = useCreateMemo();

  const handleAddCard = useCallback(async () => {
    if (!newCardText.trim()) return;
    try {
      await createMemo.mutateAsync({
        content: `${newCardText.trim()}\n#${config.tag}`,
      } as any);
      toast.success(`${config.icon} Đã tạo thẻ mới!`);
      setNewCardText("");
      setShowAddForm(false);
    } catch {
      toast.error("Lỗi tạo thẻ");
    }
  }, [newCardText, config, createMemo]);

  return (
    <div
      className={`flex flex-col rounded-xl border border-border/50 transition-all ${config.bgClass} ${isDragOver ? "ring-2 ring-primary/40 scale-[1.005]" : ""} ${
        isMobile ? "w-full" : "min-w-[280px] sm:min-w-[300px] flex-1 max-w-[400px]"
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { setIsDragOver(false); onDrop(e, config.tag); }}
    >
      {/* Column header - STICKY */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-3.5 py-2.5 bg-card/60 backdrop-blur-md border-b border-border/30 rounded-t-xl">
        <button
          onClick={() => isMobile && setIsCollapsed((v) => !v)}
          className={`flex items-center gap-2 ${isMobile ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${config.colorClass}`} />
          <span className="text-[13px] font-bold text-foreground/90 tracking-tight">{config.icon} {config.title}</span>
          {isMobile && (
            <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
          )}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50">{items.length}</span>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="p-1 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
            title="Thêm thẻ mới"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick-add form */}
      {showAddForm && (
        <div className="px-2.5 pt-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
          <textarea
            autoFocus
            value={newCardText}
            onChange={(e) => setNewCardText(e.target.value)}
            placeholder="Nội dung thẻ mới..."
            className="w-full bg-card border border-border rounded-lg p-2.5 text-xs resize-none min-h-[64px] focus:outline-none focus:ring-1 focus:ring-ring transition-shadow shadow-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(); }
              if (e.key === "Escape") setShowAddForm(false);
            }}
          />
          <div className="flex justify-end gap-1.5 mt-1.5 mb-1.5">
            <button onClick={() => setShowAddForm(false)} className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">Hủy</button>
            <button
              onClick={handleAddCard}
              disabled={!newCardText.trim()}
              className={`px-3 py-1 text-[11px] font-bold ${config.colorClass} text-white rounded-md shadow-sm disabled:opacity-40 transition-opacity`}
            >
              Tạo thẻ
            </button>
          </div>
        </div>
      )}

      {/* Cards container with custom scrollbar */}
      {!(isMobile && isCollapsed) && (
        <div className={`flex flex-col gap-2.5 p-2.5 overflow-y-auto flex-1 min-h-[100px] 
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-muted-foreground/10 
          [&::-webkit-scrollbar-thumb]:rounded-full 
          hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 
          transition-all duration-300
          ${isMobile ? "max-h-[60vh]" : "max-h-[calc(100vh-220px)]"}`}
        >
          {items.map((memo) => (
            <KanbanCard
              key={memo.name}
              memo={memo}
              accentClass={config.colorClass}
              onDragStart={onDragStart}
              nextColumn={nextColumn}
              onMoveNext={onMoveNext}
              density={density}
            />
          ))}
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/30 text-[11px] gap-2 border-2 border-dashed rounded-xl border-border/20">
              <span className="text-2xl opacity-50 grayscale">📥</span>
              <p className="font-medium">Chưa có nhiệm vụ nào</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Board ─────────────────────────────────────────────────────────────────
const Board = () => {
  const { data, isLoading } = useMemos({ pageSize: 2000 }); // Increased for Pro view
  const updateMemo = useUpdateMemo();
  const [search, setSearch] = useState("");
  const isMobile = !useMediaQuery("sm");
  
  // Settings & Density states
  const [density, setDensity] = useState<"compact" | "standard">(() => {
    return (localStorage.getItem("kanban_density") as any) || "compact";
  });
  const [visibleColumns, setVisibleColumns] = useState<ColumnTag[]>(() => {
    const saved = localStorage.getItem("kanban_columns");
    return saved ? JSON.parse(saved) : ALL_COL_TAGS;
  });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem("kanban_density", density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem("kanban_columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (tag: ColumnTag) => {
    setVisibleColumns(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const memos = data?.memos || [];

  const boardMemos = useMemo(() => {
    let list = memos.filter((m) => getMemoColumn(m) !== null);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.content.toLowerCase().includes(q) || (m.tags || []).some((t) => t.includes(q)),
      );
    }
    return list;
  }, [memos, search]);

  const columnMemos = useMemo(() => {
    const result: Record<ColumnTag, Memo[]> = {
      todo: [], doing: [], review: [], payment: [], warranty: [], done: [],
    };
    boardMemos.forEach((m) => {
      const col = getMemoColumn(m);
      if (col) result[col].push(m);
    });
    return result;
  }, [boardMemos]);

  const handleDragStart = (e: React.DragEvent, memoName: string) => {
    e.dataTransfer.setData("memoName", memoName);
  };

  const moveMemo = useCallback(async (memoName: string, targetTag: ColumnTag) => {
    const memo = memos.find((m) => m.name === memoName);
    if (!memo) return;
    if (getMemoColumn(memo) === targetTag) return;

    let newContent = memo.content;

    // 1. Replace hierarchical tags
    const hierarchicalTagRe = /#(\S+?)\/(todo|doing|review|payment|warranty|done|task)\b/g;
    newContent = newContent.replace(hierarchicalTagRe, (_, prefix) => `#${prefix}/${targetTag}`);

    // 2. Replace simple tags
    const simpleTagRe = new RegExp(`#(todo|doing|review|payment|warranty|done|task)\\b`, "g");
    newContent = newContent.replace(simpleTagRe, `#${targetTag}`);

    const currentTags = (newContent.match(/#\S+/g) || []).map((t) => t.slice(1));
    const hasTarget = currentTags.some((t) => t === targetTag || t.endsWith("/" + targetTag));

    if (!hasTarget) {
      newContent += `\n#${targetTag}`;
    }

    try {
      await updateMemo.mutateAsync({
        update: { name: memo.name, content: newContent },
        updateMask: ["content"],
      });
      const col = COLUMNS.find((c) => c.tag === targetTag);
      toast.success(`Chuyển sang ${col?.icon} ${col?.title}`);
    } catch {
      toast.error("Lỗi cập nhật");
    }
  }, [memos, updateMemo]);

  const handleDrop = async (e: React.DragEvent, targetTag: ColumnTag) => {
    e.preventDefault();
    const memoName = e.dataTransfer.getData("memoName");
    if (!memoName) return;
    moveMemo(memoName, targetTag);
  };

  return (
    <section className="@container w-full min-h-screen flex flex-col bg-background/50">
      <MobileHeader />

      {/* Enhanced Top bar */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-border/40 bg-card/30 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <LayoutDashboardIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-foreground">Kanban Pro</h1>
              <p className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest hidden sm:block">
                Workspace / Tasks Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kế hoạch..."
                className="h-9 pl-9 pr-8 rounded-xl border border-border/60 bg-background/50 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 w-40 sm:w-64 transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Density toggle */}
            <button
              onClick={() => setDensity(d => d === "compact" ? "standard" : "compact")}
              className="p-2 rounded-xl border border-border/60 bg-background/50 hover:bg-accent text-muted-foreground transition-all"
              title={density === "compact" ? "Chuyển sang xem Chi tiết" : "Chuyển sang xem Thu gọn"}
            >
              {density === "compact" ? <Maximize2Icon className="w-4 h-4" /> : <Minimize2Icon className="w-4 h-4" />}
            </button>

            {/* Settings toggle */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl border border-border/60 bg-background/50 hover:bg-accent transition-all ${showSettings ? "ring-2 ring-primary/20 text-primary" : "text-muted-foreground"}`}
                title="Cấu hình hiển thị"
              >
                <Settings2Icon className="w-4 h-4" />
              </button>
              
              {showSettings && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSettings(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-2xl shadow-2xl p-3 z-40 animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-3 px-1 tracking-wider">Hiển thị cột</p>
                    <div className="flex flex-col gap-1">
                      {COLUMNS.map(col => (
                        <button
                          key={col.tag}
                          onClick={() => toggleColumn(col.tag)}
                          className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{col.icon}</span>
                            <span className="text-xs font-semibold">{col.title}</span>
                          </div>
                          {visibleColumns.includes(col.tag) ? <EyeIcon className="w-3.5 h-3.5 text-primary" /> : <EyeOffIcon className="w-3.5 h-3.5 text-muted-foreground/30" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Columns Container */}
      <div className="flex-1 overflow-x-auto px-4 sm:px-6 py-6 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground animate-pulse">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs font-bold uppercase tracking-widest">Đang tải dữ liệu...</span>
          </div>
        ) : (
          <div className={`${isMobile ? "flex flex-col gap-6" : "flex gap-5 h-full items-start"}`}>
            {COLUMNS.filter(col => visibleColumns.includes(col.tag)).map((col, i) => (
              <KanbanColumn
                key={col.tag}
                config={col}
                items={columnMemos[col.tag]}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                nextColumn={i < COLUMNS.length - 1 ? COLUMNS[i + 1] : undefined}
                onMoveNext={moveMemo}
                isMobile={isMobile}
                density={density}
              />
            ))}
            
            {visibleColumns.length < COLUMNS.length && (
              <button 
                onClick={() => setShowSettings(true)}
                className="flex flex-col items-center justify-center min-w-[100px] h-full rounded-2xl border-2 border-dashed border-border/20 hover:border-primary/20 hover:bg-primary/5 text-muted-foreground/40 hover:text-primary transition-all group py-10"
              >
                <PlusIcon className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-tighter">Hiện thêm cột</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default Board;
