import { useState, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import { ShoppingCart, Plus, Trash2, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { notifyFamily } from "@/lib/pushNotifications";

interface Item {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  created_at: string;
}

export function ShoppingList({ familyId, user, isCompact }: { familyId?: string, user: any, isCompact?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newUnit, setNewUnit] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabase();
    
    // Fetch items function that can be called from listener
    const fetchItems = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('shopping_list')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        if (isMounted) {
          // Aggregate items by name and unit
          const aggregated = (data || []).reduce((acc: Item[], current: Item) => {
            const existing = acc.find(item => 
              item.name.toLowerCase().trim() === current.name.toLowerCase().trim() && 
              item.unit.toLowerCase().trim() === current.unit.toLowerCase().trim() &&
              item.checked === current.checked
            );

            if (existing) {
              existing.quantity += current.quantity;
              return acc;
            } else {
              return [...acc, { ...current }];
            }
          }, []);

          // Sort: unchecked first, then by date
          const sorted = aggregated.sort((a, b) => {
            if (a.checked === b.checked) {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
            return a.checked ? 1 : -1;
          });

          setItems(sorted);
          setError(null);
        }
      } catch (err: any) {
        console.error("Supabase fetch error:", err);
        if (isMounted) {
          setError(err.message || "Erreur de connexion à la liste de courses");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Setup real-time subscription
    // We use a simpler strategy: re-fetch the whole list on any change to ensure 
    // aggregation logic is always consistent with the DB.
    const instanceId = Math.random().toString(36).substring(2, 9);
    const channel = supabase
      .channel(`shopping_list_realtime_${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list' },
        () => {
          if (isMounted) fetchItems();
        }
      )
      .subscribe();

    fetchItems();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.uid === 'neutral') {
      toast.error("L'utilisateur Maison ne peut pas ajouter d'articles. Veuillez changer de profil.");
      return;
    }
    if (!newName.trim()) return;

    try {
      const supabase = getSupabase();
      const { error: addError } = await supabase
        .from('shopping_list')
        .insert([{
          name: newName.trim(),
          quantity: parseFloat(newQuantity) || 1,
          unit: newUnit.trim(),
          checked: false
        }]);

      if (addError) throw addError;
      
      if (familyId && user) {
        notifyFamily(familyId, user.uid, "Course ajoutée", `${newName.trim()} a été ajouté à la liste.`, '/');
        const qtyInfo = newQuantity !== "1" || newUnit ? ` (${newQuantity}${newUnit ? ' ' + newUnit : ''})` : "";
        logActivity({
          familyId,
          userId: user.uid,
          userName: user.displayName || "Membre",
          userPhoto: user.photoURL,
          type: "shopping",
          action: "create",
          details: `${newName.trim()}${qtyInfo}`
        });
      }

      setNewName("");
      setNewQuantity("1");
      setNewUnit("");
      toast.success("Article ajouté");
      
      // Force a re-fetch for immediate feedback if listener is slow
      const { data } = await supabase.from('shopping_list').select('*').order('created_at', { ascending: false });
      if (data) setItems(data); // Simple update will be corrected by aggregation listener
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error("Erreur lors de l'ajout");
    }
  };

  const toggleItem = async (id: string, checked: boolean) => {
    if (user?.uid === 'neutral') {
      toast.error("Veuillez changer de profil pour cocher des articles.");
      return;
    }
    try {
      // Optimistic update
      setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !checked } : item));
      
      const supabase = getSupabase();
      const { error: updateError } = await supabase
        .from('shopping_list')
        .update({ checked: !checked })
        .eq('id', id);

      if (updateError) throw updateError;

      if (familyId && user && !checked) {
        const item = items.find(i => i.id === id);
        logActivity({
          familyId,
          userId: user.uid,
          userName: user.displayName || "Membre",
          userPhoto: user.photoURL,
          type: "shopping",
          action: "complete",
          details: `${item?.name || "un article"}`
        });
      }
    } catch (error) {
      console.error("Error toggling item:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const deleteItem = async (id: string) => {
    if (user?.uid === 'neutral') {
      toast.error("L'utilisateur Maison ne peut pas supprimer d'articles.");
      return;
    }
    try {
      // Optimistic update
      setItems(prev => prev.filter(item => item.id !== id));
      
      const supabase = getSupabase();
      const { error: deleteError } = await supabase
        .from('shopping_list')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      
      if (familyId && user) {
        const item = items.find(i => i.id === id);
        logActivity({
          familyId,
          userId: user.uid,
          userName: user.displayName || "Membre",
          userPhoto: user.photoURL,
          type: "shopping",
          action: "delete",
          details: `${item?.name || "un article"}`
        });
      }
      toast.success("Article supprimé");
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  if (isCompact) {
    const unchecked = items.filter(i => !i.checked);
    return (
      <div className="flex flex-col h-full p-4 relative group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm">Courses</h3>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
            {unchecked.length}
          </span>
        </div>

        <div className="flex-1 space-y-2 overflow-hidden">
          {unchecked.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs text-slate-200 truncate flex-1">{item.name}</span>
              {item.quantity && <span className="text-[10px] text-slate-500 shrink-0">{item.quantity}</span>}
            </div>
          ))}
          {unchecked.length > 3 && (
            <div className="text-[10px] text-slate-500 text-center py-1">
              + {unchecked.length - 3} autres articles
            </div>
          )}
          {unchecked.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 italic text-[10px]">
              <CheckCircle className="w-8 h-8 opacity-20" />
              Liste vide
            </div>
          )}
        </div>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Cliquer pour gérer
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Erreur de connexion</h3>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">{error}</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()} className="glass border-white/10">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 transition-all">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <ShoppingCart className="w-6 h-6 text-[#50e3c2]" />
        <h2 className="text-xl font-bold tracking-tight text-white">Courses</h2>
      </div>

      {/* Add item form - integrated style */}
      <form onSubmit={addItem} className="flex gap-3 mb-6 shrink-0 relative">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ajouter un article..."
          className="bg-white/10 border-white/5 h-14 px-6 rounded-2xl text-base placeholder:text-white/20 focus:bg-white/15 focus:ring-0 focus:border-white/10 transition-all flex-1 shadow-inner"
        />
        <button 
          type="submit" 
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#50e3c2] hover:bg-[#45d1b1] text-white rounded-xl shadow-lg flex items-center justify-center transition-all active:scale-90"
        >
          <Plus className="w-6 h-6" />
        </button>
      </form>

      {/* Item list */}
      <ScrollArea className="flex-1 pr-6 -mr-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-xs font-bold tracking-widest uppercase">Chargement...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300",
                  item.checked
                    ? "bg-white/5 border-white/5 opacity-40 shadow-inner"
                    : "bg-white/10 border-white/10 shadow-lg hover:bg-white/15"
                )}
              >
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={() => toggleItem(item.id, item.checked)}
                  className="w-6 h-6 border-white/20 rounded-lg data-[state=checked]:bg-[#50e3c2] data-[state=checked]:border-[#50e3c2]"
                />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-base font-medium transition-all truncate text-white",
                    item.checked && "line-through opacity-50"
                  )}>
                    {item.name}
                  </div>
                  {(item.quantity || item.unit) && (
                    <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                      {item.quantity} {item.unit}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-white/20 hover:text-red-400 p-2 transition-all shrink-0 hover:scale-110"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-center py-20 text-white/20 italic font-medium">
                Aucun article dans la liste.
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
