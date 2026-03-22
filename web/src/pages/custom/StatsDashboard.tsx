import {
  ActivityIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  FlameIcon,
  HashIcon,
  LoaderIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useMemo } from "react";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";

const StatsDashboard = () => {
  const { data, isLoading } = useInfiniteMemos({
    pageSize: 500,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });

  const allMemos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.memos || []);
  }, [data]);

  // Parse dates from memos
  const memoDates = useMemo(() => {
    return allMemos.map((memo) => {
      try {
        if (memo.displayTime) return timestampDate(memo.displayTime);
        if (memo.createTime) return timestampDate(memo.createTime);
        return new Date();
      } catch {
        return new Date();
      }
    });
  }, [allMemos]);

  // Daily counts for the last 30 days
  const dailyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      counts.set(d.toISOString().split("T")[0], 0);
    }
    memoDates.forEach((dt) => {
      const key = dt.toISOString().split("T")[0];
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries());
  }, [memoDates]);

  // Current streak
  const streak = useMemo(() => {
    const dateSet = new Set(memoDates.map((dt) => dt.toISOString().split("T")[0]));
    let count = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (dateSet.has(key)) count++;
      else if (i > 0) break; // Allow today to be missing
    }
    return count;
  }, [memoDates]);

  // Top tags
  const topTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    allMemos.forEach((memo) => {
      const tags = (memo.content || "").match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || [];
      tags.forEach((tag) => tagMap.set(tag, (tagMap.get(tag) || 0) + 1));
    });
    return Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
  }, [allMemos]);

  // Hour distribution
  const hourDist = useMemo(() => {
    const hours = new Array(24).fill(0);
    memoDates.forEach((dt) => hours[dt.getHours()]++);
    return hours;
  }, [memoDates]);

  // Weekly distribution
  const weekDist = useMemo(() => {
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const counts = new Array(7).fill(0);
    memoDates.forEach((dt) => counts[dt.getDay()]++);
    return days.map((name, i) => ({ name, count: counts[i] }));
  }, [memoDates]);

  // This week vs last week
  const weekComparison = useMemo(() => {
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    let thisWeek = 0;
    let lastWeek = 0;
    memoDates.forEach((dt) => {
      if (dt >= thisWeekStart) thisWeek++;
      else if (dt >= lastWeekStart) lastWeek++;
    });
    return { thisWeek, lastWeek, change: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 100 };
  }, [memoDates]);

  // Average memo length
  const avgLength = useMemo(() => {
    if (allMemos.length === 0) return 0;
    const total = allMemos.reduce((sum, m) => sum + (m.content || "").length, 0);
    return Math.round(total / allMemos.length);
  }, [allMemos]);

  const maxDailyCount = Math.max(...dailyCounts.map(([, c]) => c), 1);
  const maxHourCount = Math.max(...hourDist, 1);

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3Icon className="w-6 h-6 text-violet-500" />
          Thống Kê
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Phân tích hoạt động ghi chú của bạn</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl px-4 py-4 text-center">
          <ActivityIcon className="w-5 h-5 mx-auto mb-1 text-violet-500" />
          <div className="text-2xl font-bold text-violet-500">{allMemos.length}</div>
          <div className="text-xs text-muted-foreground">Tổng memo</div>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-4 text-center">
          <FlameIcon className="w-5 h-5 mx-auto mb-1 text-orange-500" />
          <div className="text-2xl font-bold text-orange-500">{streak}</div>
          <div className="text-xs text-muted-foreground">Ngày streak 🔥</div>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-4 text-center">
          <TrendingUpIcon className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
          <div className="text-2xl font-bold text-emerald-500">
            {weekComparison.thisWeek}
            {weekComparison.change !== 0 && (
              <span className={`text-xs ml-1 ${weekComparison.change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {weekComparison.change > 0 ? "+" : ""}{weekComparison.change}%
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">Tuần này</div>
        </div>
        <div className="bg-card border border-border rounded-xl px-4 py-4 text-center">
          <CalendarDaysIcon className="w-5 h-5 mx-auto mb-1 text-sky-500" />
          <div className="text-2xl font-bold text-sky-500">{avgLength}</div>
          <div className="text-xs text-muted-foreground">Ký tự TB/memo</div>
        </div>
      </div>

      {/* 30-day activity bar chart */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <BarChart3Icon className="w-4 h-4 text-violet-500" />
          Hoạt động 30 ngày gần nhất
        </h3>
        <div className="flex items-end gap-[3px] h-[100px]">
          {dailyCounts.map(([date, count], i) => (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div
                className="w-full rounded-t transition-all duration-300 hover:opacity-80"
                style={{
                  height: `${Math.max((count / maxDailyCount) * 100, 3)}%`,
                  background: count > 0
                    ? `linear-gradient(to top, rgba(139,92,246,0.6), rgba(139,92,246,${0.3 + (count / maxDailyCount) * 0.7}))`
                    : "rgba(128,128,128,0.15)",
                }}
              />
              <div className="absolute -top-7 bg-foreground text-background text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {date.slice(5)}: {count}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
          <span>{dailyCounts[0]?.[0]?.slice(5)}</span>
          <span>Hôm nay</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Hour distribution */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">🕐 Phân bố theo giờ</h3>
          <div className="flex items-end gap-[2px] h-[80px]">
            {hourDist.map((count, hour) => (
              <div key={hour} className="flex-1 flex flex-col items-center group relative">
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max((count / maxHourCount) * 100, 2)}%`,
                    background: count > 0
                      ? hour >= 6 && hour <= 18
                        ? "rgba(234,179,8,0.5)"
                        : "rgba(99,102,241,0.5)"
                      : "rgba(128,128,128,0.1)",
                  }}
                />
                <div className="absolute -top-6 bg-foreground text-background text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {hour}h: {count}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>0h</span>
            <span>12h</span>
            <span>23h</span>
          </div>
        </div>

        {/* Weekly distribution */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">📅 Phân bố theo thứ</h3>
          <div className="space-y-2">
            {weekDist.map((d) => {
              const maxWeek = Math.max(...weekDist.map((w) => w.count), 1);
              return (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="text-xs w-6 text-muted-foreground">{d.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all duration-500"
                      style={{ width: `${(d.count / maxWeek) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-6 text-right">{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top tags */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <HashIcon className="w-4 h-4 text-emerald-500" />
          Top Tags ({topTags.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {topTags.map(([tag, count], i) => {
            const maxTag = topTags[0]?.[1] || 1;
            const opacity = 0.3 + (count / maxTag) * 0.7;
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border transition-all hover:scale-105"
                style={{ backgroundColor: `rgba(139,92,246,${opacity * 0.15})` }}
              >
                <span className="text-sm text-violet-400">{tag}</span>
                <span className="text-xs bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StatsDashboard;
