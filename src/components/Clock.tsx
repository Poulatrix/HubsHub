import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function Clock() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(new Date());
  const [fontSize, setFontSize] = useState(48);
  const [dateFontSize, setDateFontSize] = useState(14);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Calculate font size relative to container dimensions
        // We want it to fit both width and height
        const hourSize = Math.min(width * 0.28, height * 0.5);
        const daySize = Math.max(hourSize * 0.2, 10);
        
        setFontSize(hourSize);
        setDateFontSize(daySize);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      clearInterval(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center p-4 overflow-hidden bg-transparent">
      {/* Digital Info */}
      <div className="flex flex-col items-center text-center w-full">
        <div 
          className="font-black tracking-tighter tabular-nums leading-none text-white drop-shadow-2xl"
          style={{ fontSize: `${fontSize}px` }}
        >
          {format(time, "HH:mm")}
        </div>
        <div 
          className="text-slate-400 capitalize mt-2 font-bold tracking-[0.2em] uppercase opacity-80 truncate w-full"
          style={{ fontSize: `${dateFontSize}px` }}
        >
          {format(time, "EEEE d MMMM", { locale: fr })}
        </div>
      </div>
    </div>
  );
}
