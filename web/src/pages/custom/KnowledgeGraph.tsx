/**
 * KnowledgeGraph.tsx — Tag-centric knowledge graph
 *
 * Uses useMemos hook (React Query, already authenticated) instead of fetch().
 * Shows TAG nodes (large) connected to MEMO nodes (small).
 * Memos sharing tags are indirectly connected via tag nodes.
 */

import ReactECharts from "echarts-for-react";
import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useMemos } from "@/hooks/useMemoQueries";

const COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
  "#06b6d4","#a855f7","#e11d48","#22c55e","#eab308",
  "#0ea5e9","#d946ef","#64748b","#78716c","#dc2626",
];

const KnowledgeGraph = () => {
  const { data, isLoading, refetch } = useMemos({ pageSize: 1000 });
  const [showMemoNodes, setShowMemoNodes] = useState(false);

  const memos = data?.memos ?? [];

  const { nodes, links, categories, stats } = useMemo(() => {
    if (!memos.length) return { nodes: [], links: [], categories: [], stats: { tags: 0, memos: 0, links: 0 } };

    // Build tag → memo mapping
    const tagMemos: Record<string, string[]> = {};
    const memoTagsList: Record<string, string[]> = {};

    memos.forEach((memo) => {
      const tags = (memo.tags ?? []);
      memoTagsList[memo.name] = tags;
      tags.forEach((tag) => {
        if (!tagMemos[tag]) tagMemos[tag] = [];
        tagMemos[tag].push(memo.name);
      });
    });

    // Sort tags by frequency
    const sortedTags = Object.entries(tagMemos)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 30);  // Top 30 tags

    const tagIndex = Object.fromEntries(sortedTags.map(([tag], i) => [tag, i]));
    const categories = [
      ...sortedTags.map(([tag], i) => ({ name: `#${tag}`, itemStyle: { color: COLORS[i % COLORS.length] } })),
      { name: "Memo", itemStyle: { color: "oklch(0.55 0.02 230)" } },
    ];

    const nodes: any[] = [];
    const links: any[] = [];
    const linkSet = new Set<string>();

    // Tag nodes (large)
    sortedTags.forEach(([tag, memoList], i) => {
      nodes.push({
        id: `tag:${tag}`,
        name: `#${tag}`,
        value: `${memoList.length} ghi chú`,
        symbolSize: Math.min(20 + memoList.length * 3, 60),
        category: i,
        label: { show: true, fontSize: 11, fontWeight: "bold" },
        itemStyle: { color: COLORS[i % COLORS.length] },
      });
    });

    // Memo nodes (small) — optional
    if (showMemoNodes) {
      memos.forEach((memo) => {
        const tags = memoTagsList[memo.name] ?? [];
        const primaryTag = tags.find((t) => tagIndex[t] !== undefined);
        const catIdx = primaryTag !== undefined ? tagIndex[primaryTag] : sortedTags.length;
        const preview = memo.content.replace(/#\S+/g, "").trim().substring(0, 40);
        nodes.push({
          id: memo.name,
          name: preview || "(trống)",
          value: preview,
          symbolSize: 6,
          category: catIdx,
          label: { show: false },
          itemStyle: { color: primaryTag ? COLORS[tagIndex[primaryTag] % COLORS.length] : "oklch(0.55 0.02 230)", opacity: 0.6 },
        });
        // Link memo to its tags
        tags.forEach((tag) => {
          if (tagIndex[tag] !== undefined) {
            const key = `${tag}|${memo.name}`;
            if (!linkSet.has(key)) {
              linkSet.add(key);
              links.push({ source: `tag:${tag}`, target: memo.name });
            }
          }
        });
      });
    }

    // Tag-to-tag links (tags that co-appear in same memo)
    memos.forEach((memo) => {
      const tags = (memoTagsList[memo.name] ?? []).filter((t) => tagIndex[t] !== undefined);
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const key = [tags[i], tags[j]].sort().join("|");
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({ source: `tag:${tags[i]}`, target: `tag:${tags[j]}` });
          }
        }
      }
    });

    return { nodes, links, categories, stats: { tags: sortedTags.length, memos: memos.length, links: links.length } };
  }, [memos, showMemoNodes]);

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        if (params.dataType === "node") {
          return `<div style="max-width:200px;word-wrap:break-word;font-size:12px">
            <b>${params.data.name}</b><br/>${params.data.value}
          </div>`;
        }
        return "";
      },
    },
    legend: {
      data: categories.map((c) => c.name),
      orient: "vertical",
      right: 8,
      top: 8,
      textStyle: { color: "oklch(0.72 0.01 240)", fontSize: 10 },
      type: "scroll",
      pageTextStyle: { color: "oklch(0.72 0.01 240)" },
      icon: "circle",
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [{
      type: "graph",
      layout: "force",
      data: nodes,
      links: links,
      categories: categories,
      roam: true,
      draggable: true,
      label: {
        show: false,
        fontSize: 10,
        color: "oklch(0.88 0.005 240)",
      },
      emphasis: {
        focus: "adjacency",
        label: { show: true, fontSize: 12, fontWeight: "bold" },
        lineStyle: { width: 2 },
      },
      lineStyle: {
        color: "source",
        curveness: 0.1,
        opacity: 0.3,
        width: 1,
      },
      force: {
        repulsion: 200,
        gravity: 0.1,
        edgeLength: [50, 150],
        friction: 0.65,
        layoutAnimation: true,
      },
      animationDuration: 1500,
      animationEasingUpdate: "quinticOut",
    }],
  }), [nodes, links, categories]);

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderIcon className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-muted-foreground text-sm">Đang tải Bản đồ Tri thức...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-bold flex items-center gap-2">🧠 Bản đồ Tri thức</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {stats.memos} ghi chú · {stats.tags} nhóm thẻ · {stats.links} kết nối
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showMemoNodes}
              onChange={(e) => setShowMemoNodes(e.target.checked)}
              className="rounded"
            />
            Hiển thị từng memo
          </label>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
            Tải lại
          </button>
        </div>
      </div>

      {/* Graph or empty state */}
      <div className="flex-1 mx-4 mb-4 bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <span className="text-4xl">🏷️</span>
            <p className="font-medium text-sm">Chưa có ghi chú nào có tag</p>
            <p className="text-xs opacity-70 text-center max-w-xs">
              Thêm tag vào ghi chú (ví dụ <code>#task</code>, <code>#income</code>) để bản đồ hiện ra các kết nối
            </p>
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ width: "100%", height: "100%" }}
            opts={{ renderer: "canvas" }}
          />
        )}
      </div>
    </div>
  );
};

export default KnowledgeGraph;
