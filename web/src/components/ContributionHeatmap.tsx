import { useMemo } from "react";
import dayjs from "dayjs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface ContributionHeatmapProps {
  memos: Memo[];
  weeks?: number;
}

const LEVELS = [
  { min: 0, color: "bg-gray-100 dark:bg-gray-800" },
  { min: 1, color: "bg-emerald-200 dark:bg-emerald-900" },
  { min: 3, color: "bg-emerald-400 dark:bg-emerald-700" },
  { min: 5, color: "bg-emerald-500 dark:bg-emerald-600" },
  { min: 10, color: "bg-emerald-700 dark:bg-emerald-400" },
];

const DAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS_VI = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];

function getLevel(count: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (count >= LEVELS[i].min) return LEVELS[i].color;
  }
  return LEVELS[0].color;
}

export const ContributionHeatmap = ({ memos, weeks = 20 }: ContributionHeatmapProps) => {
  const { grid, monthLabels, totalCount, maxStreak, currentStreak } = useMemo(() => {
    // Count memos per day
    const dayCounts: Record<string, number> = {};
    for (const memo of memos) {
      const day = dayjs(memo.createTime?.toDate?.() ?? memo.createTime).format("YYYY-MM-DD");
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    // Build grid (columns = weeks, rows = 7 days)
    const today = dayjs();
    const startDate = today.subtract(weeks * 7 - 1, "day");
    const grid: { date: string; count: number; dayOfWeek: number }[][] = [];
    const monthLabels: { label: string; col: number }[] = [];

    let lastMonth = -1;
    let currentCol: typeof grid[0] = [];

    for (let i = 0; i < weeks * 7; i++) {
      const date = startDate.add(i, "day");
      const dateStr = date.format("YYYY-MM-DD");
      const dayOfWeek = date.day(); // 0=Sun

      if (dayOfWeek === 0 && currentCol.length > 0) {
        grid.push(currentCol);
        currentCol = [];
      }

      // Month label
      const month = date.month();
      if (month !== lastMonth) {
        monthLabels.push({ label: MONTHS_VI[month], col: grid.length });
        lastMonth = month;
      }

      currentCol.push({
        date: dateStr,
        count: dayCounts[dateStr] || 0,
        dayOfWeek,
      });
    }
    if (currentCol.length > 0) grid.push(currentCol);

    // Calculate streaks
    let maxStreak = 0;
    let currentStreak = 0;
    let tempStreak = 0;
    for (let i = weeks * 7 - 1; i >= 0; i--) {
      const date = startDate.add(i, "day").format("YYYY-MM-DD");
      if (dayCounts[date] && dayCounts[date] > 0) {
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
        if (i >= weeks * 7 - 7) currentStreak = tempStreak; // last week
      } else {
        if (i >= weeks * 7 - 7 && currentStreak === 0) currentStreak = 0;
        tempStreak = 0;
      }
    }

    const totalCount = Object.values(dayCounts).reduce((a, b) => a + b, 0);

    return { grid, monthLabels, totalCount, maxStreak, currentStreak };
  }, [memos, weeks]);

  return (
    <div className="w-full">
      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span>{totalCount} ghi chú trong {weeks} tuần</span>
        <span>🔥 Streak: {currentStreak} ngày</span>
        <span>⭐ Max: {maxStreak} ngày</span>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-0.5">
          {/* Month labels */}
          <div className="flex gap-0.5 ml-7 mb-1">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[10px] text-muted-foreground"
                style={{ position: "relative", left: m.col * 14 }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Grid */}
          {[0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => (
            <div key={dayOfWeek} className="flex items-center gap-0.5">
              <span className="w-6 text-[10px] text-muted-foreground text-right pr-1">
                {dayOfWeek % 2 === 1 ? DAYS_VI[dayOfWeek] : ""}
              </span>
              {grid.map((week, weekIdx) => {
                const cell = week.find((d) => d.dayOfWeek === dayOfWeek);
                if (!cell) return <div key={weekIdx} className="w-3 h-3" />;
                return (
                  <TooltipProvider key={weekIdx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`w-3 h-3 rounded-sm ${getLevel(cell.count)} transition-colors hover:ring-1 hover:ring-foreground/30`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {cell.date}: {cell.count} ghi chú
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
        <span>Ít</span>
        {LEVELS.map((level, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${level.color}`} />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  );
};

export default ContributionHeatmap;
