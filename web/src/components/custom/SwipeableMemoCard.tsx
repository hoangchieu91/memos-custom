import { useCallback, useRef, useState } from "react";
import { EditIcon, TrashIcon, PinIcon, ArchiveIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLongPress } from "@/hooks/useTouchGestures";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface SwipeableMemoCardProps {
  children: React.ReactNode;
  memo: Memo;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onArchive?: () => void;
}

/**
 * Wraps a memo card with:
 * - Swipe left to reveal action buttons
 * - Long press to open detail page
 */
export const SwipeableMemoCard = ({ children, memo, onEdit, onDelete, onPin, onArchive }: SwipeableMemoCardProps) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const navigate = useNavigate();

  const ACTION_WIDTH = 200; // px to reveal all buttons

  // Long press → navigate to detail page
  const longPressHandlers = useLongPress(
    useCallback(() => {
      navigate(`/${memo.name}`);
    }, [memo.name, navigate]),
    500,
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isDragging.current = false;
    longPressHandlers.onTouchStart();
  }, [longPressHandlers]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      longPressHandlers.onTouchMove();
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      // Only start dragging if horizontal > vertical
      if (!isDragging.current && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isDragging.current = true;
      }

      if (isDragging.current) {
        // Only allow swiping left (negative deltaX)
        const offset = isRevealed
          ? Math.max(-ACTION_WIDTH, Math.min(0, deltaX - ACTION_WIDTH))
          : Math.max(-ACTION_WIDTH, Math.min(0, deltaX));
        setSwipeOffset(offset);
      }
    },
    [isRevealed],
  );

  const handleTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      longPressHandlers.onTouchEnd();
      if (!isDragging.current) return;

      // Snap: if swiped more than half, reveal; otherwise close
      if (Math.abs(swipeOffset) > ACTION_WIDTH / 2) {
        setSwipeOffset(-ACTION_WIDTH);
        setIsRevealed(true);
      } else {
        setSwipeOffset(0);
        setIsRevealed(false);
      }
      isDragging.current = false;
    },
    [swipeOffset, longPressHandlers],
  );

  const closeSwipe = useCallback(() => {
    setSwipeOffset(0);
    setIsRevealed(false);
  }, []);

  const actions = [
    { icon: <EditIcon className="w-4 h-4" />, label: "Sửa", color: "bg-blue-500", onClick: () => { closeSwipe(); onEdit?.(); } },
    { icon: <PinIcon className="w-4 h-4" />, label: "Ghim", color: "bg-amber-500", onClick: () => { closeSwipe(); onPin?.(); } },
    { icon: <ArchiveIcon className="w-4 h-4" />, label: "Lưu trữ", color: "bg-gray-500", onClick: () => { closeSwipe(); onArchive?.(); } },
    { icon: <TrashIcon className="w-4 h-4" />, label: "Xóa", color: "bg-red-500", onClick: () => { closeSwipe(); onDelete?.(); } },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl md:overflow-visible">
      {/* Action buttons behind the card */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-stretch md:hidden"
        style={{ width: ACTION_WIDTH }}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={`${action.color} flex-1 flex flex-col items-center justify-center text-white text-[10px] font-medium gap-1 active:opacity-80 transition-opacity`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* Swipeable card content */}
      <div
        className="relative bg-background transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isDragging.current ? "none" : "transform 0.2s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableMemoCard;
