/**
 * FloatingHub — A single draggable FAB that expands into sub-buttons.
 *
 * Sub-actions:
 *  - Quick check-in (GPS) — 6 actions
 *  - Clipboard quick-paste (mini textarea popup)
 *  - AI Chat panel toggle
 *  - Focus/Zen mode toggle
 *
 * Features:
 *  - Draggable (touch + mouse)
 *  - Click expands/collapses sub-buttons
 *  - Position persisted in localStorage
 *  - Auto-close after 5s idle
 *  - Daily check-in badge on FAB
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  ZapIcon,
  XIcon,
  BrainCircuitIcon,
  FocusIcon,
  LoaderIcon,
  Building2Icon,
  CarIcon,
  HomeIcon,
  PersonStandingIcon,
  HardHatIcon,
  FlagIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { useCreateMemo, useUpdateMemo, useInfiniteMemos } from "@/hooks/useMemoQueries";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { State } from "@/types/proto/api/v1/common_pb";
import toast from "react-hot-toast";
import ContributionHeatmap from "./ContributionHeatmap";
import PurchaseTemplateModal from "./PurchaseTemplateModal";

// ============================================================================
// Types & Config
// ============================================================================

interface SubAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  emoji?: string;
  color: string;
  action: () => void;
}

const STORAGE_KEY = "floating-hub-pos";
const DEFAULT_POS = { x: -1, y: -1 };

const CHECKIN_ACTIONS = [
  { label: "Đến cty", icon: <Building2Icon className="w-4 h-4" />, emoji: "🏢", color: "bg-blue-500" },
  { label: "Rời cty", icon: <CarIcon className="w-4 h-4" />, emoji: "🚗", color: "bg-orange-500" },
  { label: "Về nhà", icon: <HomeIcon className="w-4 h-4" />, emoji: "🏠", color: "bg-green-500" },
  { label: "Ra khỏi nhà", icon: <PersonStandingIcon className="w-4 h-4" />, emoji: "🚶", color: "bg-amber-500" },
  { label: "Tới dự án", icon: <HardHatIcon className="w-4 h-4" />, emoji: "🚧", color: "bg-cyan-500" },
  { label: "Rời dự án", icon: <FlagIcon className="w-4 h-4" />, emoji: "🏁", color: "bg-rose-500" },
];

// ============================================================================
// Component
// ============================================================================

export const FloatingHub = ({
  onOpenAI,
  onOpenFocus,
}: {
  onOpenAI: () => void;
  onOpenFocus: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: -100, y: -100 }); // Render offscreen initially to avoid flash
  const [isHovered, setIsHovered] = useState(false);

  // Purchase Template State
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const hubRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const hasMoved = useRef(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();

  // Count today's check-ins for badge
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: checkinData } = useInfiniteMemos({
    filter: "tag in ['checkin']",
    pageSize: 20,
    state: State.NORMAL,
  });
  const todayCheckins = (checkinData?.pages?.[0]?.memos || []).filter((m) => {
    try {
      const secs = Number(m.createTime?.seconds ?? 0);
      return new Date(secs * 1000).toISOString().slice(0, 10) === todayStr;
    } catch { return false; }
  }).length;

  // Load position from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.x === "number" && typeof p.y === "number") {
          setPosition(p);
          return;
        }
      }
    } catch {}
    // Default bottom-right corner
    setPosition({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
  }, []);

  // Auto-close after 5 seconds of idle
  useEffect(() => {
    if (isOpen) {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
      autoCloseRef.current = setTimeout(() => {
        setIsOpen(false);
        setShowPurchaseModal(false);
      }, 8000);
    }
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, [isOpen, showPurchaseModal]);

  // Reset auto-close timer on any interaction
  const resetAutoClose = useCallback(() => {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(() => {
      setIsOpen(false);
      setShowPurchaseModal(false);
    }, 8000);
  }, []);

  const savePosition = useCallback((p: { x: number; y: number }) => {
    setPosition(p);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }, []);

  const snapToCorner = useCallback((x: number, y: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isLeft = x < w / 2;
    const isTop = y < h / 2;
    return {
      x: isLeft ? 24 : w - 80,
      y: isTop ? 80 : h - 80, // 80 ensures mobile/desktop headers are cleared
    };
  }, []);

  // ===================== DRAG HANDLERS =====================

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      hasMoved.current = false;
      const rect = hubRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragStart.current = { x: e.clientX, y: e.clientY, posX: rect.left, posY: rect.top };
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current || !isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved.current = true;
      const newX = Math.max(0, Math.min(window.innerWidth - 56, dragStart.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 56, dragStart.current.posY + dy));
      savePosition({ x: newX, y: newY });
    },
    [isDragging, savePosition]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
    if (!hasMoved.current) {
      setIsOpen((prev) => !prev);
    } else {
      // Snap to corner on release
      setPosition((prev) => {
        const newPos = snapToCorner(prev.x, prev.y);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos));
        return newPos;
      });
    }
  }, [snapToCorner]);

  // ===================== CHECK-IN ACTION =====================

  const handleCheckin = useCallback(
    (label: string, emoji: string) => {
      if (!navigator.geolocation) {
        toast.error("Trình duyệt không hỗ trợ GPS");
        return;
      }
      setLoadingAction(label);
      resetAutoClose();
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            let address = "Vị trí không xác định";
            try {
              const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
              );
              const data = await res.json();
              address = data.display_name || address;
            } catch {}
            const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
            const content = `#checkin Thực hiện: ${emoji} **${label}**\n📍 Tại: ${address}\n[Google Maps](${mapLink})`;

            await createMemo.mutateAsync({ content, visibility: Visibility.PRIVATE } as unknown as Memo);
            toast.success(`${emoji} ${label} — đã check-in!`);
            setIsOpen(false);
          } catch {
            toast.error("Lỗi tạo ghi chú check-in");
          } finally {
            setLoadingAction(null);
          }
        },
        (err) => {
          toast.error(err.code === err.PERMISSION_DENIED ? "Cho phép quyền GPS!" : `Lỗi GPS: ${err.message}`);
          setLoadingAction(null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    [createMemo, resetAutoClose]
  );

  // ===================== PURCHASE TEMPLATE =====================

  const handlePurchaseSubmit = useCallback(async (content: string) => {
    resetAutoClose();
    try {
      await createMemo.mutateAsync({ content } as any);
      setShowPurchaseModal(false);
      setIsOpen(false);
    } catch {
      toast.error("Lỗi khi tạo ghi chú mua sắm");
      throw new Error("Failed");
    }
  }, [createMemo, resetAutoClose]);

  // ===================== SUB-ACTIONS =====================

  const subActions: SubAction[] = [
    ...CHECKIN_ACTIONS.map((a) => ({
      id: a.label,
      label: a.label,
      icon: a.icon,
      emoji: a.emoji,
      color: a.color,
      action: () => handleCheckin(a.label, a.emoji),
    })),
    {
      id: "purchase",
      label: "Khai báo mua sắm",
      icon: <ShoppingCartIcon className="w-4 h-4" />,
      color: "bg-emerald-500",
      action: () => {
        setShowPurchaseModal((prev) => !prev);
        resetAutoClose();
      },
    },
    {
      id: "ai",
      label: "Hỏi AI",
      icon: <BrainCircuitIcon className="w-4 h-4" />,
      color: "bg-violet-500",
      action: () => { onOpenAI(); setIsOpen(false); },
    },
    {
      id: "focus",
      label: "Focus",
      icon: <FocusIcon className="w-4 h-4" />,
      color: "bg-emerald-600",
      action: () => { onOpenFocus(); setIsOpen(false); },
    },
  ];

  // ===================== POSITIONING =====================

  const getStyle = (): React.CSSProperties => {
    if (position.x === -1) {
      return { position: "fixed", bottom: 80, right: 24, zIndex: 9998 };
    }
    return { position: "fixed", left: position.x, top: position.y, zIndex: 9998 };
  };

  // ===================== RENDER =====================

  return (
    <>
      {/* Backdrop when open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9997] bg-black/20 backdrop-blur-[1px]"
          onClick={() => { setIsOpen(false); setShowPurchaseModal(false); }}
        />
      )}

      <div
        ref={hubRef}
        style={getStyle()}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        className="transition-transform duration-100"
      >
        {/* Sub-buttons */}
        {isOpen && (
          <div className="absolute bottom-14 right-0 flex flex-col-reverse gap-2 items-end animate-in fade-in slide-in-from-bottom-4 duration-200" style={{ maxWidth: 'calc(100vw - 32px)' }}>
            {subActions.map((action) => (
              <button
                key={action.id}
                onClick={() => { action.action(); resetAutoClose(); }}
                disabled={loadingAction !== null}
                className={`flex items-center gap-2 px-3 py-2 ${action.color} text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-xs font-medium whitespace-nowrap`}
                title={action.label}
              >
                {loadingAction === action.id ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  action.icon
                )}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
        <PurchaseTemplateModal 
          isOpen={showPurchaseModal} 
          onClose={() => setShowPurchaseModal(false)}
          createMemo={handlePurchaseSubmit}
        />

        {/* Main FAB */}
        <div className={`relative pointer-events-auto transition-opacity duration-300 ${!isHovered && !isOpen ? "opacity-50" : "opacity-100"}`}>
          <button
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 touch-none select-none border border-white/10 ${
              isOpen
                ? "bg-zinc-700 text-white rotate-45 scale-110"
                : "bg-gradient-to-br from-violet-600 to-indigo-500 text-white hover:scale-110 shadow-violet-500/30 shadow-xl"
            } ${isDragging ? "scale-110 shadow-2xl cursor-grabbing" : "cursor-grab"}`}
            title="Fast Action"
          >
            {isOpen ? <XIcon className="w-6 h-6" /> : <ZapIcon className="w-6 h-6" />}
          </button>

          {/* Daily check-in badge */}
          {!isOpen && todayCheckins > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow border-2 border-background pointer-events-none">
              {todayCheckins}
            </span>
          )}
        </div>
      </div>
    </>
  );
};

export default FloatingHub;
