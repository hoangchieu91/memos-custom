import { CheckCircle2Icon, CircleDotIcon, FilterIcon, GitBranchIcon, HashIcon, LoaderIcon, MapPinIcon, SparklesIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";

interface TaskItem {
  text: string;
  done: boolean;
}

interface TimelineNode {
  name: string;
  uid: string;
  content: string;
  preview: string;
  date: string;
  time: string;
  tags: string[];
  tasks: TaskItem[];
  totalTasks: number;
  doneTasks: number;
  type: "event" | "quest" | "note";
  createTime: string;
}

type FilterType = "all" | "quest" | "event" | "note";

const QuestTimeline = () => {
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteMemos({
    pageSize: 200,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });

  const allMemos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.memos || []);
  }, [data]);

  const nodes: TimelineNode[] = useMemo(() => {
    return allMemos
      .map((memo) => {
        const content = memo.content || "";
        const name = memo.name || "";
        const tags = content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || [];
        const taskMatches = content.match(/- \[[ x]\].+/g) || [];
        const tasks: TaskItem[] = taskMatches.map((t) => ({
          text: t.replace(/- \[[ x]\]\s*/, "").trim(),
          done: t.includes("[x]"),
        }));
        const totalTasks = tasks.length;
        const doneTasks = tasks.filter((t) => t.done).length;

        const isCheckin = tags.some((t) => t.includes("checkin"));
        const isQuest = totalTasks > 0;
        const type: "event" | "quest" | "note" = isCheckin ? "event" : isQuest ? "quest" : "note";

        const preview = content
          .replace(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g, "")
          .replace(/- \[[ x]\].+/g, "")
          .replace(/\n+/g, " ")
          .trim()
          .substring(0, 120);

        let dt: Date;
        try {
          if (memo.displayTime) {
            dt = timestampDate(memo.displayTime);
          } else if (memo.createTime) {
            dt = timestampDate(memo.createTime);
          } else {
            dt = new Date();
          }
        } catch {
          dt = new Date();
        }
        const createTime = dt.toISOString();
        const date = dt.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
        const time = dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        const uid = name.split("/")[1] || name;

        return { name, uid, content, preview, date, time, tags, tasks, totalTasks, doneTasks, type, createTime };
      })
      // ASCENDING: oldest first, newest at bottom
      .sort((a, b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime());
  }, [allMemos]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    nodes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [nodes]);

  // Apply filter + tag filter
  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (filter !== "all") result = result.filter((n) => n.type === filter);
    if (selectedTag) result = result.filter((n) => n.tags.includes(selectedTag));
    return result;
  }, [nodes, filter, selectedTag]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineNode[]>();
    filteredNodes.forEach((n) => {
      if (!map.has(n.date)) map.set(n.date, []);
      map.get(n.date)!.push(n);
    });
    return Array.from(map.entries());
  }, [filteredNodes]);

  const toggleExpand = (uid: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const getDotColor = (node: TimelineNode) => {
    if (node.type === "quest") {
      if (node.totalTasks === node.doneTasks && node.totalTasks > 0) return "bg-emerald-500 shadow-emerald-500/50";
      if (node.doneTasks > 0) return "bg-amber-500 shadow-amber-500/50";
      return "bg-red-500 shadow-red-500/50";
    }
    if (node.type === "event") return "bg-sky-500 shadow-sky-500/50";
    return "bg-violet-500 shadow-violet-500/50";
  };

  const getDotIcon = (node: TimelineNode) => {
    if (node.type === "quest") {
      if (node.totalTasks === node.doneTasks && node.totalTasks > 0)
        return <CheckCircle2Icon className="w-4 h-4 text-white" />;
      return <GitBranchIcon className="w-4 h-4 text-white" />;
    }
    if (node.type === "event") return <MapPinIcon className="w-4 h-4 text-white" />;
    return <CircleDotIcon className="w-4 h-4 text-white" />;
  };

  const getStatusLabel = (node: TimelineNode) => {
    if (node.type === "quest") {
      if (node.totalTasks === node.doneTasks && node.totalTasks > 0) return "🏆 Hoàn thành";
      if (node.doneTasks > 0) return `⚡ ${node.doneTasks}/${node.totalTasks}`;
      return `🎯 ${node.totalTasks} chờ`;
    }
    if (node.type === "event") return "📍 Sự kiện";
    return "📝 Ghi chú";
  };

  const filterButtons: { key: FilterType; label: string; icon: string }[] = [
    { key: "all", label: "Tất cả", icon: "🌐" },
    { key: "quest", label: "Nhiệm vụ", icon: "🎯" },
    { key: "event", label: "Sự kiện", icon: "📍" },
    { key: "note", label: "Ghi chú", icon: "📝" },
  ];

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderIcon className="w-8 h-8 animate-spin text-violet-500" />
          <span className="text-muted-foreground">Đang tải Quest Timeline...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SparklesIcon className="w-6 h-6 text-amber-500" />
          Quest Timeline
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {nodes.length} sự kiện · {nodes.filter((n) => n.type === "quest").length} nhiệm vụ ·{" "}
          {nodes.filter((n) => n.type === "quest" && n.totalTasks === n.doneTasks && n.totalTasks > 0).length} hoàn thành
        </p>
      </div>

      {/* Sticky filter toolbar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-3 pt-1 -mx-4 px-4 border-b border-border/50">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterIcon className="w-4 h-4 text-muted-foreground" />
          {filterButtons.map((fb) => (
            <button
              key={fb.key}
              onClick={() => setFilter(fb.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                filter === fb.key
                  ? "bg-violet-500 text-white border-violet-500"
                  : "bg-card text-muted-foreground border-border hover:border-violet-500/50"
              }`}
            >
              {fb.icon} {fb.label}
              {fb.key !== "all" && (
                <span className="ml-1 opacity-70">({nodes.filter((n) => n.type === fb.key).length})</span>
              )}
            </button>
          ))}

          {/* Hashtag filter */}
          <div className="relative ml-auto flex items-center gap-1">
            <HashIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="text-xs bg-card border border-border rounded-lg px-2 py-1.5 text-foreground appearance-none cursor-pointer pr-6 min-w-[100px] hover:border-violet-500/50 transition-colors"
            >
              <option value="">Tất cả tag</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            {selectedTag && (
              <button onClick={() => setSelectedTag("")} className="p-0.5 rounded hover:bg-muted transition-colors">
                <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        {selectedTag && (
          <div className="mt-2 text-xs text-violet-400">
            Đang lọc: <span className="font-medium">{selectedTag}</span> ({filteredNodes.length} kết quả)
          </div>
        )}
      </div>

      {/* Timeline — reversed: oldest top, newest bottom */}
      <div className="relative">
        <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-emerald-500 via-sky-500 to-violet-500 opacity-30" />

        {grouped.map(([date, dateNodes], gi) => (
          <div key={gi} className="mb-8">
            <div className="flex items-center gap-3 mb-4 ml-[2px]">
              <div className="w-[34px] h-[34px] rounded-full bg-muted border-2 border-border flex items-center justify-center text-xs font-bold z-10">
                {new Date(dateNodes[0].createTime).getDate()}
              </div>
              <span className="text-sm font-semibold text-muted-foreground">{date}</span>
            </div>

            {dateNodes.map((node, ni) => {
              const isExpanded = expandedNodes.has(node.uid);
              const hasSubTasks = node.type === "quest" && node.tasks.length > 0;

              return (
                <div key={ni} className="relative mb-6 group">
                  {/* Sub-tasks ABOVE parent (since display is reversed) */}
                  {hasSubTasks && isExpanded && (
                    <div className="ml-[52px] mb-2 space-y-1 animate-in slide-in-from-bottom-2 duration-200">
                      {node.tasks.map((task, ti) => (
                        <div key={ti} className="flex items-center gap-2">
                          <div className="flex items-center" style={{ width: "24px" }}>
                            <div className="w-[12px] h-[2px] bg-violet-500/30" />
                            <div
                              className={`w-[10px] h-[10px] rounded-full flex-shrink-0 transition-all duration-500 ${
                                task.done ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-muted border-2 border-border"
                              }`}
                            />
                          </div>
                          <span className={`text-xs leading-relaxed ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {task.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Main node row */}
                  <div className="flex gap-4">
                    {/* Dot */}
                    <div className="relative z-10 flex-shrink-0 mt-1">
                      <div
                        className={`w-[38px] h-[38px] rounded-full flex items-center justify-center shadow-lg transition-all duration-500 group-hover:scale-110 ${getDotColor(node)} ${hasSubTasks ? "cursor-pointer" : ""}`}
                        onClick={hasSubTasks ? () => toggleExpand(node.uid) : undefined}
                      >
                        {getDotIcon(node)}
                      </div>
                    </div>

                    {/* Content card */}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`bg-card border border-border rounded-xl px-4 py-3 transition-all duration-300 group-hover:translate-x-1 ${hasSubTasks ? "cursor-pointer hover:border-violet-500/50 hover:shadow-md" : ""}`}
                        onClick={hasSubTasks ? () => toggleExpand(node.uid) : undefined}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{node.time}</span>
                          <div className="flex items-center gap-2">
                            {hasSubTasks && (
                              <span className="text-xs text-violet-400">{isExpanded ? "▼" : "▶"} {node.tasks.length} task</span>
                            )}
                            <span className="text-xs font-medium">{getStatusLabel(node)}</span>
                          </div>
                        </div>

                        {node.preview && <p className="text-sm text-foreground leading-relaxed mb-2 line-clamp-2">{node.preview}</p>}

                        {node.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {node.tags.slice(0, 5).map((tag, ti) => (
                              <span key={ti} className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400">{tag}</span>
                            ))}
                          </div>
                        )}

                        {node.type === "quest" && node.totalTasks > 0 && (
                          <div className="mt-2 mb-1">
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  node.doneTasks === node.totalTasks
                                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                    : node.doneTasks > 0
                                      ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                                      : "bg-gradient-to-r from-red-500 to-orange-400"
                                }`}
                                style={{ width: `${(node.doneTasks / node.totalTasks) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Link to memo detail */}
                      <Link to={`/memos/${node.uid}`} className="text-xs text-violet-400 hover:underline ml-2 mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity">
                        Xem chi tiết →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {hasNextPage && (
          <div className="flex justify-center py-4">
            <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="px-4 py-2 text-sm bg-violet-500/10 text-violet-500 rounded-lg hover:bg-violet-500/20 transition-colors">
              {isFetchingNextPage ? "Đang tải..." : "Tải thêm"}
            </button>
          </div>
        )}

        {filteredNodes.length === 0 && !isLoading && (
          <div className="text-center py-20 text-muted-foreground">
            <SparklesIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Chưa có quest nào</p>
            <p className="text-xs mt-1">Viết memo đầu tiên để bắt đầu cuộc phiêu lưu!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestTimeline;
