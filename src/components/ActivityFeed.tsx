import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { Activity, ActivityType, ActivityAction } from "@/lib/activity";
import { Bell, ShoppingBag, CheckCircle, Calendar, MessageSquare, User, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function ActivityFeed({ familyId, isCompact }: { familyId: string, isCompact?: boolean }) {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (!familyId) return;

    const q = query(
      collection(db, "families", familyId, "activities"),
      orderBy("timestamp", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Activity[];
      setActivities(data);
    }, (error) => {
      console.error("ActivityFeed listener error:", error);
    });

    return () => unsubscribe();
  }, [familyId]);

  const getIcon = (type: ActivityType) => {
    switch (type) {
      case "shopping": return <ShoppingBag className="w-3 h-3 text-emerald-400" />;
      case "task": return <CheckCircle className="w-3 h-3 text-blue-400" />;
      case "calendar": return <Calendar className="w-3 h-3 text-red-400" />;
      case "wall": return <MessageSquare className="w-3 h-3 text-purple-400" />;
      default: return <Bell className="w-3 h-3 text-slate-400" />;
    }
  };

  const getActionText = (activity: Activity) => {
    const { type, action, details } = activity;
    
    if (type === "shopping") {
      if (action === "create") return `a ajouté "${details}" aux courses`;
      if (action === "complete") return `a coché "${details}" aux courses`;
      if (action === "delete") return `a supprimé "${details}" des courses`;
    }
    
    if (type === "task") {
      if (action === "create") return `a créé la tâche "${details}"`;
      if (action === "complete") return `a terminé la tâche "${details}"`;
      if (action === "delete") return `a supprimé la tâche "${details}"`;
    }
    
    if (type === "calendar") {
      if (action === "create") return `a ajouté l'événement "${details}"`;
      if (action === "delete") return `a supprimé l'événement "${details}"`;
    }
    
    if (type === "wall") {
      if (action === "create") return `a posté sur le mur: "${details}"`;
    }

    return `a effectué une action sur ${type}`;
  };

  if (isCompact) {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-sm">Notifications</h3>
        </div>
        <div className="flex-1 space-y-2 overflow-hidden">
          {activities.slice(0, 3).map((activity) => (
            <div key={activity.id} className="flex gap-2 items-start shrink-0">
              <Avatar className="w-6 h-6 border border-white/10 shrink-0">
                <AvatarImage src={activity.userPhoto} />
                <AvatarFallback className="text-[8px] bg-slate-700">
                  {activity.userName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-slate-300 line-clamp-2 leading-tight">
                  <span className="font-bold text-slate-100">{activity.userName}</span> {getActionText(activity)}
                </p>
                <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">
                   {activity.timestamp ? formatDistanceToNow(activity.timestamp.toDate(), { addSuffix: true, locale: fr }) : "à l'instant"}
                </span>
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-[10px] italic">
              Aucune activité récente.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-amber-500/20 rounded-xl">
          <Bell className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Notifications</h2>
          <p className="text-xs text-slate-500">Fil d'actualité de la famille</p>
        </div>
      </div>

      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-all group">
              <div className="relative shrink-0">
                <Avatar className="w-10 h-10 border-2 border-slate-900 shadow-xl">
                  <AvatarImage src={activity.userPhoto} />
                  <AvatarFallback className="bg-slate-700 text-xs font-bold">
                    {activity.userName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 p-1 bg-slate-900 rounded-full border border-white/10 shadow-lg">
                  {getIcon(activity.type)}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm text-slate-300">
                    <span className="font-bold text-white">{activity.userName}</span> {getActionText(activity)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                  <Clock className="w-3 h-3" />
                  {activity.timestamp ? format(activity.timestamp.toDate(), "d MMM à HH:mm", { locale: fr }) : "..."}
                </div>
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bell className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-500 italic">Pas encore d'activité dans la famille.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
