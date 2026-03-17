import { useEffect, useRef } from "react";
import MemoView from "@/components/MemoView";
import MemoEditor from "@/components/MemoEditor";
import PagedMemoList from "@/components/PagedMemoList";
import PersonalDashboard from "@/components/PersonalDashboard";
import FocusZenMode from "@/components/FocusZenMode";
import VoiceToText from "@/components/VoiceToText";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

const Home = () => {
  const user = useCurrentUser();
  const { isInitialized } = useInstance();
  const hasScrolled = useRef(false);

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeShortcuts: true,
    includePinned: true,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  // Auto-scroll to bottom on initial load (newest memos are at bottom, chat-style)
  useEffect(() => {
    if (!hasScrolled.current && isInitialized) {
      const timer = setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        hasScrolled.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  return (
    <div className="w-full min-h-full bg-background text-foreground">
      {/* Memo list — oldest at top, newest at bottom (chat-style) */}
      <PagedMemoList
        renderer={(memo: Memo) => <MemoView key={`${memo.name}-${memo.displayTime}`} memo={memo} showVisibility showPinned compact />}
        listSort={listSort}
        orderBy={orderBy}
        filter={memoFilter}
        enabled={isInitialized}
      />

      {/* BOTTOM SECTION — Dashboard + Editor, rendered OUTSIDE masonry grid to avoid overlap */}
      <div className="w-full max-w-2xl mx-auto px-2 mt-4 pb-4">
        <PersonalDashboard />
        <MemoEditor
          className="mt-4 shadow-sm border-emerald-200 dark:border-emerald-800 border-2"
          cacheKey="home-memo-editor"
          placeholder="Ghi nhật ký, chat với hệ thống..."
        />
      </div>

      <FocusZenMode />
      <VoiceToText />
    </div>
  );
};

export default Home;
