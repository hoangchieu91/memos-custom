/**
 * Board.tsx — Kanban board (redesigned)
 *
 * ✅ Compact cards with truncated title + tags only (no full MemoView)
 * ✅ Search bar to filter cards
 * ✅ #task and #task/* treated as alias for #todo
 * ✅ Drag & drop to move cards between columns
 * ✅ Card count per column
 * ✅ Click card to open in memo detail
 * ✅ Priority badge (auto-detected from content keywords)
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { SearchIcon, XIcon } from "lucide-react";
import MobileHeader from "@/components/MobileHeader";
import { useMemos, useUpdateMemo } from "@/hooks/useMemoQueries";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

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
  colorClass: string;  // header accent
  bgClass: string;     // column bg
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

// #task and #task/* → treated as #todo
function getMemoColumn(memo: Memo): ColumnTag | null {
  const tags = memo.tags || [];
  if (tags.some((t) => t === "task" || t.startsWith("task/"))) return "todo";
  for (const col of COLUMNS) {
    if (tags.includes(col.tag)) return col.tag;
  }
  return null;
}

// Priority detection from content
function getPriority(content: string): "high" | "normal" | null {
  if (/urgent|khẩn|gấp|quan trọng|priority/i.test(content)) return "high";
  return null;
}

// Extract a clean title from memo content (first non-tag line)
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
}: {
  memo: Memo;
  accentClass: string;
  onDragStart: (e: React.DragEvent, name: string) => void;
}) => {
  const navigate = useNavigate();
  const priority = getPriority(memo.content);
  const title = getTitle(memo.content);
  const visibleTags = (memo.tags || []).filter((t) => !ALL_COL_TAGS.includes(t) && t !== "task").slice(0, 3);
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
      className="group relative bg-card rounded-lg border border-border hover:border-border/80 hover:shadow-sm cursor-pointer transition-all duration-150 overflow-hidden"
    >
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 w-0.5 h-full ${accentClass}`} />

      <div className="pl-3 pr-2.5 py-2">
        {/* Title row */}
        <div className="flex items-start gap-1.5">
          {priority === "high" && (
            <span className="mt-0.5 shrink-0 text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/15 text-red-500">HOT</span>
          )}
          <p className="text-xs font-medium leading-snug line-clamp-2 text-foreground">{title}</p>
        </div>

        {/* Tags + time */}
        <div className="flex items-center justify-between mt-1.5 gap-1 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {visibleTags.map((tag) => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/50">
                #{tag}
              </span>
            ))}
          </div>
          {displayTime && (
            <span className="text-[9px] text-muted-foreground/60 shrink-0">{displayTime}</span>
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
}: {
  config: ColumnConfig;
  items: Memo[];
  onDragStart: (e: React.DragEvent, name: string) => void;
  onDrop: (e: React.DragEvent, tag: ColumnTag) => void;
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`flex flex-col rounded-xl border border-border/50 min-w-[200px] max-w-[240px] flex-1 transition-all ${config.bgClass} ${isDragOver ? "ring-2 ring-violet-500/40 scale-[1.005]" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { setIsDragOver(false); onDrop(e, config.tag); }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${config.colorClass}`} />
          <span className="text-xs font-semibold text-foreground/80">{config.icon} {config.title}</span>
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background border text-muted-foreground">{items.length}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 min-h-[100px] max-h-[calc(100vh-240px)]">
        {items.map((memo) => (
          <KanbanCard
            key={memo.name}
            memo={memo}
            accentClass={config.colorClass}
            onDragStart={onDragStart}
          />
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/40 text-[10px] gap-1 border-2 border-dashed rounded-lg border-border/30">
            <span className="text-lg">📥</span>
            Kéo thả vào đây
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Board ─────────────────────────────────────────────────────────────────
const Board = () => {
  const { data, isLoading } = useMemos({ pageSize: 1000 });
  const updateMemo = useUpdateMemo();
  const [search, setSearch] = useState("");

  const memos = data?.memos || [];

  // Filter: only memos that belong to a column
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

  const handleDrop = async (e: React.DragEvent, targetTag: ColumnTag) => {
    e.preventDefault();
    const memoName = e.dataTransfer.getData("memoName");
    if (!memoName) return;

    const memo = memos.find((m) => m.name === memoName);
    if (!memo) return;
    if (getMemoColumn(memo) === targetTag) return;

    // Replace old column tags (and task/* aliases) with new tag
    let newContent = memo.content;
    const taskAliasRe = /#(task(?:\/\S+)?)\b/g;
    newContent = newContent.replace(taskAliasRe, `#${targetTag}`);

    const otherColTags = ALL_COL_TAGS.filter((t) => t !== targetTag && (memo.tags || []).includes(t));
    for (const old of otherColTags) {
      newContent = newContent.replace(new RegExp(`(#)${old}\\b`, "g"), `#${targetTag}`);
    }

    if (newContent === memo.content) {
      // Nothing was replaced — just append
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
  };

  return (
    <section className="@container w-full h-screen flex flex-col bg-background">
      <MobileHeader />

      {/* Top bar */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold tracking-tight">🗂️ Bảng Kanban</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tag <code className="text-[10px]">#todo #doing #review #payment #warranty #done</code> — <code className="text-[10px]">#task</code> = <code className="text-[10px]">#todo</code>
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="h-8 pl-8 pr-8 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-44"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <span className="text-[10px] text-muted-foreground">{boardMemos.length} thẻ</span>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 sm:px-5 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Đang tải...</div>
        ) : (
          <div className="flex gap-3 h-full items-start">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.tag}
                config={col}
                items={columnMemos[col.tag]}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Board;
