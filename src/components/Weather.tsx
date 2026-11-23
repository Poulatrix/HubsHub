import { useState, useEffect, ReactNode } from "react";
import { Cloud, Sun, CloudRain, Thermometer, CloudLightning, CloudSnow, Wind, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeatherData {
  temp: number;
  condition: string;
  city: string;
  icon: ReactNode;
  forecast: Array<{
    day: string;
    max: number;
    min: number;
    icon: ReactNode;
  }>;
  hourly: Array<{
    time: string;
    temp: number;
    icon: ReactNode;
  }>;
}

const WEATHER_CODES: Record<number, { label: string; icon: ReactNode }> = {
  0: { label: "Ciel dégagé", icon: <Sun className="w-8 h-8 text-yellow-400" /> },
  1: { label: "Principalement dégagé", icon: <Sun className="w-8 h-8 text-yellow-300" /> },
  2: { label: "Partiellement nuageux", icon: <Cloud className="w-8 h-8 text-blue-300" /> },
  3: { label: "Couvert", icon: <Cloud className="w-8 h-8 text-slate-400" /> },
  45: { label: "Brouillard", icon: <Wind className="w-8 h-8 text-slate-300" /> },
  48: { label: "Brouillard givrant", icon: <Wind className="w-8 h-8 text-slate-200" /> },
  51: { label: "Bruine légère", icon: <CloudRain className="w-8 h-8 text-blue-300" /> },
  53: { label: "Bruine modérée", icon: <CloudRain className="w-8 h-8 text-blue-400" /> },
  55: { label: "Bruine dense", icon: <CloudRain className="w-8 h-8 text-blue-500" /> },
  61: { label: "Pluie légère", icon: <CloudRain className="w-8 h-8 text-blue-400" /> },
  63: { label: "Pluie modérée", icon: <CloudRain className="w-8 h-8 text-blue-500" /> },
  65: { label: "Pluie forte", icon: <CloudRain className="w-8 h-8 text-blue-600" /> },
  71: { label: "Neige légère", icon: <CloudSnow className="w-8 h-8 text-white" /> },
  73: { label: "Neige modérée", icon: <CloudSnow className="w-8 h-8 text-white" /> },
  75: { label: "Neige forte", icon: <CloudSnow className="w-8 h-8 text-white" /> },
  80: { label: "Averses de pluie légères", icon: <CloudRain className="w-8 h-8 text-blue-400" /> },
  81: { label: "Averses de pluie modérées", icon: <CloudRain className="w-8 h-8 text-blue-500" /> },
  82: { label: "Averses de pluie violentes", icon: <CloudRain className="w-8 h-8 text-blue-600" /> },
  95: { label: "Orage", icon: <CloudLightning className="w-8 h-8 text-purple-400" /> },
};

const getForecastIcon = (code: number, size = "w-4 h-4"): ReactNode => {
  const info = WEATHER_CODES[code] || { label: "Nuageux", icon: <Cloud className="w-8 h-8 text-slate-400" /> };
  const Icon = (info.icon as any).type;
  return <Icon className={cn(size, (info.icon as any).props.className)} />;
};

export function Weather({ familyLocation, isCompact }: { familyLocation?: string, isCompact?: boolean }) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const city = familyLocation || "Paris";

  useEffect(() => {
    async function fetchWeather() {
      setLoading(true);
      setError(null);
      try {
        // 1. Geocoding
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`);
        const geoData = await geoRes.json();
        
        if (!geoData || geoData.length === 0) {
          throw new Error("Ville non trouvée");
        }

        const { lat, lon, display_name } = geoData[0];
        const cityName = display_name.split(',')[0];

        // 2. Weather
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
        const weatherData = await weatherRes.json();

        const current = weatherData.current;
        const daily = weatherData.daily;
        const hourly = weatherData.hourly;
        const weatherInfo = WEATHER_CODES[current.weather_code] || { label: "Inconnu", icon: <Cloud className="w-8 h-8 text-slate-400" /> };

        const forecast = daily.time.slice(0, 4).map((time: string, i: number) => ({
          day: new Date(time).toLocaleDateString('fr-FR', { weekday: 'short' }),
          max: Math.round(daily.temperature_2m_max[i]),
          min: Math.round(daily.temperature_2m_min[i]),
          icon: getForecastIcon(daily.weather_code[i])
        }));

        // Hourly forecast for next matching intervals (every 2 hours)
        const now = new Date();
        const hourlyForecast = [];
        for (let i = 0; i < 24; i += 2) {
          const timeStr = hourly.time[i];
          const timeDate = new Date(timeStr);
          if (timeDate > now) {
            hourlyForecast.push({
              time: timeDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              temp: Math.round(hourly.temperature_2m[i]),
              icon: getForecastIcon(hourly.weather_code[i], "w-6 h-6")
            });
          }
          if (hourlyForecast.length >= 8) break;
        }

        setData({
          temp: Math.round(current.temperature_2m),
          condition: weatherInfo.label,
          city: cityName,
          icon: weatherInfo.icon,
          forecast,
          hourly: hourlyForecast
        });
      } catch (err: any) {
        console.error("Weather error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchWeather();
  }, [city]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-pulse flex flex-col gap-2 items-center">
          <div className="w-12 h-12 bg-white/10 rounded-full" />
          <div className="w-8 h-3 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-center h-full">
        <CloudRain className="w-6 h-6 text-slate-500 mb-2" />
        <p className="text-[10px] text-slate-500">{error || "Erreur"}</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col h-full w-full p-6 transition-all relative overflow-hidden",
      isCompact && "justify-center items-center p-4"
    )}>
      {/* Decorative large low-opacity icon background */}
      {!isCompact && (
        <div className="absolute top-4 right-4 opacity-10 blur-sm pointer-events-none">
          {data.icon}
        </div>
      )}

      <div className={cn(
        "flex flex-col z-10",
        isCompact && "items-center text-center"
      )}>
        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-1 drop-shadow-sm">
          MÉTÉO LOCALE
        </span>
        <div className={cn(
          "flex items-baseline gap-3",
          isCompact && "flex-col items-center gap-0"
        )}>
          <span className={cn(
            "text-6xl font-black tracking-tighter text-white text-glow leading-none",
            isCompact && "text-5xl"
          )}>{data.temp}°</span>
          {!isCompact && (
            <span className="text-sm text-white/40 font-medium lowercase tracking-normal">
              {data.condition}
            </span>
          )}
        </div>
      </div>

      {!isCompact && (
        <div className="mt-8 space-y-8">
          {/* Hourly Forecast */}
          <div className="space-y-4">
            <h3 className="text-xs uppercase font-black tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Thermometer className="w-3 h-3" />
              Prévisions prochaines heures
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {data.hourly.map((h, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 min-w-[100px] shrink-0 hover:border-white/10 transition-colors">
                  <span className="text-[10px] font-bold text-slate-500">{h.time}</span>
                  {h.icon}
                  <span className="text-sm font-black text-white">{h.temp}°</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Forecast */}
          <div className="space-y-4">
            <h3 className="text-xs uppercase font-black tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Sun className="w-3 h-3" />
              Prévisions 4 jours
            </h3>
            <div className="grid grid-cols-4 gap-4">
              {data.forecast.map((f, i) => (
                <div key={i} className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <span className="text-[10px] uppercase font-black text-slate-500">{f.day}</span>
                  <div className="scale-125 my-1">{f.icon}</div>
                  <div className="flex flex-col items-center -space-y-1">
                    <span className="text-sm font-black text-white">{f.max}°</span>
                    <span className="text-[10px] font-bold text-slate-500">{f.min}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
