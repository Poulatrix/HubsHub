import React, { useState, useEffect, useMemo, useRef } from "react";
import { Responsive } from "react-grid-layout/legacy";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  GripVertical,
  Trash2,
  ExternalLink,
  Settings2,
  Check,
  LayoutDashboard,
  Globe,
  ShoppingBag,
  MessageSquare,
  Calendar as CalendarIcon,
  CloudSun,
  Clock as ClockIcon,
  CheckCircle,
  Bell,
  Edit2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, handleFileUpload } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { Clock } from "./Clock";
import { Weather } from "./Weather";
import { Wall } from "./Wall";
import { ShoppingList } from "./ShoppingList";
import { TodoList } from "./TodoList";
import { FamilyCalendar } from "./FamilyCalendar";
import { ActivityFeed } from "./ActivityFeed";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

import "/node_modules/react-grid-layout/css/styles.css";
import "/node_modules/react-resizable/css/styles.css";

const ResponsiveGridLayout = Responsive as any;

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    if (!ref.current) return;
    setWidth(ref.current.getBoundingClientRect().width || window.innerWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export interface DashboardItem {
  id: string;
  type: "module" | "link";
  moduleId?: string;
  url?: string;
  name?: string;
  customIcon?: string;
  settings?: Record<string, any>;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_SAAS_SHORTCUTS: DashboardItem[] = [
  {
    id: "saas-calendar",
    type: "link",
    name: "Google Agenda",
    url: "https://calendar.google.com",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  },
  {
    id: "saas-drive",
    type: "link",
    name: "Google Drive",
    url: "https://drive.google.com",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  },
  {
    id: "saas-netflix",
    type: "link",
    name: "Netflix",
    url: "https://www.netflix.com",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  },
  {
    id: "saas-spotify",
    type: "link",
    name: "Spotify",
    url: "https://open.spotify.com",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  },
  {
    id: "saas-notion",
    type: "link",
    name: "Notion",
    url: "https://www.notion.so",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  },
];

const DEFAULT_MODULES: DashboardItem[] = [
  { id: "calendar", type: "module", moduleId: "calendar", x: 0, y: 0, w: 2, h: 2 },
  { id: "wall", type: "module", moduleId: "wall", x: 2, y: 0, w: 2, h: 2 },
  { id: "shopping", type: "module", moduleId: "shopping", x: 0, y: 2, w: 2, h: 2 },
  { id: "weather", type: "module", moduleId: "weather", x: 2, y: 2, w: 1, h: 2 },
  { id: "todos", type: "module", moduleId: "todos", x: 3, y: 2, w: 1, h: 2 },
];

const DEFAULT_LAYOUT: DashboardItem[] = [
  ...DEFAULT_SAAS_SHORTCUTS,
  ...DEFAULT_MODULES,
];

const MODULE_TYPES = [
  {
    id: "calendar",
    name: "Planning",
    icon: <CalendarIcon className="w-5 h-5" />,
    defaultW: 2,
    defaultH: 2,
  },
  {
    id: "wall",
    name: "Mur Familial",
    icon: <MessageSquare className="w-5 h-5" />,
    defaultW: 2,
    defaultH: 2,
  },
  {
    id: "shopping",
    name: "Courses",
    icon: <ShoppingBag className="w-5 h-5" />,
    defaultW: 2,
    defaultH: 2,
  },
  {
    id: "todos",
    name: "Tâches",
    icon: <CheckCircle className="w-5 h-5" />,
    defaultW: 1,
    defaultH: 2,
  },
  {
    id: "weather",
    name: "Météo",
    icon: <CloudSun className="w-5 h-5" />,
    defaultW: 1,
    defaultH: 2,
  },
  {
    id: "clock",
    name: "Horloge",
    icon: <ClockIcon className="w-5 h-5" />,
    defaultW: 1,
    defaultH: 1,
  },
  {
    id: "notifications",
    name: "Activité",
    icon: <Bell className="w-5 h-5" />,
    defaultW: 2,
    defaultH: 2,
  },
];

function ShortcutTile({
  item,
  isEditMode,
  onEdit,
  onDelete,
}: {
  item: DashboardItem;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  const hostname = useMemo(() => {
    try {
      return new URL(item.url || "https://google.com").hostname;
    } catch {
      return "";
    }
  }, [item.url]);

  const iconUrl =
    item.customIcon ||
    (hostname
      ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`
      : "");

  return (
    <div className="relative group">
      <a
        href={isEditMode ? undefined : item.url}
        target={isEditMode ? undefined : "_blank"}
        rel={isEditMode ? undefined : "noopener noreferrer"}
        onClick={(e) => {
          if (isEditMode) {
            e.preventDefault();
            onEdit();
          }
        }}
        className={cn(
          "flex items-center gap-3 p-3 rounded-2xl glass border-white/15 hover:bg-white/15 hover:border-white/30 transition-all duration-200 cursor-pointer min-h-[60px]",
          isEditMode && "ring-1 ring-blue-400/50"
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 overflow-hidden p-1.5">
          {iconUrl && !imgError ? (
            <img
              src={iconUrl}
              alt={item.name || "Raccourci"}
              className="w-full h-full object-contain rounded-md"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          ) : (
            <Globe className="w-5 h-5 text-blue-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {item.name || hostname || "Service"}
          </div>
          <div className="text-[11px] text-white/45 truncate">
            {hostname.replace(/^www\./, "")}
          </div>
        </div>
        {!isEditMode && (
          <ExternalLink className="w-3.5 h-3.5 text-white/35 group-hover:text-white/80 transition-colors shrink-0" />
        )}
      </a>

      {isEditMode && (
        <div className="absolute -top-2 -right-2 flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Modifier le raccourci"
            className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Supprimer le raccourci"
            className="w-7 h-7 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function Dashboard({
  user,
  familyId,
  members,
  initialLayout,
  familyLocation,
  onTabSwitch,
}: {
  user: any;
  familyId: string;
  members: any[];
  initialLayout?: DashboardItem[];
  familyLocation?: string;
  onTabSwitch?: (tab: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useWidth(containerRef);

  const [layout, setLayout] = useState<DashboardItem[]>(() => {
    if (user.uid === "neutral" && familyId) {
      const saved = localStorage.getItem(`dashboardLayout_${familyId}_neutral`);
      if (saved) return JSON.parse(saved);
    }
    return initialLayout && initialLayout.length > 0
      ? initialLayout
      : DEFAULT_LAYOUT;
  });

  useEffect(() => {
    if (user.uid === "neutral" && familyId) {
      const saved = localStorage.getItem(`dashboardLayout_${familyId}_neutral`);
      if (saved) {
        setLayout(JSON.parse(saved));
        return;
      }
    }
    setLayout(
      initialLayout && initialLayout.length > 0 ? initialLayout : DEFAULT_LAYOUT
    );
  }, [initialLayout, user.uid, familyId]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<DashboardItem | null>(null);
  const [viewingModule, setViewingModule] = useState<DashboardItem | null>(null);
  const [newItemType, setNewItemType] = useState<"module" | "link">("link");
  const [selectedModule, setSelectedModule] = useState<string>("calendar");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [customIcon, setCustomIcon] = useState("");

  const userId = user.uid;

  const saasShortcuts = useMemo(
    () => layout.filter((item) => item.type === "link"),
    [layout]
  );

  const moduleItems = useMemo(
    () => layout.filter((item) => item.type === "module"),
    [layout]
  );

  const persistLayout = async (updatedItems: DashboardItem[]) => {
    setLayout(updatedItems);

    if (userId === "neutral") {
      if (familyId) {
        localStorage.setItem(
          `dashboardLayout_${familyId}_neutral`,
          JSON.stringify(updatedItems)
        );
      }
      return;
    }

    try {
      const isManaged = userId.startsWith("managed-");
      if (!isManaged && userId !== "neutral") {
        await updateDoc(doc(db, "users", userId), {
          dashboardLayout: updatedItems,
        });
      }
      if (familyId) {
        await updateDoc(doc(db, "families", familyId, "users", userId), {
          dashboardLayout: updatedItems,
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `families/${familyId}/users/${userId}`
      );
    }
  };

  const handleGridLayoutChange = async (newGridLayout: any[]) => {
    const updatedItems = layout.map((item) => {
      if (item.type !== "module") return item;
      const gridItem = newGridLayout.find((l) => l.i === item.id);
      if (gridItem) {
        return {
          ...item,
          x: gridItem.x,
          y: gridItem.y,
          w: gridItem.w,
          h: gridItem.h,
        };
      }
      return item;
    });
    await persistLayout(updatedItems);
  };

  const openAddDialog = (defaultType: "module" | "link") => {
    setNewItemType(defaultType);
    setSelectedModule("calendar");
    setLinkName("");
    setLinkUrl("");
    setCustomIcon("");
    setIsAddingItem(true);
  };

  const addItem = async () => {
    let newItem: DashboardItem;

    if (newItemType === "module") {
      const mod = MODULE_TYPES.find((m) => m.id === selectedModule);
      if (!mod) return;
      newItem = {
        id: `${mod.id}-${Date.now()}`,
        type: "module",
        moduleId: mod.id,
        x: 0,
        y: 99,
        w: mod.defaultW,
        h: mod.defaultH,
      };
    } else {
      let normalizedUrl = linkUrl.trim();
      if (!normalizedUrl) return;
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      let derivedName = linkName.trim();
      if (!derivedName) {
        try {
          derivedName = new URL(normalizedUrl).hostname.replace(/^www\./, "");
        } catch {
          derivedName = "Raccourci";
        }
      }
      newItem = {
        id: `link-${Date.now()}`,
        type: "link",
        url: normalizedUrl,
        name: derivedName,
        customIcon: customIcon.trim(),
        x: 0,
        y: 0,
        w: 1,
        h: 1,
      };
    }

    const updatedLayout = [...layout, newItem];
    setIsAddingItem(false);
    setLinkUrl("");
    setLinkName("");
    setCustomIcon("");

    await persistLayout(updatedLayout);
    toast.success(
      newItemType === "link" ? "Raccourci SaaS ajouté" : "Module ajouté"
    );
  };

  const removeItem = async (id: string) => {
    const updatedLayout = layout.filter((item) => item.id !== id);
    await persistLayout(updatedLayout);
    toast.success("Élément supprimé");
  };

  const updateLinkItem = async () => {
    if (!editingItem) return;
    let normalizedUrl = linkUrl.trim();
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const updatedLayout = layout.map((item) =>
      item.id === editingItem.id
        ? {
            ...item,
            name: linkName.trim() || item.name,
            url: normalizedUrl || item.url,
            customIcon: customIcon.trim(),
          }
        : item
    );

    setEditingItem(null);
    setLinkName("");
    setLinkUrl("");
    setCustomIcon("");
    await persistLayout(updatedLayout);
    toast.success("Raccourci mis à jour");
  };

  const renderModuleCard = (item: DashboardItem) => {
    const expandModule = () => setViewingModule(item);

    return (
      <div
        key={item.id}
        className={cn(
          "group relative h-full",
          isEditMode && "ring-1 ring-blue-400/40 rounded-[2rem]"
        )}
      >
        <div
          className="w-full h-full cursor-pointer transition-transform active:scale-[0.99]"
          onClick={() => {
            if (isEditMode) return;
            if (
              (item.moduleId === "shopping" || item.moduleId === "todos") &&
              onTabSwitch
            ) {
              onTabSwitch(item.moduleId);
              return;
            }
            expandModule();
          }}
        >
          <GlassCard className="w-full h-full p-0 overflow-hidden border-white/15 hover:border-white/25 transition-colors">
            <div className="w-full h-full">
              {item.moduleId === "clock" && <Clock />}
              {item.moduleId === "weather" && (
                <Weather familyLocation={familyLocation} isCompact={true} />
              )}
              {item.moduleId === "shopping" && (
                <ShoppingList
                  familyId={familyId}
                  user={user}
                  isCompact={true}
                />
              )}
              {item.moduleId === "todos" && (
                <TodoList
                  familyId={familyId}
                  user={user}
                  members={members}
                  hideAddForm={true}
                  isCompact={true}
                />
              )}
              {item.moduleId === "wall" && (
                <Wall
                  familyId={familyId}
                  user={user}
                  members={members}
                  isCompact={true}
                  onExpand={expandModule}
                />
              )}
              {item.moduleId === "calendar" && (
                <FamilyCalendar
                  familyId={familyId}
                  user={user}
                  isCompact={true}
                  onExpand={expandModule}
                />
              )}
              {item.moduleId === "notifications" && (
                <ActivityFeed familyId={familyId} isCompact={true} />
              )}
            </div>
          </GlassCard>
        </div>

        {isEditMode && (
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] z-20 rounded-[2rem] flex items-center justify-center gap-3 pointer-events-none">
            <div className="absolute top-3 left-3 p-2 bg-white/15 rounded-xl cursor-grab active:cursor-grabbing drag-handle pointer-events-auto">
              <GripVertical className="w-4 h-4 text-white" />
            </div>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full w-10 h-10 pointer-events-auto cursor-pointer shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item.id);
              }}
              aria-label="Supprimer le widget"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Responsive breakpoints based on measured container width
  const isDesktop = width >= 1024;
  const isTablet = width >= 640 && width < 1024;

  const gridLayouts = useMemo(() => {
    const lgLayout = moduleItems.map((item) => ({
      i: item.id,
      x: Math.min(item.x, 3),
      y: item.y,
      w: Math.min(item.w, 4),
      h: item.h,
      minW: 1,
      minH: 1,
    }));
    return { lg: lgLayout, md: lgLayout };
  }, [moduleItems]);

  const margin = 16;
  const currentCols = 4;
  const containerWidth = Math.max(width - margin * 2, 320);
  const colWidth = (containerWidth - margin * (currentCols - 1)) / currentCols;
  const rowHeight = Math.max(175, Math.round(colWidth * 0.92));

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-xl border border-white/10">
            <LayoutDashboard className="w-5 h-5 text-white/80" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight">
              Tableau de Bord
            </h2>
            <p className="text-xs text-white/50">
              Raccourcis SaaS, planning familial et mur de la maison
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {isEditMode ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-white/20 bg-white/10 hover:bg-white/20 text-white h-9 px-3.5 cursor-pointer"
                  onClick={() => setIsEditMode(false)}
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Terminer
                </Button>
              </motion.div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-white/70 hover:text-white hover:bg-white/10 h-9 px-3.5 cursor-pointer"
                onClick={() => setIsEditMode(true)}
              >
                <Settings2 className="w-4 h-4 mr-1.5" />
                Organiser
              </Button>
            )}
          </AnimatePresence>

          <Button
            type="button"
            size="sm"
            onClick={() => openAddDialog("link")}
            className="bg-blue-600 hover:bg-blue-500 rounded-xl text-white h-9 px-4 font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Main Section: SaaS Shortcuts */}
      <section aria-label="Raccourcis SaaS" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-300" />
            <h3 className="text-sm font-bold text-white/90">Raccourcis SaaS</h3>
            <span className="text-xs text-white/45 tabular-nums">
              · {saasShortcuts.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openAddDialog("link")}
            className="text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors cursor-pointer"
          >
            + Nouveau raccourci
          </button>
        </div>

        {saasShortcuts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {saasShortcuts.map((shortcut) => (
              <ShortcutTile
                key={shortcut.id}
                item={shortcut}
                isEditMode={isEditMode}
                onEdit={() => {
                  setEditingItem(shortcut);
                  setLinkName(shortcut.name || "");
                  setLinkUrl(shortcut.url || "");
                  setCustomIcon(shortcut.customIcon || "");
                }}
                onDelete={() => removeItem(shortcut.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl glass border border-dashed border-white/15">
            <span className="text-xs text-white/60">
              Aucun raccourci SaaS configuré pour le moment.
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => persistLayout([...DEFAULT_SAAS_SHORTCUTS, ...layout])}
                className="h-8 px-3 rounded-xl border-white/15 bg-white/5 hover:bg-white/15 text-xs text-white cursor-pointer"
              >
                Raccourcis par défaut
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => openAddDialog("link")}
                className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Ajouter
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Responsive Hub Modules Section */}
      <section aria-label="Modules familiaux">
        {isDesktop ? (
          <ResponsiveGridLayout
            className="layout"
            layouts={gridLayouts}
            width={width}
            breakpoints={{ lg: 1024, md: 900 }}
            cols={{ lg: 4, md: 4 }}
            rowHeight={rowHeight}
            draggableHandle=".drag-handle"
            isDraggable={isEditMode}
            isResizable={isEditMode}
            onLayoutChange={(currentLayout: any) => {
              if (isEditMode) handleGridLayoutChange(currentLayout);
            }}
            margin={[margin, margin]}
            containerPadding={[0, 0]}
            resizeHandles={["se"]}
          >
            {moduleItems.map((item) => (
              <div
                key={item.id}
                data-grid={{
                  x: Math.min(item.x, 3),
                  y: item.y,
                  w: Math.min(item.w, 4),
                  h: item.h,
                  minW: 1,
                  minH: 1,
                }}
              >
                {renderModuleCard(item)}
              </div>
            ))}
          </ResponsiveGridLayout>
        ) : isTablet ? (
          /* Tablet (iPad) clean 2-column Bento layout */
          <div className="grid grid-cols-2 gap-4">
            {moduleItems.map((item) => {
              const isWide =
                item.moduleId === "wall" || item.moduleId === "calendar";
              return (
                <div
                  key={item.id}
                  className={cn(
                    isWide ? "col-span-2 h-[340px]" : "col-span-1 h-[270px]"
                  )}
                >
                  {renderModuleCard(item)}
                </div>
              );
            })}
          </div>
        ) : (
          /* Mobile clean single-column stack */
          <div className="grid grid-cols-1 gap-4">
            {moduleItems.map((item) => {
              const isTall =
                item.moduleId === "wall" || item.moduleId === "calendar";
              return (
                <div
                  key={item.id}
                  className={cn(isTall ? "h-[330px]" : "h-[240px]")}
                >
                  {renderModuleCard(item)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Module or SaaS Shortcut Dialog */}
      <Dialog open={isAddingItem} onOpenChange={setIsAddingItem}>
        <DialogContent className="glass-dark border-white/15 text-white max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Ajouter au Hub</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex p-1 bg-white/5 rounded-xl gap-1">
              <button
                type="button"
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer",
                  newItemType === "link"
                    ? "bg-blue-600 text-white"
                    : "text-white/60 hover:text-white"
                )}
                onClick={() => setNewItemType("link")}
              >
                Raccourci SaaS
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer",
                  newItemType === "module"
                    ? "bg-blue-600 text-white"
                    : "text-white/60 hover:text-white"
                )}
                onClick={() => setNewItemType("module")}
              >
                Module Hub
              </button>
            </div>

            {newItemType === "module" ? (
              <div className="grid grid-cols-2 gap-3">
                {MODULE_TYPES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModule(mod.id)}
                    className={cn(
                      "flex flex-col items-center gap-2.5 p-4 rounded-2xl border transition-all cursor-pointer",
                      selectedModule === mod.id
                        ? "bg-blue-600/25 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-white/65 hover:bg-white/10"
                    )}
                  >
                    {mod.icon}
                    <span className="text-xs font-semibold">{mod.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/70">Nom du service</Label>
                  <Input
                    placeholder="ex: Google Agenda, Netflix, Pronote..."
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    className="bg-white/5 border-white/15 text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/70">URL</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input
                      placeholder="https://..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="bg-white/5 border-white/15 pl-10 text-white rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/70">
                    Icône personnalisée (optionnel)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={customIcon}
                      onChange={(e) => setCustomIcon(e.target.value)}
                      className="bg-white/5 border-white/15 text-white flex-1 rounded-xl"
                    />
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, setCustomIcon)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="bg-white/5 border-white/15 rounded-xl"
                      >
                        <Upload className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddingItem(false)}
              className="cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={addItem}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer"
              disabled={newItemType === "module" ? !selectedModule : !linkUrl.trim()}
            >
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit SaaS Shortcut Dialog */}
      <Dialog
        open={!!editingItem && editingItem.type === "link"}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="glass-dark border-white/15 text-white max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Modifier le raccourci SaaS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Nom du service</Label>
              <Input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                className="bg-white/5 border-white/15 text-white rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="bg-white/5 border-white/15 text-white rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">Icône (optionnel)</Label>
              <div className="flex gap-2">
                <Input
                  value={customIcon}
                  onChange={(e) => setCustomIcon(e.target.value)}
                  className="bg-white/5 border-white/15 text-white flex-1 rounded-xl"
                />
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, setCustomIcon)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="bg-white/5 border-white/15 rounded-xl"
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditingItem(null)}
              className="cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={updateLinkItem}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer"
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Module Detail Dialog */}
      <Dialog
        open={!!viewingModule}
        onOpenChange={(open) => !open && setViewingModule(null)}
      >
        <DialogContent className="glass-dark border-white/15 text-white max-w-4xl w-[95vw] h-[88vh] p-0 overflow-hidden flex flex-col rounded-3xl">
          {viewingModule && (
            <>
              <DialogHeader className="p-5 border-b border-white/10 shrink-0">
                <DialogTitle className="flex items-center gap-3 text-lg">
                  {
                    MODULE_TYPES.find((m) => m.id === viewingModule.moduleId)
                      ?.icon
                  }
                  {
                    MODULE_TYPES.find((m) => m.id === viewingModule.moduleId)
                      ?.name
                  }
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto bg-black/20">
                {viewingModule.moduleId === "clock" && (
                  <div className="h-full flex items-center justify-center p-12">
                    <Clock />
                  </div>
                )}
                {viewingModule.moduleId === "weather" && (
                  <Weather familyLocation={familyLocation} isCompact={false} />
                )}
                {viewingModule.moduleId === "shopping" && (
                  <ShoppingList
                    familyId={familyId}
                    user={user}
                    isCompact={false}
                  />
                )}
                {viewingModule.moduleId === "todos" && (
                  <TodoList
                    familyId={familyId}
                    user={user}
                    members={members}
                    hideAddForm={false}
                    isCompact={false}
                  />
                )}
                {viewingModule.moduleId === "wall" && (
                  <Wall
                    familyId={familyId}
                    user={user}
                    members={members}
                    isCompact={false}
                  />
                )}
                {viewingModule.moduleId === "calendar" && (
                  <FamilyCalendar
                    familyId={familyId}
                    user={user}
                    isCompact={false}
                  />
                )}
                {viewingModule.moduleId === "notifications" && (
                  <ActivityFeed familyId={familyId} isCompact={false} />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        .react-grid-placeholder {
          background: rgba(59, 130, 246, 0.15) !important;
          border-radius: 2rem !important;
          border: 1px dashed rgba(96, 165, 250, 0.4) !important;
        }
        .react-resizable-handle {
          opacity: 0;
          transition: opacity 0.2s;
        }
        .layout:hover .react-resizable-handle {
          opacity: 0.6;
        }
        .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 12px;
          bottom: 12px;
          width: 10px;
          height: 10px;
          border-right: 2px solid rgba(255,255,255,0.6);
          border-bottom: 2px solid rgba(255,255,255,0.6);
        }
      `}</style>
    </div>
  );
}
