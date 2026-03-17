import ReactECharts from "echarts-for-react";
import { LoaderIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// Types for graph data
interface GraphNode {
  name: string;
  symbolSize: number;
  category: number;
  value: string;
  label?: { show: boolean };
}

interface GraphLink {
  source: string;
  target: string;
}

interface MemoApiItem {
  name: string;
  content: string;
  displayTime: string;
}

const MEMOS_HOST = "";

const KnowledgeGraph = () => {
  const [memos, setMemos] = useState<MemoApiItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch ALL memos from API
  useEffect(() => {
    const fetchAllMemos = async () => {
      setLoading(true);
      try {
        let allMemos: MemoApiItem[] = [];
        let pageToken = "";
        let hasMore = true;

        while (hasMore) {
          const url = `${MEMOS_HOST}/api/v1/memos?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`;
          const res = await fetch(url, { credentials: "include" });
          const data = await res.json();

          if (data.memos && data.memos.length > 0) {
            allMemos = [...allMemos, ...data.memos];
          }

          if (data.nextPageToken) {
            pageToken = data.nextPageToken;
          } else {
            hasMore = false;
          }
        }

        setMemos(allMemos);
      } catch (e) {
        console.error("Failed to fetch memos for graph:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAllMemos();
  }, []);

  // Build graph data from memos
  const { nodes, links, categories } = useMemo(() => {
    const tagMap: Record<string, string[]> = {}; // tag -> list of memo names
    const memoTags: Record<string, string[]> = {}; // memoName -> list of tags

    // Extract tags from each memo
    memos.forEach((memo) => {
      const tags = memo.content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g) || [];
      const uniqueTags = [...new Set(tags)];
      const memoId = memo.name;
      memoTags[memoId] = uniqueTags;

      uniqueTags.forEach((tag) => {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(memoId);
      });
    });

    // Build categories from unique tags
    const allTags = Object.keys(tagMap).sort((a, b) => tagMap[b].length - tagMap[a].length);
    const topTags = allTags.slice(0, 20); // Top 20 tags as categories
    const categoryList = topTags.map((tag) => ({ name: tag }));
    categoryList.push({ name: "Khác" }); // "Other" category

    // Build nodes (each memo is a node)
    const graphNodes: GraphNode[] = memos.map((memo) => {
      const tags = memoTags[memo.name] || [];
      const primaryTag = tags.find((t) => topTags.includes(t));
      const categoryIndex = primaryTag ? topTags.indexOf(primaryTag) : topTags.length;

      // Preview text
      const preview = memo.content
        .replace(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g, "")
        .trim()
        .substring(0, 50);

      return {
        name: memo.name,
        symbolSize: Math.min(8 + tags.length * 4, 30),
        category: categoryIndex,
        value: preview || "(trống)",
        label: { show: tags.length >= 3 }, // Only show label for well-tagged memos
      };
    });

    // Build links (memos sharing the same tag are connected)
    const graphLinks: GraphLink[] = [];
    const linkSet = new Set<string>();

    Object.values(tagMap).forEach((memoNames) => {
      // Only connect memos within the same tag if not too many (avoid clutter)
      const subset = memoNames.slice(0, 30);
      for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          const key = `${subset[i]}|${subset[j]}`;
          if (!linkSet.has(key)) {
            linkSet.add(key);
            graphLinks.push({ source: subset[i], target: subset[j] });
          }
        }
      }
    });

    return { nodes: graphNodes, links: graphLinks, categories: categoryList };
  }, [memos]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          if (params.dataType === "node") {
            return `<div style="max-width:200px;word-wrap:break-word;">${params.data.value}</div>`;
          }
          return "";
        },
      },
      legend: {
        data: categories.map((c) => c.name),
        orient: "vertical",
        right: 8,
        top: 20,
        textStyle: { color: "#aaa", fontSize: 11 },
        type: "scroll",
        pageTextStyle: { color: "#aaa" },
      },
      series: [
        {
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
            color: "#ddd",
          },
          emphasis: {
            focus: "adjacency",
            label: { show: true, fontSize: 13, fontWeight: "bold" },
            lineStyle: { width: 3 },
          },
          lineStyle: {
            color: "source",
            curveness: 0.15,
            opacity: 0.25,
            width: 1,
          },
          force: {
            repulsion: 120,
            gravity: 0.08,
            edgeLength: [60, 200],
            friction: 0.6,
          },
          animationDuration: 1500,
          animationEasingUpdate: "quinticOut",
        },
      ],
    }),
    [nodes, links, categories],
  );

  if (loading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderIcon className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-muted-foreground">Đang tải dữ liệu Bản đồ Tri thức...</span>
          <span className="text-xs text-muted-foreground/60">({memos.length} ghi chú đã tải)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🧠 Bản đồ Tri thức
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {memos.length} ghi chú · {categories.length} nhóm thẻ ·{" "}
            {links.length} kết nối
          </p>
        </div>
      </div>

      {/* Graph */}
      <div className="w-full h-[calc(100vh-120px)] bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        <ReactECharts
          option={option}
          style={{ width: "100%", height: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </div>
  );
};

export default KnowledgeGraph;
