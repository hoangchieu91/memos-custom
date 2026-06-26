import dayjs from "dayjs";
import {
  CheckCircle,
  Circle,
  CloudIcon,
  CloudRainIcon,
  SunIcon,
  LayoutDashboardIcon,
  BookmarkIcon,
  BanknoteIcon,
  WalletIcon,
  PackageIcon,
  WorkflowIcon,
  ClockIcon,
  CalendarIcon,
  ClipboardPasteIcon,
  ExternalLinkIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemos, useUpdateMemo } from "@/hooks/useMemoQueries";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { toggleTaskAtIndex } from "@/utils/markdown-manipulation";

interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
  icon: string;
}

const WEATHER_CACHE_KEY = "personal_os_weather";
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const fetchWeather = async (): Promise<WeatherData | null> => {
  // Check cache first
  try {
    const cached = localStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < WEATHER_CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  try {
    // Open-Meteo free API — no API key needed, Hà Nội coordinates
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=21.0285&longitude=105.8542&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia/Ho_Chi_Minh"
    );
    if (!res.ok) return null;
    const json = await res.json();
    const current = json.current;
    const code = current.weather_code;

    // WMO Weather interpretation codes → description
    let description = "Quang đãng";
    let icon = "sun";
    if (code === 0) { description = "Trời quang"; icon = "sun"; }
    else if (code <= 3) { description = "Ít mây"; icon = "cloud"; }
    else if (code <= 48) { description = "Có mây / Sương mù"; icon = "cloud"; }
    else if (code <= 67) { description = "Mưa phùn"; icon = "rain"; }
    else if (code <= 77) { description = "Mưa tuyết"; icon = "rain"; }
    else if (code <= 82) { description = "Mưa rào"; icon = "rain"; }
    else if (code <= 86) { description = "Mưa tuyết nặng"; icon = "rain"; }
    else if (code <= 99) { description = "Giông bão"; icon = "rain"; }

    const data: WeatherData = {
      temp: Math.round(current.temperature_2m),
      humidity: current.relative_humidity_2m,
      description,
      icon,
    };

    // Cache result
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  } catch {
    return null;
  }
};

export const PersonalDashboard = () => {
  const user = useCurrentUser();
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const { mutateAsync: updateMemo } = useUpdateMemo();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchWeather().then(setWeather);
  }, []);

  const greeting = useMemo(() => {
    const hour = time.getHours();
    if (hour < 12) return "Chào buổi sáng";
    if (hour < 18) return "Chào buổi chiều";
    return "Chào buổi tối";
  }, [time]);

  // Use displayName, fallback to username extracted from name
  const displayName = useMemo(() => {
    if (user?.displayName) return user.displayName;
    // user.name is like "users/1", extract username
    if (user?.name) {
      const username = user.name.split("/")[1];
      if (username && username !== "1") return username;
    }
    return "Anh Chiều"; // Hardcoded fallback for this user
  }, [user]);

  const { data: memosResponse } = useMemos({});
  const memoList = useMemo(() => memosResponse?.memos || [], [memosResponse]);

  // Detect tasks from:
  // 1. Memos containing markdown checkboxes `- [ ]`
  // 2. Memos tagged #task or #doing (that aren't marked #done)
  const pendingTodos = useMemo(() => {
    return memoList.filter((memo: Memo) => {
      const content = memo.content;
      const hasCheckbox = content.includes("- [ ]");
      const hasTaskTag = /#task\b/.test(content) || /#doing\b/.test(content);
      const isDone = /#done\b/.test(content);
      return (hasCheckbox || hasTaskTag) && !isDone;
    }).slice(0, 8);
  }, [memoList]);

  // Interactive check-off handler
  const handleToggleTodo = async (memo: Memo) => {
    let newContent = memo.content;
    const hasCheckbox = newContent.includes("- [ ]");
    if (hasCheckbox) {
      newContent = toggleTaskAtIndex(newContent, 0, true);
    } else {
      if (/#task\b/.test(newContent)) {
        newContent = newContent.replace(/#task\b/g, "#done");
      } else if (/#doing\b/.test(newContent)) {
        newContent = newContent.replace(/#doing\b/g, "#done");
      } else {
        newContent = `${newContent}\n#done`;
      }
    }

    await updateMemo({
      update: {
        name: memo.name,
        content: newContent,
      },
      updateMask: ["content"],
    });
  };

  const WeatherIcon = weather?.icon === "rain" ? CloudRainIcon : weather?.icon === "cloud" ? CloudIcon : SunIcon;

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6 mt-4 relative z-10 bg-background" style={{ clear: "both" }}>
      
      {/* Column 1: Clock & Weather */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col justify-between min-h-[180px]">
        <div className="absolute top-0 right-0 -mr-6 -mt-6 w-28 h-28 rounded-full bg-white opacity-10"></div>
        <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-20 h-20 rounded-full bg-white opacity-10"></div>

        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
              System Dashboard
            </span>
            <h1 className="text-2xl font-bold mt-2 truncate">{greeting}, {displayName}</h1>
          </div>
          <div className="flex flex-col items-end">
            <WeatherIcon className="w-6 h-6 opacity-90 mb-0.5" />
            <span className="font-bold text-base">{weather ? `${weather.temp}°C` : "—"}</span>
            {weather && (
              <span className="text-[10px] opacity-75">{weather.description}</span>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 opacity-75" />
            <span className="text-4xl font-black font-mono tracking-tight leading-none">
              {dayjs(time).format("HH:mm:ss")}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] opacity-85">
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{dayjs(time).format("DD/MM/YYYY")}</span>
          </div>
        </div>
      </div>

      {/* Column 2: Personal OS Hub Launcher */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col">
        <h3 className="font-bold text-xs tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
          <LayoutDashboardIcon className="w-3.5 h-3.5 text-indigo-500" />
          Personal OS Hub
        </h3>
        
        <div className="grid grid-cols-2 gap-2 flex-1">
          <Link
            to="/board"
            className="flex flex-col p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-indigo-50/50 hover:border-indigo-200 dark:hover:bg-indigo-950/20 dark:hover:border-indigo-900 transition-all duration-200 group"
          >
            <LayoutDashboardIcon className="w-5 h-5 text-indigo-500 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-foreground">Bảng Tasks</span>
            <span className="text-[10px] text-muted-foreground truncate">Quản lý Kanban</span>
          </Link>

          <Link
            to="/bookmarks"
            className="flex flex-col p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-amber-50/50 hover:border-amber-200 dark:hover:bg-amber-950/20 dark:hover:border-amber-900 transition-all duration-200 group"
          >
            <BookmarkIcon className="w-5 h-5 text-amber-500 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-foreground">Dấu trang</span>
            <span className="text-[10px] text-muted-foreground truncate">Links quan trọng</span>
          </Link>

          <Link
            to="/cashflow"
            className="flex flex-col p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-emerald-50/50 hover:border-emerald-200 dark:hover:bg-emerald-950/20 dark:hover:border-emerald-900 transition-all duration-200 group"
          >
            <BanknoteIcon className="w-5 h-5 text-emerald-500 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-foreground">Thu Chi</span>
            <span className="text-[10px] text-muted-foreground truncate">Sổ thu chi</span>
          </Link>

          <Link
            to="/debt"
            className="flex flex-col p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-rose-50/50 hover:border-rose-200 dark:hover:bg-rose-950/20 dark:hover:border-rose-900 transition-all duration-200 group"
          >
            <WalletIcon className="w-5 h-5 text-rose-500 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-foreground">Công nợ</span>
            <span className="text-[10px] text-muted-foreground truncate">Ghi nợ chi tiết</span>
          </Link>

          <Link
            to="/inventory"
            className="flex flex-col p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-teal-50/50 hover:border-teal-200 dark:hover:bg-teal-950/20 dark:hover:border-teal-900 transition-all duration-200 group"
          >
            <PackageIcon className="w-5 h-5 text-teal-500 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-foreground">Tài sản</span>
            <span className="text-[10px] text-muted-foreground truncate">Kho thiết bị</span>
          </Link>

          <Link
            to="/n8n"
            className="flex flex-col p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-purple-50/50 hover:border-purple-200 dark:hover:bg-purple-950/20 dark:hover:border-purple-900 transition-all duration-200 group"
          >
            <WorkflowIcon className="w-5 h-5 text-purple-500 mb-1 group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-foreground">Tự động hóa</span>
              <ExternalLinkIcon className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-[10px] text-muted-foreground truncate">Quy trình n8n</span>
          </Link>
        </div>
      </div>

      {/* Column 3: Interactive To-Do List */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col min-h-[180px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Nhiệm vụ hàng ngày
          </h3>
          <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
            {pendingTodos.length} Tasks
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 max-h-[145px]">
          {pendingTodos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-muted-foreground/60 italic text-center py-4">
              <span>Đã hoàn thành tất cả công việc! 🎉</span>
              <span className="text-[10px] mt-1 block">Tạo note chứa `- [ ]` hoặc tag `#task` để thêm.</span>
            </div>
          ) : (
            pendingTodos.map((memo: Memo) => {
              const taskLine = memo.content.split('\n').find((line: string) => line.includes('- [ ]'))?.replace('- [ ]', '').trim()
                || memo.content.split('\n').find((line: string) => !line.startsWith('#') || line.startsWith('# '))?.trim()
                || "Công việc...";
              
              return (
                <div key={memo.name} className="flex items-start gap-2.5 group">
                  <button
                    onClick={() => handleToggleTodo(memo)}
                    className="mt-0.5 text-muted-foreground/50 hover:text-emerald-500 transition-colors shrink-0"
                    title="Đánh dấu hoàn thành"
                  >
                    <Circle className="w-4 h-4 cursor-pointer" />
                  </button>
                  <Link to={`/${memo.name}`} className="text-xs text-foreground/80 leading-normal line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex-1">
                    {taskLine.substring(0, 100)}{taskLine.length > 100 ? '...' : ''}
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};

export default PersonalDashboard;
