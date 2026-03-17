import { useState, useEffect } from "react";

interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
}

/**
 * Hook to fetch current weather and generate a stamp string.
 * Returns a function that creates a weather stamp for appending to memos.
 */
export function useWeatherStamp() {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=21.0285&longitude=105.8542&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia/Ho_Chi_Minh"
        );
        const data = await res.json();
        const current = data.current;
        const code = current.weather_code;

        let desc = "Quang đãng";
        if (code >= 71) desc = "Tuyết";
        else if (code >= 61) desc = "Mưa";
        else if (code >= 51) desc = "Mưa phùn";
        else if (code >= 45) desc = "Sương mù";
        else if (code >= 3) desc = "Nhiều mây";
        else if (code >= 1) desc = "Ít mây";

        setWeather({
          temp: Math.round(current.temperature_2m),
          humidity: current.relative_humidity_2m,
          description: desc,
        });
      } catch {
        // Silently fail — weather stamp is optional
      }
    };

    fetchWeather();
    // Refresh every 10 minutes
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, []);

  const getStamp = () => {
    if (!weather) return "";
    return `\n☁️ ${weather.temp}°C, ${weather.description}, 💧${weather.humidity}%`;
  };

  return { weather, getStamp };
}
