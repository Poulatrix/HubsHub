import { useState, useEffect, useRef } from "react";
import { db, OperationType, handleFirestoreError } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { Send, Trash2, MessageSquare, Maximize2 } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { notifyFamily } from "@/lib/pushNotifications";
import { logActivity } from "@/lib/activity";

interface Message {
  id: string;
  content: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  timestamp: any;
}

export function Wall({
  familyId,
  user,
  members,
  isCompact,
  onExpand,
}: {
  familyId: string;
  user: any;
  members?: any[];
  isCompact?: boolean;
  onExpand?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const timer = setTimeout(() => {
        const scrollArea = scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
        if (scrollArea) {
          scrollArea.scrollTop = scrollArea.scrollHeight;
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [messages, isCompact]);

  useEffect(() => {
    if (!familyId) return;
    setIsLoading(true);

    const q = query(
      collection(db, "families", familyId, "wall"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Message[];
        setMessages(msgs);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.LIST, `families/${familyId}/wall`);
      }
    );

    return () => unsubscribe();
  }, [familyId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (user?.uid === "neutral") {
      toast.error("Sélectionnez votre profil membre pour poster un message.");
      return;
    }

    const trimmed = newMessage.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      toast.error("Le message ne doit pas dépasser 500 caractères.");
      return;
    }

    setIsSending(true);
    try {
      await addDoc(collection(db, "families", familyId, "wall"), {
        content: trimmed,
        authorUid: user.uid,
        authorName: user.displayName || "Membre",
        authorPhoto: user.photoURL || null,
        timestamp: serverTimestamp(),
      });

      const contentPreview = trimmed.length > 50 ? trimmed.substring(0, 47) + "..." : trimmed;
      notifyFamily(familyId, user.uid, `Message de ${user.displayName || "Membre"}`, contentPreview, "/");

      logActivity({
        familyId,
        userId: user.uid,
        userName: user.displayName || "Membre",
        userPhoto: user.photoURL,
        type: "wall",
        action: "create",
        details: contentPreview,
      });

      setNewMessage("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `families/${familyId}/wall`);
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "families", familyId, "wall", id));
      toast.success("Message supprimé");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `families/${familyId}/wall/${id}`);
    }
  };

  const getAuthorName = (msg: Message) => {
    const member = members?.find((m) => m.uid === msg.authorUid);
    return member?.displayName || msg.authorName || "Membre";
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        isCompact ? "p-4 pt-3" : "p-4 md:p-6"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-amber-400/15 text-[#fee29a] shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-white leading-tight truncate">
              Mur Familial
            </h3>
            <p className="text-[11px] text-white/50 tabular-nums">
              {messages.length} {messages.length > 1 ? "messages" : "message"}
            </p>
          </div>
        </div>

        {isCompact && onExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            aria-label="Agrandir le mur familial"
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Chronological Messages */}
      <ScrollArea
        className={cn(
          "flex-1 min-h-0",
          isCompact ? "pr-2 -mr-2 mb-3" : "pr-4 -mr-4 mb-4"
        )}
        ref={scrollRef}
      >
        {isLoading ? (
          <div className="space-y-2.5 py-2">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-16 rounded-2xl bg-white/10 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className={cn("space-y-2.5 px-1 py-1", !isCompact && "space-y-3")}>
            {messages.map((msg, i) => {
              const isMine = user?.uid === msg.authorUid;
              const canDelete = user?.role === "parent" || isMine;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    rotate: i % 2 === 0 ? -0.6 : 0.6,
                    opacity: 1,
                    y: 0,
                  }}
                  whileHover={{ rotate: 0, scale: 1.01 }}
                  transition={{ duration: 0.18 }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "group relative rounded-[1.25rem] shadow-md transition-transform",
                    isCompact ? "p-3" : "p-4",
                    i % 2 === 0
                      ? "bg-[#fee29a] text-slate-900"
                      : "bg-[#c9daff] text-slate-900"
                  )}
                >
                  <div className="flex justify-between items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold tracking-wide text-slate-800/70 truncate">
                      {getAuthorName(msg)}
                    </span>
                    <span className="text-[11px] font-medium text-slate-800/55 tabular-nums shrink-0">
                      {msg.timestamp?.toDate
                        ? format(msg.timestamp.toDate(), "HH:mm · d MMM", { locale: fr })
                        : "À l'instant"}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "font-medium leading-snug text-slate-900 break-words",
                      isCompact ? "text-sm" : "text-base"
                    )}
                  >
                    {msg.content}
                  </p>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => deleteMessage(e, msg.id)}
                      aria-label="Supprimer ce message"
                      className="absolute -top-1.5 -right-1.5 bg-slate-900/80 text-white hover:bg-red-500 rounded-full p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-md cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </motion.div>
              );
            })}

            {messages.length === 0 && (
              <div className="text-center py-8 px-4 text-white/50 text-sm">
                Aucun message sur le mur. Laissez un petit mot pour la famille !
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Inline Quick Composer */}
      <form
        onSubmit={sendMessage}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 relative shrink-0"
      >
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          maxLength={500}
          placeholder="Écrire un mot sur le mur..."
          className={cn(
            "bg-white/10 border-white/15 rounded-xl text-white placeholder:text-white/40 focus:bg-white/15 focus:border-white/30 transition-all flex-1 pr-11",
            isCompact ? "h-10 text-sm px-3.5" : "h-12 text-base px-4"
          )}
        />
        <button
          type="submit"
          disabled={isSending || !newMessage.trim()}
          aria-label="Envoyer le message"
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg flex items-center justify-center transition-all cursor-pointer",
            newMessage.trim()
              ? "bg-[#fee29a] text-slate-900 hover:bg-[#fde68a] shadow-sm"
              : "text-white/30 cursor-not-allowed",
            isCompact ? "w-7 h-7" : "w-9 h-9"
          )}
        >
          <Send className={cn(isCompact ? "w-3.5 h-3.5" : "w-4 h-4")} />
        </button>
      </form>
    </div>
  );
}
