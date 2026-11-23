import { useState, useEffect } from "react";
import { db, OperationType, handleFirestoreError } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, where } from "firebase/firestore";
import { CheckCircle2, Circle, Clock, Plus, Trash2, User, AlertCircle, Filter, CheckCircle, Repeat, Users as UsersIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, isAfter, addHours, isBefore, addDays, addWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { notifyFamily } from "@/lib/pushNotifications";

import { logActivity } from "@/lib/activity";

interface TodoTask {
  id: string;
  title: string;
  description?: string;
  assignedToIds: string[];
  status: 'todo' | 'in-progress' | 'done';
  deadline?: any;
  recurring?: 'none' | 'daily' | 'weekly';
  createdAt: any;
  showAfter?: any;
  completedAt?: any;
  completedById?: string;
}

export function TodoList({ 
  familyId, 
  user, 
  members,
  hideAddForm = false,
  isCompact = false
}: { 
  familyId: string, 
  user: any, 
  members: any[],
  hideAddForm?: boolean,
  isCompact?: boolean
}) {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [deadlineType, setDeadlineType] = useState<"none" | "today" | "tomorrow" | "week">("none");
  const [isHighPriority, setIsHighPriority] = useState(false);
  const [recurring, setRecurring] = useState<'none' | 'daily' | 'weekly'>('none');
  const [filterUser, setFilterUser] = useState<string>(user.uid === 'neutral' ? "all" : user.uid);
  const [selectedTask, setSelectedTask] = useState<TodoTask | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const isNeutral = user?.uid === 'neutral';
  const isParent = user?.role === 'parent';

  // Initialize assignees when profile changes or members load
  useEffect(() => {
    if (members.length > 0 && selectedAssignees.length === 0) {
      setSelectedAssignees([user.uid === 'neutral' ? members[1]?.uid || user.uid : user.uid]);
    }
  }, [user.uid, members]);

  // Update filter when user changes (e.g. profile switch)
  useEffect(() => {
    setFilterUser(user.uid === 'neutral' ? "all" : user.uid);
  }, [user.uid]);

  useEffect(() => {
    if (!familyId) return;

    const q = query(
      collection(db, "families", familyId, "todos"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
...doc.data()
      })) as TodoTask[];
      setTasks(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `families/${familyId}/todos`);
    });

    return () => unsubscribe();
  }, [familyId]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNeutral) {
      toast.error("L'utilisateur Maison ne peut pas créer de tâches. Veuillez changer de profil.");
      return;
    }
    if (!newTitle.trim()) return;
    if (selectedAssignees.length === 0) {
      toast.error("Veuillez assigner au moins une personne");
      return;
    }

    try {
      let deadline = null;
      if (deadlineType === "today") deadline = new Date(new Date().setHours(23, 59, 59, 999));
      if (deadlineType === "tomorrow") deadline = addDays(new Date(new Date().setHours(23, 59, 59, 999)), 1);
      if (deadlineType === "week") deadline = addWeeks(new Date(new Date().setHours(23, 59, 59, 999)), 1);

      await addDoc(collection(db, "families", familyId, "todos"), {
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        assignedToIds: selectedAssignees,
        status: 'todo',
        deadline: deadline,
        recurring: recurring,
        isUrgent: isHighPriority,
        createdAt: serverTimestamp()
      });

      const assignedNames = members
        .filter(m => selectedAssignees.includes(m.uid))
        .map(m => m.displayName || m.name || "Membre")
        .join(", ");

      notifyFamily(familyId, user.uid, "Nouvelle tâche", `${newTitle.trim()} assignée à ${assignedNames}`, '/');

      logActivity({
        familyId,
        userId: user.uid,
        userName: user.displayName || "Membre",
        userPhoto: user.photoURL,
        type: "task",
        action: "create",
        details: `${newTitle.trim()}`
      });

      setNewTitle("");
      setNewDesc("");
      setDeadlineType("none");
      setRecurring('none');
      setIsHighPriority(false);
      setIsAddingTask(false);
      toast.success("Tâche ajoutée");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `families/${familyId}/todos`);
    }
  };

  const updateStatus = async (task: TodoTask, newStatus: TodoTask['status']) => {
    if (isNeutral) {
      toast.error("L'utilisateur Maison ne peut pas modifier les tâches. Veuillez changer de profil.");
      return;
    }
    try {
      // Handle recurring tasks completion: if marking as done AND it is recurring
      if (newStatus === 'done' && task.recurring && task.recurring !== 'none') {
        const currentDeadline = task.deadline?.toDate ? task.deadline.toDate() : (task.deadline ? new Date(task.deadline) : new Date());
        let nextDeadline = currentDeadline;
        
        if (task.recurring === 'daily') nextDeadline = addDays(currentDeadline, 1);
        else if (task.recurring === 'weekly') nextDeadline = addWeeks(currentDeadline, 1);

        // Next instance should only show after midnight of tonight
        const nextShowAfter = new Date();
        nextShowAfter.setHours(23, 59, 59, 999);

        // Create the NEXT instance of the task
        await addDoc(collection(db, "families", familyId, "todos"), {
          title: task.title,
          description: task.description || null,
          assignedToIds: task.assignedToIds,
          status: 'todo',
          deadline: nextDeadline,
          recurring: task.recurring,
          isUrgent: false,
          showAfter: nextShowAfter, // Hidden until tomorrow
          createdAt: serverTimestamp()
        });

        // Mark CURRENT task as done
        await updateDoc(doc(db, "families", familyId, "todos", task.id), {
          status: 'done',
          recurring: 'none',
          completedAt: serverTimestamp(),
          completedById: user.uid
        });

        logActivity({
          familyId,
          userId: user.uid,
          userName: user.displayName || "Membre",
          userPhoto: user.photoURL,
          type: "task",
          action: "complete",
          details: `${task.title}`
        });
        
        toast.success("Tâche terminée, archivée et prochaine prévue pour demain");
      } else {
        await updateDoc(doc(db, "families", familyId, "todos", task.id), {
          status: newStatus,
          completedAt: newStatus === 'done' ? serverTimestamp() : null,
          completedById: newStatus === 'done' ? user.uid : null
        });
        if (newStatus === 'done') {
          logActivity({
            familyId,
            userId: user.uid,
            userName: user.displayName || "Membre",
            userPhoto: user.photoURL,
            type: "task",
            action: "complete",
            details: `${task.title}`
          });
          toast.success("Tâche archivée");
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `families/${familyId}/todos/${task.id}`);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (isNeutral) {
      toast.error("L'utilisateur Maison ne peut pas supprimer de tâches.");
      return;
    }
    try {
      const task = tasks.find(t => t.id === taskId);
      await deleteDoc(doc(db, "families", familyId, "todos", taskId));
      
      if (task) {
        logActivity({
          familyId,
          userId: user.uid,
          userName: user.displayName || "Membre",
          userPhoto: user.photoURL,
          type: "task",
          action: "delete",
          details: `${task.title}`
        });
      }
      
      toast.success("Tâche supprimée");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `families/${familyId}/todos/${taskId}`);
    }
  };

  const toggleAssignee = (uid: string) => {
    setSelectedAssignees(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const filteredTasks = tasks.filter(task => {
    // Exclude completed tasks (they go to archive)
    if (task.status === 'done') return false;
    
    // Check showAfter for recurring tasks
    if (task.showAfter) {
      const showDate = task.showAfter.toDate ? task.showAfter.toDate() : new Date(task.showAfter);
      if (isAfter(showDate, new Date())) return false;
    }

    // In Admin Mode, show everything
    if (isAdminMode && isParent) return true;

    if (filterUser === "all") return true;
    return task.assignedToIds?.includes(filterUser);
  });

  const isUrgentTask = (task: TodoTask) => {
    if ((task as any).isUrgent) return true;
    if (!task.deadline) return false;
    const date = task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline);
    // Urgent if within next 12 hours instead of 24h to avoid "automatic urgency"
    return isBefore(date, addHours(new Date(), 12)) && isAfter(date, new Date());
  };

  const isOverdue = (deadline: any) => {
    if (!deadline) return false;
    const date = deadline.toDate ? deadline.toDate() : new Date(deadline);
    return isBefore(date, new Date());
  };

  if (isCompact) {
    const todo = tasks.filter(t => t.status !== 'done');
    const urgent = todo.filter(t => isUrgentTask(t));

    return (
      <div className="flex flex-col h-full p-4 relative group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">Tâches</h3>
          </div>
          <div className="flex gap-1">
            {urgent.length > 0 && (
              <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">
                {urgent.length}!
              </span>
            )}
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
              {todo.length}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-hidden">
          {todo.slice(0, 3).map((task) => (
            <div key={task.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                isUrgentTask(task) ? "bg-orange-500" : isOverdue(task.deadline) ? "bg-red-500" : "bg-blue-500"
              )} />
              <span className="text-xs text-slate-200 truncate flex-1">{task.title}</span>
            </div>
          ))}
          {todo.length > 3 && (
            <div className="text-[10px] text-slate-500 text-center py-1">
              + {todo.length - 3} autres tâches
            </div>
          )}
          {todo.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 italic text-[10px]">
              <CheckCircle2 className="w-8 h-8 opacity-20" />
              Tout est fait !
            </div>
          )}
        </div>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Cliquer pour gérer
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <div className="flex items-start justify-between mb-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">Tâches</h2>
        </div>
        
        <div className="flex items-center gap-4">
          {isParent && (
            <button
              onClick={() => setIsAdminMode(!isAdminMode)}
              className={cn(
                "px-4 py-2 rounded-2xl border transition-all text-xs font-bold flex items-center gap-2",
                isAdminMode 
                  ? "bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(234,88,12,0.3)]" 
                  : "bg-slate-800 border-white/5 text-slate-400 hover:bg-white/5"
              )}
            >
              <UsersIcon className={cn("w-4 h-4", isAdminMode && "animate-pulse")} />
              {isAdminMode ? "Mode Admin: ON" : "Mode Admin"}
            </button>
          )}

          {user.role === 'parent' && (
            <button
              onClick={() => setIsArchiveOpen(true)}
              className="px-4 py-2 rounded-2xl bg-slate-800 border border-white/5 hover:bg-white/5 transition-colors text-xs font-bold text-slate-400 flex items-center gap-2"
            >
              <UsersIcon className="w-4 h-4" />
              Archives
            </button>
          )}

          {!isCompact && (
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 transition-colors hover:bg-white/10">
              <Filter className="w-4 h-4 text-slate-400" />
              <select 
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="bg-transparent border-none p-0 text-xs font-bold text-slate-300 focus:outline-none appearance-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-slate-900">Vue Globale</option>
                {members.map(m => (
                  <option key={m.uid} value={m.uid} className="bg-slate-900">{m.displayName || m.name || 'Utilisateur'}</option>
                ))}
              </select>
            </div>
          )}

          <button 
            onClick={() => setIsAddingTask(true)}
            className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center transition-all hover:scale-105 active:scale-95 group"
          >
            <Plus className="w-8 h-8 text-white transition-transform group-hover:rotate-90" />
          </button>
        </div>
      </div>

      <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
        <DialogContent className="glass-dark border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              Nouvelle tâche
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={addTask} className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-400">Titre</Label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Qu'y a-t-il à faire ?"
                  className="bg-white/5 border-white/10 text-white rounded-xl py-6"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">Description (optionnel)</Label>
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Plus de détails..."
                  className="bg-white/5 border-white/10 text-white rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-400">Échéance</Label>
                  <select
                    value={deadlineType}
                    onChange={(e) => setDeadlineType(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none"
                  >
                    <option value="none" className="bg-slate-900">Aucune</option>
                    <option value="today" className="bg-slate-900">Aujourd'hui</option>
                    <option value="tomorrow" className="bg-slate-900">Demain</option>
                    <option value="week" className="bg-slate-900">Cette semaine</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-400">Répétition</Label>
                  <select
                    value={recurring}
                    onChange={(e) => setRecurring(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none"
                  >
                    <option value="none" className="bg-slate-900">Unique</option>
                    <option value="daily" className="bg-slate-900">Quotidien</option>
                    <option value="weekly" className="bg-slate-900">Hebdomadaire</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-slate-400">Assigner à</Label>
                <div className="flex flex-wrap gap-2">
                  {members.map(m => (
                    <button
                      key={m.uid}
                      type="button"
                      onClick={() => toggleAssignee(m.uid)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
                        selectedAssignees.includes(m.uid) 
                          ? "bg-blue-600/20 border-blue-500 text-white" 
                          : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                      )}
                    >
                      <Avatar className="w-5 h-5">
                        <AvatarImage src={m.photoURL} />
                        <AvatarFallback style={{ backgroundColor: m.color }}>{m.name?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{m.displayName || m.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsHighPriority(!isHighPriority)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all font-medium text-sm",
                    isHighPriority 
                      ? "bg-red-500/20 border-red-500 text-red-500" 
                      : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                  )}
                >
                  <AlertCircle className="w-4 h-4" />
                  Marquer comme Urgent
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full py-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-lg">
              Créer la tâche
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ScrollArea className="flex-1 -mr-2 pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filteredTasks.map((task) => {
            const urgent = isUrgentTask(task);
            const overdue = isOverdue(task.deadline) && task.status !== 'done';
            const assignedMembers = members.filter(m => task.assignedToIds?.includes(m.uid));

            return (
              <div 
                key={task.id}
                onClick={() => isCompact && setSelectedTask(task)}
                className={cn(
                  "group p-6 rounded-[2.5rem] border transition-all duration-300 relative overflow-hidden flex flex-col min-h-[280px]",
                  task.status === 'done' 
                    ? "bg-slate-800/20 border-slate-800/50 grayscale-[0.8] opacity-50" 
                    : overdue 
                      ? "bg-red-500/5 border-red-500/20" 
                      : urgent 
                        ? "bg-orange-500/5 border-orange-500/20 shadow-[inset_0_0_20px_rgba(249,115,22,0.05)]" 
                        : "bg-white/[0.03] border-white/5 hover:bg-white/[0.05] hover:border-white/10 shadow-xl"
                )}
              >
                <div className="flex flex-col h-full relative z-10">
                  <div className="flex items-center gap-3 pb-3 border-b border-white/5 mb-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateStatus(task, task.status === 'done' ? 'todo' : 'done'); }}
                      className="shrink-0"
                    >
                      {task.status === 'done' ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </div>
                      ) : (
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shadow-inner",
                          urgent ? "border-orange-500/30" : "border-slate-700"
                        )}>
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500/50 opacity-0" />
                        </div>
                      )}
                    </button>
                    
                    <h3 className={cn(
                      "font-bold transition-all line-clamp-2 leading-tight tracking-tight text-lg",
                      task.status === 'done' && "line-through text-slate-500"
                    )}>
                      {task.title}
                    </h3>
                  </div>

                  {task.description && (
                    <p className="text-xs text-slate-400 line-clamp-4 leading-relaxed mb-4 italic">
                      {task.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-end justify-between">
                    <div className="flex items-center -space-x-4">
                      {assignedMembers.slice(0, 3).map(m => (
                        <Avatar 
                          key={m.uid} 
                          className="border-4 border-[#0F1115] w-12 h-12 shadow-2xl"
                        >
                          <AvatarImage src={m.photoURL} />
                          <AvatarFallback className="text-[10px] font-black" style={{ backgroundColor: m.color }}>
                            {(m.displayName || m.name || 'U').substring(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {assignedMembers.length > 3 && (
                        <div className="w-12 h-12 rounded-full border-4 border-[#0F1115] bg-slate-800 flex items-center justify-center text-[10px] font-black text-white ml-2">
                          +{assignedMembers.length - 3}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {task.deadline && task.status !== 'done' && (
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest",
                          overdue ? "text-red-500" : urgent ? "text-orange-400" : "text-slate-500"
                        )}>
                          {urgent ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{urgent ? "Urgent" : overdue ? "En retard" : format(task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline), "dd MMM", { locale: fr })}</span>
                        </div>
                      )}
                      {task.recurring && task.recurring !== 'none' && task.status !== 'done' && (
                        <div className="flex items-center gap-1 text-[8px] text-blue-400 font-black uppercase tracking-widest opacity-60">
                          <Repeat className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete button only visible on hover (or always in admin mode) */}
                  {!isCompact && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                      className={cn(
                        "absolute top-2 right-2 p-2 transition-all text-slate-600 hover:text-red-400",
                        isAdminMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <div className="text-center py-24 text-slate-500 col-span-full font-medium italic">
              Aucune tâche pour le moment.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Detail Dialog for Bento Mode */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="glass-dark border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-400" />
              {selectedTask?.title}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {selectedTask?.description && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Description</h4>
                <p className="text-slate-200 bg-white/5 p-4 rounded-xl border border-white/5">
                  {selectedTask.description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Assignés</h4>
                <div className="flex flex-wrap gap-2">
                  {members.filter(m => selectedTask?.assignedToIds?.includes(m.uid)).map(m => (
                    <div key={m.uid} className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={m.photoURL} />
                        <AvatarFallback style={{ backgroundColor: m.color }}>{m.name?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{m.displayName || m.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Statut</h4>
                <div className="flex gap-2">
                  {(['todo', 'in-progress', 'done'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => selectedTask && updateStatus(selectedTask, s)}
                      className={cn(
                        "flex-1 text-[10px] px-3 py-2 rounded-xl transition-all border",
                        selectedTask?.status === s 
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                          : "bg-white/5 text-slate-500 border-white/5 hover:bg-white/10"
                      )}
                    >
                      {s === 'todo' ? 'À faire' : s === 'in-progress' ? 'En cours' : 'Fait'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <Button 
                variant="ghost" 
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                onClick={() => {
                  if (selectedTask) {
                    deleteTask(selectedTask.id);
                    setSelectedTask(null);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Supprimer
              </Button>
              <Button onClick={() => setSelectedTask(null)}>Fermer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Archive Dialog */}
      <Dialog open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
        <DialogContent className="glass-dark border-white/10 text-white max-w-4xl max-h-[85vh] flex flex-col p-8 overflow-hidden rounded-[2.5rem]">
          <DialogHeader className="shrink-0 mb-6">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
              <UsersIcon className="w-6 h-6 text-blue-400" />
              Archives des tâches
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-12">
              {(() => {
                const oneWeekAgo = addDays(new Date(), -7);
                const archived = tasks.filter(t => t.status === 'done' && t.completedAt);
                
                // Group by Day
                const dayStrings = Array.from(new Set(archived.map(t => 
                  format(t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt), "yyyy-MM-dd")
                ))).sort().reverse();

                if (dayStrings.length === 0) {
                  return <div className="text-center py-12 text-slate-500 italic">Aucune tâche archivée.</div>
                }

                return dayStrings.map(dayStr => {
                  const dayTasks = archived.filter(t => 
                    format(t.completedAt.toDate ? t.completedAt.toDate() : new Date(t.completedAt), "yyyy-MM-dd") === dayStr
                  );
                  const isOld = isBefore(new Date(dayStr), oneWeekAgo);

                  const content = (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {dayTasks.map(task => {
                        const completerProfile = members.find(m => m.uid === task.completedById);
                        return (
                          <div key={task.id} className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-200 truncate">{task.title}</div>
                                <div className="text-[10px] text-slate-500 font-medium">
                                  Terminé à {format(task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt), "HH:mm")}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Validateur</span>
                                <div className="text-[10px] font-bold text-slate-300">{completerProfile?.displayName || '?'}</div>
                              </div>
                              <Avatar className="w-10 h-10 border-2 border-[#0F1115] shadow-xl">
                                <AvatarImage src={completerProfile?.photoURL} />
                                <AvatarFallback className="text-[10px]" style={{ backgroundColor: completerProfile?.color || '#334155' }}>
                                  {completerProfile?.displayName?.[0] || '?'}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );

                  return (
                    <div key={dayStr} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <h4 className="text-lg font-bold text-slate-200 capitalize">
                          {format(new Date(dayStr), "EEEE d MMMM", { locale: fr })}
                        </h4>
                        <div className="h-px flex-1 bg-white/5" />
                        {isOld && <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black italic">Ancien Historique</span>}
                      </div>

                      {isOld ? (
                        <details className="group/details transition-all">
                          <summary className="cursor-pointer text-xs text-slate-500 font-bold hover:text-slate-400 list-none flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center transition-transform group-open/details:rotate-90">
                              <ChevronRight className="w-3 h-3" />
                            </div>
                            Voir les {dayTasks.length} tâches archivées
                          </summary>
                          <div className="pt-2">
                             {content}
                          </div>
                        </details>
                      ) : content}
                    </div>
                  );
                });
              })()}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
