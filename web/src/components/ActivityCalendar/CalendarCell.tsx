import { memo, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getLunarLabel, getLunarTooltip, getLunarHoliday } from "@/lib/lunar-calendar";
import type { LunarHoliday } from "@/lib/lunar-calendar";
import { DEFAULT_CELL_SIZE, SMALL_CELL_SIZE } from "./constants";
import type { CalendarDayCell, CalendarSize } from "./types";
import { getCellIntensityClass } from "./utils";

export interface CalendarCellProps {
  day: CalendarDayCell;
  maxCount: number;
  tooltipText: string;
  onClick?: (date: string) => void;
  size?: CalendarSize;
  disableTooltip?: boolean;
}

export const CalendarCell = memo((props: CalendarCellProps) => {
  const { day, maxCount, tooltipText, onClick, size = "default", disableTooltip = false } = props;

  // Parse date for lunar calculation + holiday detection
  const lunarInfo = useMemo<{
    label: string;
    tooltip: string;
    isFirstDay: boolean;
    holiday: LunarHoliday | null;
  } | null>(() => {
    if (!day.isCurrentMonth) return null;
    const parts = day.date.split("-");
    if (parts.length !== 3) return null;
    const [yy, mm, dd] = parts.map(Number);
    return {
      label: getLunarLabel(dd, mm, yy),
      tooltip: getLunarTooltip(dd, mm, yy),
      isFirstDay: getLunarLabel(dd, mm, yy).includes("/"),
      holiday: getLunarHoliday(dd, mm, yy),
    };
  }, [day.date, day.isCurrentMonth]);

  const handleClick = () => {
    if (onClick) {
      onClick(day.date);
    }
  };

  const sizeConfig = size === "small" ? SMALL_CELL_SIZE : DEFAULT_CELL_SIZE;
  const smallExtraClasses = size === "small" ? `${SMALL_CELL_SIZE.dimensions} min-h-0` : "";

  const baseClasses = cn(
    "aspect-square w-full flex flex-col items-center justify-center text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 select-none border border-border/10 bg-muted/20 relative",
    sizeConfig.font,
    sizeConfig.borderRadius,
    smallExtraClasses,
  );
  const isInteractive = Boolean(onClick);
  const ariaLabel = day.isSelected ? `${tooltipText} (selected)` : tooltipText;

  if (!day.isCurrentMonth) {
    return <div className={cn(baseClasses, "text-muted-foreground/30 bg-transparent border-transparent cursor-default")}>{day.label}</div>;
  }

  const intensityClass = getCellIntensityClass(day, maxCount);
  const holiday = lunarInfo?.holiday;

  const buttonClasses = cn(
    baseClasses,
    intensityClass,
    day.isToday && "ring-2 ring-primary/30 ring-offset-1 font-semibold z-10",
    day.isSelected && "ring-2 ring-primary ring-offset-1 font-bold z-10",
    holiday?.type === "major" && "ring-1 ring-red-500/40 bg-red-500/5",
    isInteractive ? "cursor-pointer hover:bg-muted/40 hover:border-border/30" : "cursor-default",
  );

  // Build tooltip with lunar info
  const fullTooltip = lunarInfo
    ? `${tooltipText ? tooltipText + " · " : ""}${lunarInfo.tooltip}`
    : tooltipText;

  const button = (
    <button
      type="button"
      onClick={handleClick}
      tabIndex={isInteractive ? 0 : -1}
      aria-label={ariaLabel}
      aria-current={day.isToday ? "date" : undefined}
      aria-disabled={!isInteractive}
      className={buttonClasses}
    >
      <span className="leading-none">{day.label}</span>
      {lunarInfo && size !== "small" && (
        <span className={cn(
          "text-[7px] leading-none mt-0.5 opacity-60",
          lunarInfo.isFirstDay && "text-red-500 font-bold opacity-100",
          holiday?.type === "major" && "text-red-500 font-bold opacity-100",
        )}>
          {holiday?.type === "major" ? holiday.emoji : lunarInfo.label}
        </span>
      )}
      {/* Minor holiday dot indicator (Rằm not already styled as first day) */}
      {holiday?.type === "minor" && !lunarInfo?.isFirstDay && size !== "small" && (
        <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-amber-400/80" />
      )}
    </button>
  );

  const shouldShowTooltip = fullTooltip && !disableTooltip;

  if (!shouldShowTooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">
        <p>{fullTooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
});

CalendarCell.displayName = "CalendarCell";
