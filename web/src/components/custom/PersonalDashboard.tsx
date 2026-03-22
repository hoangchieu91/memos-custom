import dayjs from "dayjs";
import { CheckCircle, Circle, CloudIcon, CloudRainIcon, SunIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemos } from "@/hooks/useMemoQueries";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

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

  const WeatherIcon = weather?.icon === "rain" ? CloudRainIcon : weather?.icon === "cloud" ? CloudIcon : SunIcon;

  return (
    <div className="w-full flex flex-col md:flex-row gap-4 mb-6 mt-4 relative z-10 bg-background" style={{ clear: "both" }}>

      {/* Clock and Weather Panel */}
      <div className="flex-1 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10"></div>
        <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-white opacity-10"></div>

        <div>
          <h2 className="text-xl font-medium opacity-90">{greeting},</h2>
          <h1 className="text-3xl font-bold mt-1 truncate">{displayName}</h1>
        </div>

        <div className="mt-6 flex items-end justify-between">
          <div>
            <div className="text-5xl font-black mb-1 font-mono tracking-tight">
              {dayjs(time).format("HH:mm")}
            </div>
            <div className="text-sm opacity-80 font-medium">
              {dayjs(time).format("dddd, DD MMMM YYYY")}
            </div>
          </div>

          {/* Live Weather */}
          <div className="flex flex-col items-center">
            <WeatherIcon className="w-8 h-8 opacity-90 mb-1" />
            <span className="font-bold text-lg">{weather ? `${weather.temp}°C` : "—"}</span>
            {weather && (
              <>
                <span className="text-xs opacity-70">{weather.description}</span>
                <span className="text-xs opacity-60">💧 {weather.humidity}%</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* To-Do Widget — single info panel now */}
      <div className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm tracking-wide text-foreground flex items-center gap-1.5 uppercase">
             <CheckCircle className="w-4 h-4 text-emerald-500" />
             Việc cần làm
          </h3>
          <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
             {pendingTodos.length} Tasks
          </span>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
          {pendingTodos.length === 0 ? (
             <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic opacity-70">
               Không có công việc nào đang rảnh rang! 🎉
               <br />
               <span className="text-xs mt-1 block text-center">Viết note chứa <code className="bg-muted px-1 rounded">- [ ]</code> hoặc tag <code className="bg-muted px-1 rounded">#task</code> / <code className="bg-muted px-1 rounded">#doing</code></span>
             </div>
          ) : (
             pendingTodos.map((memo: Memo) => {
               // Extract task line: prefer `- [ ] ...` line, fallback to first line
               const taskLine = memo.content.split('\n').find((line: string) => line.includes('- [ ]'))?.replace('- [ ]', '').trim()
                 || memo.content.split('\n').find((line: string) => !line.startsWith('#') || line.startsWith('# '))?.trim()
                 || "Công việc...";
               return (
                 <div key={memo.name} className="flex items-start gap-2 group">
                    <Circle className="w-4 h-4 text-border mt-0.5 cursor-pointer hover:text-emerald-500 transition-colors shrink-0" />
                    <Link to={`/${memo.name}`} className="text-sm text-foreground/80 line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {taskLine.substring(0, 60)}{taskLine.length > 60 ? '...' : ''}
                    </Link>
                 </div>
               )
             })
          )}
        </div>
      </div>

    </div>
  );
};

export default PersonalDashboard;
