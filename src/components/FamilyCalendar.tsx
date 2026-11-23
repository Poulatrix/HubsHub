import { useState, useEffect, useMemo, useRef } from "react";
import { db, OperationType, handleFirestoreError } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Settings,
  Trash2,
  Clock,
  CheckCircle2,
  Circle,
  Edit2,
  MapPin,
  Maximize2,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  format,
  addDays,
  isSameDay,
  parseISO,
  eachHourOfInterval,
  setHours,
  setMinutes,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

interface CalendarEvent {
  id: string;
  title: string;
  location?: string;
  start: any;
  end: any;
  allDay?: boolean;
  memberUid?: string;
  authorUid?: string;
  color?: string;
  isExternal?: boolean;
  sourceName?: string;
  externalColor?: string;
}

interface PlanningTask {
  id: string;
  title: string;
  description?: string;
  assignedToIds: string[];
  status: "todo" | "in-progress" | "done";
  deadline?: any;
  isUrgent?: boolean;
  createdAt: any;
}

interface FamilyMember {
  id: string;
  uid?: string;
  displayName: string;
  role: string;
}

interface CalendarSource {
  id: string;
  name: string;
  type: "google" | "outlook" | "ical";
  url?: string;
  color: string;
  logoUrl?: string;
}

const HOURS = eachHourOfInterval({
  start: setHours(setMinutes(new Date(), 0), 7),
  end: setHours(setMinutes(new Date(), 0), 22),
});

const EVENT_COLORS = [
  { class: "bg-blue-500", label: "Bleu" },
  { class: "bg-pink-500", label: "Rose" },
  { class: "bg-emerald-500", label: "Émeraude" },
  { class: "bg-amber-500", label: "Ambre" },
  { class: "bg-purple-500", label: "Violet" },
  { class: "bg-rose-500", label: "Corail" },
];

export function FamilyCalendar({
  familyId,
  user,
  isCompact,
  onExpand,
}: {
  familyId: string;
  user: any;
  isCompact?: boolean;
  onExpand?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"list" | "day" | "week">(
    isCompact ? "list" : "list"
  );
  const [filterType, setFilterType] = useState<"all" | "events" | "tasks">("all");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<PlanningTask[]>([]);
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [addKind, setAddKind] = useState<"event" | "task">("event");
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isManagingSources, setIsManagingSources] = useState(false);

  const [eventForm, setEventForm] = useState({
    title: "",
    location: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    memberUid: "",
    color: EVENT_COLORS[0].class,
  });

  const [taskForm, setTaskForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    assigneeUid: "",
    isUrgent: false,
  });

  const [newSource, setNewSource] = useState({
    name: "",
    type: "google" as "google" | "outlook" | "ical",
    url: "",
    color: "#3b82f6",
  });

  // Sync default member selection once members load
  useEffect(() => {
    if (members.length === 0) return;
    const defaultUid =
      user?.uid && user.uid !== "neutral"
        ? user.uid
        : members[0]?.uid || members[0]?.id || "";
    setEventForm((prev) =>
      prev.memberUid ? prev : { ...prev, memberUid: defaultUid }
    );
    setTaskForm((prev) =>
      prev.assigneeUid ? prev : { ...prev, assigneeUid: defaultUid }
    );
  }, [members, user?.uid]);

  useEffect(() => {
    if (!familyId) return;
    setIsLoading(true);

    const eventsUnsubscribe = onSnapshot(
      collection(db, "families", familyId, "events"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as CalendarEvent[];
        setEvents(data);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.LIST, `families/${familyId}/events`);
      }
    );

    const todosQuery = query(
      collection(db, "families", familyId, "todos"),
      orderBy("createdAt", "desc")
    );
    const todosUnsubscribe = onSnapshot(
      todosQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as PlanningTask[];
        setTasks(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `families/${familyId}/todos`);
      }
    );

    const membersUnsubscribe = onSnapshot(
      collection(db, "families", familyId, "users"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as FamilyMember[];
        setMembers(data);
      }
    );

    const sourcesUnsubscribe = onSnapshot(
      collection(db, "families", familyId, "calendar_sources"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as CalendarSource[];
        setSources(data);
      }
    );

    return () => {
      eventsUnsubscribe();
      todosUnsubscribe();
      membersUnsubscribe();
      sourcesUnsubscribe();
    };
  }, [familyId]);

  useEffect(() => {
    const fetchExternalCalendars = async () => {
      if (sources.length === 0) {
        setExternalEvents([]);
        return;
      }

      const allExternalEvents: CalendarEvent[] = [];
      for (const source of sources) {
        if (!source.url) continue;
        try {
          const response = await fetch(
            `/api/fetch-calendar?url=${encodeURIComponent(source.url)}`
          );
          if (response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const data = await response.json();
              const formatted = data.map((e: any, idx: number) => ({
                ...e,
                id: `ext-${source.id}-${e.id || idx}`,
                externalColor: source.color || "#3b82f6",
                isExternal: true,
                sourceName: source.name,
              }));
              allExternalEvents.push(...formatted);
            }
          }
        } catch (err) {
          console.error(`Network error while fetching calendar from ${source.name}:`, err);
        }
      }
      setExternalEvents(allExternalEvents);
    };

    fetchExternalCalendars();
  }, [sources]);

  const toDate = (val: any): Date => {
    if (!val) return new Date();
    if (val?.toDate) return val.toDate();
    if (typeof val === "string") return parseISO(val);
    return new Date(val);
  };

  const dayEvents = useMemo(() => {
    const combined = [...events, ...externalEvents].filter((e) =>
      isSameDay(toDate(e.start), currentDate)
    );
    return combined.sort(
      (a, b) => toDate(a.start).getTime() - toDate(b.start).getTime()
    );
  }, [events, externalEvents, currentDate]);

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== "done");
  }, [tasks]);

  const dayTasks = useMemo(() => {
    return activeTasks.filter((t) => {
      if (!t.deadline) return isSameDay(currentDate, new Date());
      return isSameDay(toDate(t.deadline), currentDate);
    });
  }, [activeTasks, currentDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const openCreateModal = (kind: "event" | "task" = "event") => {
    setEditingEvent(null);
    setAddKind(kind);
    const defaultUid =
      user?.uid && user.uid !== "neutral"
        ? user.uid
        : members[0]?.uid || members[0]?.id || "";
    setEventForm({
      title: "",
      location: "",
      date: format(currentDate, "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "10:00",
      memberUid: defaultUid,
      color: EVENT_COLORS[0].class,
    });
    setTaskForm({
      title: "",
      date: format(currentDate, "yyyy-MM-dd"),
      assigneeUid: defaultUid,
      isUrgent: false,
    });
    setIsAddingOpen(true);
  };

  const openEditEventModal = (event: CalendarEvent) => {
    if (event.isExternal) return;
    const start = toDate(event.start);
    const end = toDate(event.end);
    setEditingEvent(event);
    setAddKind("event");
    setEventForm({
      title: event.title || "",
      location: event.location || "",
      date: format(start, "yyyy-MM-dd"),
      startTime: format(start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      memberUid: event.memberUid || members[0]?.id || "",
      color: event.color || EVENT_COLORS[0].class,
    });
    setIsAddingOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.uid === "neutral") {
      toast.error("Sélectionnez votre profil membre pour ajouter ou modifier un événement.");
      return;
    }
    if (!eventForm.title.trim()) return;

    try {
      const start = new Date(`${eventForm.date}T${eventForm.startTime}`);
      let end = new Date(`${eventForm.date}T${eventForm.endTime}`);
      if (end <= start) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }

      if (editingEvent) {
        await updateDoc(doc(db, "families", familyId, "events", editingEvent.id), {
          title: eventForm.title.trim(),
          location: eventForm.location.trim(),
          start,
          end,
          memberUid: eventForm.memberUid,
          color: eventForm.color,
        });
        toast.success("Événement mis à jour");
      } else {
        await addDoc(collection(db, "families", familyId, "events"), {
          title: eventForm.title.trim(),
          location: eventForm.location.trim(),
          start,
          end,
          allDay: false,
          memberUid: eventForm.memberUid,
          color: eventForm.color,
          timestamp: serverTimestamp(),
          authorUid: user.uid,
        });

        logActivity({
          familyId,
          userId: user.uid,
          userName: user.displayName || "Membre",
          userPhoto: user.photoURL,
          type: "calendar",
          action: "create",
          details: eventForm.title.trim(),
        });
        toast.success("Événement ajouté");
      }

      setIsAddingOpen(false);
      setEditingEvent(null);
    } catch (error) {
      handleFirestoreError(
        error,
        editingEvent ? OperationType.UPDATE : OperationType.CREATE,
        `families/${familyId}/events`
      );
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.uid === "neutral") {
      toast.error("Sélectionnez votre profil membre pour créer une tâche.");
      return;
    }
    if (!taskForm.title.trim()) return;

    const assignee =
      taskForm.assigneeUid || members[0]?.uid || members[0]?.id || user.uid;

    try {
      const deadline = taskForm.date
        ? new Date(`${taskForm.date}T23:59:59`)
        : null;

      await addDoc(collection(db, "families", familyId, "todos"), {
        title: taskForm.title.trim(),
        assignedToIds: [assignee],
        status: "todo",
        deadline,
        recurring: "none",
        isUrgent: taskForm.isUrgent,
        createdAt: serverTimestamp(),
      });

      logActivity({
        familyId,
        userId: user.uid,
        userName: user.displayName || "Membre",
        userPhoto: user.photoURL,
        type: "task",
        action: "create",
        details: taskForm.title.trim(),
      });

      setIsAddingOpen(false);
      toast.success("Tâche ajoutée au planning");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `families/${familyId}/todos`);
    }
  };

  const toggleTask = async (e: React.MouseEvent, task: PlanningTask) => {
    e.stopPropagation();
    if (user?.uid === "neutral") {
      toast.error("Sélectionnez votre profil membre pour valider une tâche.");
      return;
    }
    const nextStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateDoc(doc(db, "families", familyId, "todos", task.id), {
        status: nextStatus,
        completedAt: nextStatus === "done" ? serverTimestamp() : null,
        completedById: nextStatus === "done" ? user.uid : null,
      });
      if (nextStatus === "done") {
        toast.success("Tâche terminée !");
      }
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `families/${familyId}/todos/${task.id}`
      );
    }
  };

  const deleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (user?.uid === "neutral") {
      toast.error("Sélectionnez votre profil membre pour supprimer une tâche.");
      return;
    }
    try {
      await deleteDoc(doc(db, "families", familyId, "todos", taskId));
      toast.success("Tâche supprimée");
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `families/${familyId}/todos/${taskId}`
      );
    }
  };

  const deleteEvent = async (id: string, eventDetails: CalendarEvent) => {
    if (user?.uid === "neutral") {
      toast.error("Sélectionnez votre profil membre pour supprimer un événement.");
      return;
    }
    const isAuthor = eventDetails.authorUid === user.uid;
    const isOwnerOfMember = eventDetails.memberUid === user.uid;

    if (user.role !== "parent" && !isAuthor && !isOwnerOfMember) {
      toast.error("Vous ne pouvez supprimer que vos propres événements.");
      return;
    }

    try {
      await deleteDoc(doc(db, "families", familyId, "events", id));
      logActivity({
        familyId,
        userId: user.uid,
        userName: user.displayName || "Membre",
        userPhoto: user.photoURL,
        type: "calendar",
        action: "delete",
        details: eventDetails.title,
      });
      toast.success("Événement supprimé");
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `families/${familyId}/events/${id}`
      );
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "families", familyId, "calendar_sources"), {
        ...newSource,
        timestamp: serverTimestamp(),
      });
      setNewSource({ name: "", type: "google", url: "", color: "#3b82f6" });
      toast.success("Source ajoutée !");
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `families/${familyId}/calendar_sources`
      );
    }
  };

  const deleteSource = async (id: string) => {
    try {
      await deleteDoc(doc(db, "families", familyId, "calendar_sources", id));
      toast.success("Source supprimée");
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `families/${familyId}/calendar_sources/${id}`
      );
    }
  };

  const getMemberName = (uid?: string) => {
    if (!uid) return null;
    const found = members.find((m) => m.id === uid || m.uid === uid);
    return found?.displayName || null;
  };

  // Shared Add/Edit Dialog for both Compact and Full views
  const addOrEditDialog = (
    <Dialog open={isAddingOpen} onOpenChange={setIsAddingOpen}>
      <DialogContent
        className="glass-dark border-white/15 text-white max-w-md rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {editingEvent
              ? "Modifier l'événement"
              : addKind === "event"
              ? "Nouvel événement"
              : "Nouvelle tâche"}
          </DialogTitle>
        </DialogHeader>

        {!editingEvent && (
          <div className="flex p-1 bg-white/5 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setAddKind("event")}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                addKind === "event"
                  ? "bg-blue-600 text-white"
                  : "text-white/60 hover:text-white"
              )}
            >
              Événement
            </button>
            <button
              type="button"
              onClick={() => setAddKind("task")}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                addKind === "task"
                  ? "bg-blue-600 text-white"
                  : "text-white/60 hover:text-white"
              )}
            >
              Tâche
            </button>
          </div>
        )}

        {addKind === "event" ? (
          <form onSubmit={handleSaveEvent} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Titre</Label>
              <Input
                required
                placeholder="ex: Cours de natation, Dîner famille..."
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm({ ...eventForm, title: e.target.value })
                }
                className="bg-white/5 border-white/15 text-white rounded-xl h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">Date</Label>
                <Input
                  type="date"
                  required
                  value={eventForm.date}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, date: e.target.value })
                  }
                  className="bg-white/5 border-white/15 text-white rounded-xl h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">Pour qui ?</Label>
                <select
                  value={eventForm.memberUid}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, memberUid: e.target.value })
                  }
                  className="w-full h-10 bg-white/5 border border-white/15 rounded-xl px-3 text-sm text-white outline-none"
                >
                  {members.map((m) => (
                    <option
                      key={m.id}
                      value={m.uid || m.id}
                      className="bg-slate-900"
                    >
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">Début</Label>
                <Input
                  type="time"
                  value={eventForm.startTime}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, startTime: e.target.value })
                  }
                  className="bg-white/5 border-white/15 text-white rounded-xl h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">Fin</Label>
                <Input
                  type="time"
                  value={eventForm.endTime}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, endTime: e.target.value })
                  }
                  className="bg-white/5 border-white/15 text-white rounded-xl h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Lieu (optionnel)</Label>
              <Input
                value={eventForm.location}
                onChange={(e) =>
                  setEventForm({ ...eventForm, location: e.target.value })
                }
                placeholder="ex: Maison, École..."
                className="bg-white/5 border-white/15 text-white rounded-xl h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Couleur</Label>
              <div className="flex gap-2.5 pt-1">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.class}
                    type="button"
                    aria-label={c.label}
                    onClick={() => setEventForm({ ...eventForm, color: c.class })}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-transform cursor-pointer",
                      c.class,
                      eventForm.color === c.class
                        ? "border-white scale-110"
                        : "border-transparent opacity-55 hover:opacity-90"
                    )}
                  />
                ))}
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer"
            >
              {editingEvent ? "Enregistrer les modifications" : "Ajouter l'événement"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSaveTask} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">À faire</Label>
              <Input
                required
                placeholder="ex: Sortir les poubelles, Signer le carnet..."
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, title: e.target.value })
                }
                className="bg-white/5 border-white/15 text-white rounded-xl h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">Pour le</Label>
                <Input
                  type="date"
                  value={taskForm.date}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, date: e.target.value })
                  }
                  className="bg-white/5 border-white/15 text-white rounded-xl h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">Assigner à</Label>
                <select
                  value={taskForm.assigneeUid}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, assigneeUid: e.target.value })
                  }
                  className="w-full h-10 bg-white/5 border border-white/15 rounded-xl px-3 text-sm text-white outline-none"
                >
                  {members.map((m) => (
                    <option
                      key={m.id}
                      value={m.uid || m.id}
                      className="bg-slate-900"
                    >
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setTaskForm({ ...taskForm, isUrgent: !taskForm.isUrgent })
              }
              className={cn(
                "w-full py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer",
                taskForm.isUrgent
                  ? "bg-amber-500/20 border-amber-400/50 text-amber-200"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              )}
            >
              {taskForm.isUrgent ? "Priorité urgente activée" : "Marquer comme prioritaire"}
            </button>
            <Button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer"
            >
              Ajouter la tâche
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  // COMPACT DASHBOARD CARD MODE
  if (isCompact) {
    return (
      <div
        className="flex flex-col h-full p-4 pt-3 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {addOrEditDialog}

        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-300 shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white leading-tight truncate">
                Planning
              </h3>
              <p className="text-[11px] text-white/50 capitalize truncate tabular-nums">
                {format(currentDate, "EEEE d MMM", { locale: fr })} ·{" "}
                {dayEvents.length} évt · {dayTasks.length} tâche
                {dayTasks.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentDate(addDays(currentDate, -1))}
              aria-label="Jour précédent"
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(addDays(currentDate, 1))}
              aria-label="Jour suivant"
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openCreateModal("event")}
              aria-label="Ajouter au planning"
              className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/35 text-blue-200 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                aria-label="Ouvrir le planning complet"
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Compact Chronological Content */}
        <ScrollArea className="flex-1 min-h-0 pr-2 -mr-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((event) => {
                const start = toDate(event.start);
                const memberName = getMemberName(event.memberUid);
                const dotColor = event.color || "bg-blue-500";
                return (
                  <div
                    key={event.id}
                    onClick={() =>
                      event.isExternal ? onExpand?.() : openEditEventModal(event)
                    }
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 transition-colors cursor-pointer"
                  >
                    <span
                      className={cn("w-2 h-2 rounded-full shrink-0", !event.isExternal && dotColor)}
                      style={
                        event.isExternal
                          ? { backgroundColor: event.externalColor || "#60a5fa" }
                          : undefined
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">
                        {event.title}
                      </div>
                      <div className="text-[11px] text-white/55 tabular-nums truncate">
                        {format(start, "HH:mm")}
                        {memberName ? ` · ${memberName}` : ""}
                        {event.location ? ` · ${event.location}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}

              {dayTasks.map((task) => {
                const assigneeName = getMemberName(task.assignedToIds?.[0]);
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={(e) => toggleTask(e, task)}
                      aria-label={`Marquer ${task.title} comme terminée`}
                      className="text-white/50 hover:text-emerald-400 transition-colors shrink-0 cursor-pointer"
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-white/90 truncate">
                        {task.title}
                      </div>
                      <div className="text-[11px] text-white/45 truncate">
                        Tâche{assigneeName ? ` · ${assigneeName}` : ""}
                        {task.isUrgent ? " · Prioritaire" : ""}
                      </div>
                    </div>
                  </div>
                );
              })}

              {dayEvents.length === 0 && dayTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-xs sm:text-sm text-white/50 mb-3">
                    Rien de prévu pour cette journée.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openCreateModal("event")}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-xl h-8 px-3 text-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Planifier
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  // FULL PLANNING VIEW
  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {addOrEditDialog}

      {/* Top Toolbar */}
      <div className="p-4 sm:p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-white/8 border border-white/10 rounded-xl p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setCurrentDate(addDays(currentDate, viewMode === "week" ? -7 : -1))
              }
              className="h-8 w-8 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              aria-label="Précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="px-3 text-xs sm:text-sm font-semibold text-white whitespace-nowrap hover:text-blue-300 transition-colors cursor-pointer capitalize tabular-nums"
            >
              {viewMode === "week"
                ? `${format(weekDays[0], "d MMM", { locale: fr })} - ${format(
                    weekDays[6],
                    "d MMM",
                    { locale: fr }
                  )}`
                : format(currentDate, "EEEE d MMMM", { locale: fr })}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setCurrentDate(addDays(currentDate, viewMode === "week" ? 7 : 1))
              }
              className="h-8 w-8 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              aria-label="Suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center bg-white/8 border border-white/10 rounded-xl p-1 gap-1">
            {(
              [
                { id: "list", label: "Agenda" },
                { id: "day", label: "Jour" },
                { id: "week", label: "Semaine" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer",
                  viewMode === tab.id
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {viewMode === "list" && (
            <div className="flex items-center bg-white/8 border border-white/10 rounded-xl p-1 gap-1">
              {(
                [
                  { id: "all", label: "Tout" },
                  { id: "events", label: "Événements" },
                  { id: "tasks", label: "Tâches" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterType(f.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer",
                    filterType === f.id
                      ? "bg-blue-600 text-white"
                      : "text-white/60 hover:text-white"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {user.role === "parent" && (
            <Dialog open={isManagingSources} onOpenChange={setIsManagingSources}>
              <DialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 bg-white/8 border-white/15 hover:bg-white/15 text-white rounded-xl cursor-pointer"
                    aria-label="Calendriers externes"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                }
              />
              <DialogContent className="glass-dark border-white/15 text-white max-w-md rounded-3xl">
                <DialogHeader>
                  <DialogTitle>Sources de Calendrier (.ics)</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-2">
                  <form
                    onSubmit={handleAddSource}
                    className="space-y-3 p-4 rounded-2xl bg-white/5 border border-white/10"
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/70">Nom du calendrier</Label>
                      <Input
                        required
                        value={newSource.name}
                        onChange={(e) =>
                          setNewSource({ ...newSource, name: e.target.value })
                        }
                        placeholder="ex: Google Famille"
                        className="bg-white/5 border-white/15 text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/70">Type</Label>
                      <select
                        value={newSource.type}
                        onChange={(e) =>
                          setNewSource({
                            ...newSource,
                            type: e.target.value as any,
                          })
                        }
                        className="w-full h-10 bg-white/5 border border-white/15 rounded-xl px-3 text-sm text-white outline-none"
                      >
                        <option value="google" className="bg-slate-900">
                          Google Calendar
                        </option>
                        <option value="outlook" className="bg-slate-900">
                          Outlook / Office 365
                        </option>
                        <option value="ical" className="bg-slate-900">
                          iCal (Apple, etc.)
                        </option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/70">URL du flux (.ics)</Label>
                      <Input
                        required
                        value={newSource.url}
                        onChange={(e) =>
                          setNewSource({ ...newSource, url: e.target.value })
                        }
                        placeholder="https://.../basic.ics"
                        className="bg-white/5 border-white/15 text-white"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer"
                    >
                      Ajouter la source
                    </Button>
                  </form>

                  <div className="space-y-2">
                    <Label className="text-xs text-white/60">Sources actives</Label>
                    {sources.length === 0 ? (
                      <p className="text-xs text-white/40 py-2">
                        Aucune source externe configurée.
                      </p>
                    ) : (
                      sources.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            <div>
                              <div className="text-sm font-medium">{s.name}</div>
                              <div className="text-[11px] text-white/50 uppercase">
                                {s.type}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSource(s.id)}
                            className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Button
            type="button"
            onClick={() => openCreateModal("event")}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold gap-1.5 rounded-xl cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 min-h-0">
        {viewMode === "list" ? (
          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Events Column */}
            {(filterType === "all" || filterType === "events") && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-blue-300" />
                    Événements du {format(currentDate, "d MMMM", { locale: fr })}
                  </h3>
                  <button
                    type="button"
                    onClick={() => openCreateModal("event")}
                    className="text-xs font-semibold text-blue-300 hover:text-blue-200 cursor-pointer"
                  >
                    + Événement
                  </button>
                </div>

                {dayEvents.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center text-sm text-white/50">
                    Aucun événement prévu ce jour-là.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {dayEvents.map((event) => {
                      const start = toDate(event.start);
                      const end = toDate(event.end);
                      const memberName = getMemberName(event.memberUid);
                      const canManage =
                        !event.isExternal &&
                        (user.role === "parent" ||
                          event.authorUid === user.uid ||
                          event.memberUid === user.uid);

                      return (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/8 border border-white/10 hover:bg-white/12 transition-colors group"
                        >
                          <div
                            className={cn(
                              "w-2.5 h-2.5 rounded-full shrink-0",
                              !event.isExternal && (event.color || "bg-blue-500")
                            )}
                            style={
                              event.isExternal
                                ? {
                                    backgroundColor:
                                      event.externalColor || "#60a5fa",
                                  }
                                : undefined
                            }
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">
                              {event.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/60 mt-0.5 tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(start, "HH:mm")} – {format(end, "HH:mm")}
                              </span>
                              {memberName && <span>· {memberName}</span>}
                              {event.location && (
                                <span className="inline-flex items-center gap-1">
                                  · <MapPin className="w-3 h-3" />
                                  {event.location}
                                </span>
                              )}
                              {event.isExternal && (
                                <span>· {event.sourceName}</span>
                              )}
                            </div>
                          </div>

                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditEventModal(event)}
                                className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
                                aria-label="Modifier"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteEvent(event.id, event)}
                                className="h-8 w-8 text-white/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer"
                                aria-label="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Tasks Column */}
            {(filterType === "all" || filterType === "tasks") && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-300" />
                    Tâches familiales ({activeTasks.length} à faire)
                  </h3>
                  <button
                    type="button"
                    onClick={() => openCreateModal("task")}
                    className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 cursor-pointer"
                  >
                    + Tâche
                  </button>
                </div>

                {tasks.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center text-sm text-white/50">
                    Aucune tâche pour le moment.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {tasks.slice(0, 15).map((task) => {
                      const isDone = task.status === "done";
                      const assigneeName = getMemberName(task.assignedToIds?.[0]);

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-center gap-3 p-3.5 rounded-2xl border transition-colors",
                            isDone
                              ? "bg-white/5 border-white/5 opacity-55"
                              : "bg-white/8 border-white/10 hover:bg-white/12"
                          )}
                        >
                          <button
                            type="button"
                            onClick={(e) => toggleTask(e, task)}
                            aria-label="Basculer l'état de la tâche"
                            className="shrink-0 text-white/60 hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div
                              className={cn(
                                "text-sm font-semibold text-white truncate",
                                isDone && "line-through text-white/50"
                              )}
                            >
                              {task.title}
                            </div>
                            <div className="text-xs text-white/55 tabular-nums truncate">
                              {assigneeName || "Toute la famille"}
                              {task.deadline
                                ? ` · ${format(toDate(task.deadline), "d MMM", {
                                    locale: fr,
                                  })}`
                                : ""}
                              {task.isUrgent && !isDone ? " · Prioritaire" : ""}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => deleteTask(e, task.id)}
                            className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0 cursor-pointer"
                            aria-label="Supprimer la tâche"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        ) : viewMode === "day" ? (
          <div className="min-w-[640px]">
            {/* Members Header */}
            <div className="flex border-b border-white/10 bg-white/5 sticky top-0 z-10">
              <div className="w-16 border-r border-white/10 shrink-0" />
              {externalEvents.length > 0 && (
                <div className="flex-1 p-3 text-center border-r border-white/10 text-xs font-semibold text-white/80">
                  Partagés
                </div>
              )}
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex-1 p-3 text-center border-r border-white/10 last:border-r-0 text-xs font-semibold text-white truncate"
                >
                  {member.displayName}
                </div>
              ))}
            </div>

            {/* Day Grid */}
            <div className="flex relative">
              <div className="w-16 flex flex-col bg-white/5 shrink-0">
                {HOURS.map((hour, i) => (
                  <div
                    key={i}
                    className="h-14 border-b border-white/5 flex items-start justify-center pt-1.5"
                  >
                    <span className="text-[11px] font-medium text-white/45 tabular-nums">
                      {format(hour, "HH:mm")}
                    </span>
                  </div>
                ))}
              </div>

              {externalEvents.length > 0 && (
                <div className="flex-1 border-r border-white/10 relative">
                  {HOURS.map((_, i) => (
                    <div key={i} className="h-14 border-b border-white/5" />
                  ))}
                  {dayEvents
                    .filter((e) => e.isExternal)
                    .map((event) => {
                      const start = toDate(event.start);
                      const end = toDate(event.end);
                      const startHour = start.getHours() + start.getMinutes() / 60;
                      const endHour = end.getHours() + end.getMinutes() / 60;
                      if (startHour < 7 || startHour > 22) return null;
                      const top = (startHour - 7) * 56;
                      const height = Math.max(0.5, endHour - startHour) * 56;

                      return (
                        <div
                          key={event.id}
                          className="absolute left-1 right-1 rounded-xl p-2 text-white border border-white/15 shadow-md overflow-hidden"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            backgroundColor: event.externalColor || "#3b82f6",
                          }}
                        >
                          <div className="text-xs font-bold truncate">{event.title}</div>
                          <div className="text-[10px] opacity-85 tabular-nums">
                            {format(start, "HH:mm")}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex-1 border-r border-white/10 last:border-r-0 relative"
                >
                  {HOURS.map((_, i) => (
                    <div key={i} className="h-14 border-b border-white/5" />
                  ))}
                  {dayEvents
                    .filter(
                      (e) =>
                        !e.isExternal &&
                        (e.memberUid === member.id || e.memberUid === member.uid)
                    )
                    .map((event) => {
                      const start = toDate(event.start);
                      const end = toDate(event.end);
                      const startHour = start.getHours() + start.getMinutes() / 60;
                      const endHour = end.getHours() + end.getMinutes() / 60;
                      if (startHour < 7 || startHour > 22) return null;
                      const top = (startHour - 7) * 56;
                      const height = Math.max(0.5, endHour - startHour) * 56;

                      return (
                        <div
                          key={event.id}
                          onClick={() => openEditEventModal(event)}
                          className={cn(
                            "absolute left-1 right-1 rounded-xl p-2 text-white border border-white/15 shadow-md overflow-hidden cursor-pointer hover:brightness-110 transition-all group",
                            event.color || "bg-blue-500"
                          )}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <div className="text-xs font-bold truncate pr-5">
                            {event.title}
                          </div>
                          <div className="text-[10px] opacity-85 tabular-nums">
                            {format(start, "HH:mm")}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEvent(event.id, event);
                            }}
                            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded bg-black/25 hover:bg-red-500 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Week View */
          <div className="min-w-[720px]">
            <div className="flex border-b border-white/10 bg-white/5 sticky top-0 z-10">
              <div className="w-16 border-r border-white/10 shrink-0" />
              {weekDays.map((day, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex-1 p-2.5 text-center border-r border-white/10 last:border-r-0",
                    isSameDay(day, new Date()) && "bg-blue-500/15"
                  )}
                >
                  <div className="text-[11px] uppercase font-semibold text-white/50">
                    {format(day, "EEE", { locale: fr })}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      isSameDay(day, new Date()) ? "text-blue-300" : "text-white"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex relative">
              <div className="w-16 flex flex-col bg-white/5 shrink-0">
                {HOURS.map((hour, i) => (
                  <div
                    key={i}
                    className="h-14 border-b border-white/5 flex items-start justify-center pt-1.5"
                  >
                    <span className="text-[11px] font-medium text-white/45 tabular-nums">
                      {format(hour, "HH:mm")}
                    </span>
                  </div>
                ))}
              </div>

              {weekDays.map((day, dIdx) => (
                <div
                  key={dIdx}
                  className="flex-1 border-r border-white/10 last:border-r-0 relative"
                >
                  {HOURS.map((_, i) => (
                    <div key={i} className="h-14 border-b border-white/5" />
                  ))}
                  {[...events, ...externalEvents]
                    .filter((e) => isSameDay(toDate(e.start), day))
                    .map((event) => {
                      const start = toDate(event.start);
                      const end = toDate(event.end);
                      const startHour = start.getHours() + start.getMinutes() / 60;
                      const endHour = end.getHours() + end.getMinutes() / 60;
                      if (startHour < 7 || startHour > 22) return null;
                      const top = (startHour - 7) * 56;
                      const height = Math.max(0.5, endHour - startHour) * 56;

                      return (
                        <div
                          key={event.id}
                          onClick={() =>
                            !event.isExternal && openEditEventModal(event)
                          }
                          className={cn(
                            "absolute left-0.5 right-0.5 rounded-xl p-1.5 text-white border border-white/15 shadow-md overflow-hidden cursor-pointer",
                            !event.isExternal && (event.color || "bg-blue-500")
                          )}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            backgroundColor: event.isExternal
                              ? event.externalColor || "#3b82f6"
                              : undefined,
                          }}
                        >
                          <div className="text-[11px] font-bold truncate">
                            {event.title}
                          </div>
                          <div className="text-[10px] opacity-80 tabular-nums">
                            {format(start, "HH:mm")}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
