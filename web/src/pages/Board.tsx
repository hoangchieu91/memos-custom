import { useMemo } from "react";
import toast from "react-hot-toast";
import MobileHeader from "@/components/MobileHeader";
import MemoView from "@/components/MemoView";
import { useMemos, useUpdateMemo } from "@/hooks/useMemoQueries";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

type ColumnTag = "todo" | "doing" | "review" | "payment" | "warranty" | "done";

interface ColumnConfig {
  tag: ColumnTag;
  title: string;
  icon: string;
  accent: string;
}

const COLUMNS: ColumnConfig[] = [
  { tag: "todo", title: "Cần làm", icon: "📌", accent: "bg-blue-500" },
  { tag: "doing", title: "Đang tiến hành", icon: "⏳", accent: "bg-amber-500" },
  { tag: "review", title: "Nghiệm thu", icon: "🔍", accent: "bg-violet-500" },
  { tag: "payment", title: "Thanh toán", icon: "💰", accent: "bg-emerald-500" },
  { tag: "warranty", title: "Bảo hành", icon: "🛡️", accent: "bg-sky-500" },
  { tag: "done", title: "Hoàn thành", icon: "✅", accent: "bg-green-600" },
];

const ALL_TAGS = COLUMNS.map((c) => c.tag);

const Board = () => {
  const { data, isLoading } = useMemos({ pageSize: 1000 });
  const updateMemo = useUpdateMemo();

  const memos = data?.memos || [];

  const columnMemos = useMemo(() => {
    const result: Record<ColumnTag, Memo[]> = {
      todo: [], doing: [], review: [], payment: [], warranty: [], done: [],
    };
    memos.forEach((m) => {
      for (const col of COLUMNS) {
        if (m.tags.includes(col.tag)) {
          result[col.tag].push(m);
          break;
        }
      }
    });
    return result;
  }, [memos]);

  const handleDragStart = (e: React.DragEvent, memoName: string) => {
    e.dataTransfer.setData("memoName", memoName);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-violet-500/40");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-violet-500/40");
  };

  const handleDrop = async (e: React.DragEvent, targetTag: ColumnTag) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-violet-500/40");
    const memoName = e.dataTransfer.getData("memoName");
    if (!memoName) return;

    const memo = memos.find((m) => m.name === memoName);
    if (!memo) return;
    if (memo.tags.includes(targetTag)) return;

    let newContent = memo.content;
    const oldTags = ALL_TAGS.filter((t) => t !== targetTag && memo.tags.includes(t));

    for (const oldTag of oldTags) {
      newContent = newContent.replace(new RegExp(`(#)${oldTag}\\b`, "g"), `$1${targetTag}`);
    }

    if (oldTags.length === 0 && !newContent.includes(`#${targetTag}`)) {
      newContent += `\n#${targetTag}`;
    }

    try {
      await updateMemo.mutateAsync({
        update: { name: memo.name, content: newContent },
        updateMask: ["content"],
      });
      const col = COLUMNS.find((c) => c.tag === targetTag);
      toast.success(`Đã chuyển sang ${col?.icon} ${col?.title}`);
    } catch {
      toast.error("Lỗi cập nhật thẻ");
    }
  };

  const renderColumn = (config: ColumnConfig, items: Memo[]) => (
    <div
      key={config.tag}
      className="flex-1 min-w-[260px] max-w-sm bg-secondary/30 rounded-2xl p-3 flex flex-col gap-3 border border-border/50 h-full transition-all"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, config.tag)}
    >
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-border/30">
        <h2 className="font-semibold text-sm flex items-center gap-1.5">
          <span>{config.icon}</span>
          {config.title}
        </h2>
        <span className="bg-background px-2 py-0.5 rounded-full text-xs font-medium border">{items.length}</span>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto h-full pb-8 hide-scrollbar">
        {items.map((memo) => (
          <div
            key={memo.name}
            draggable
            onDragStart={(e) => handleDragStart(e, memo.name)}
            className="cursor-move opacity-95 hover:opacity-100 hover:scale-[1.01] transition-all"
          >
            <div className="bg-background rounded-xl shadow-sm border hover:shadow-md transition-shadow relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${config.accent} opacity-60`}></div>
              <div className="p-3">
                <MemoView memo={memo} compact />
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="p-4 text-center text-muted-foreground/60 text-sm border-2 border-dashed rounded-xl border-border/50 flex flex-col items-center gap-2">
            <div className="text-2xl">📥</div>
            Kéo thả thẻ vào đây
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section className="@container w-full h-full flex flex-col justify-start items-start bg-background/50">
      <MobileHeader />
      <div className="w-full px-4 sm:px-6 pt-4 pb-2">
        <div className="w-full shadow-sm flex items-center justify-between px-5 py-4 rounded-2xl bg-card border">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bảng công việc (Kanban)</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Kéo thả thẻ giữa các cột: <code className="text-xs">#todo</code> → <code className="text-xs">#doing</code> → <code className="text-xs">#review</code> → <code className="text-xs">#payment</code> → <code className="text-xs">#warranty</code> → <code className="text-xs">#done</code>
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full overflow-x-auto overflow-y-hidden px-4 sm:px-6 pb-6 pt-2">
        {isLoading ? (
          <div className="w-full h-32 flex items-center justify-center text-muted-foreground">Đang tải dữ liệu...</div>
        ) : (
          <div className="flex h-[calc(100vh-180px)] min-h-[500px] gap-4 items-start pb-4">
            {COLUMNS.map((col) => renderColumn(col, columnMemos[col.tag]))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Board;
