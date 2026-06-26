import { useEffect, useRef, useState, useMemo } from "react";
import MemoView from "@/components/MemoView";
import MemoEditor from "@/components/MemoEditor";
import PagedMemoList from "@/components/PagedMemoList";
import PersonalDashboard from "@/components/custom/PersonalDashboard";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

type TagFilterMode = "all" | "mine" | "ai";

const AI_TAGS = ["ai/task"];

const Home = () => {
  const user = useCurrentUser();
  const { isInitialized } = useInstance();
  const hasScrolled = useRef(false);
  const [tagFilter, setTagFilter] = useState<TagFilterMode>(() => {
    return (localStorage.getItem("home_tag_filter") as TagFilterMode) || "all";
  });

  // Persist filter choice
  const handleFilterChange = (mode: TagFilterMode) => {
    setTagFilter(mode);
    localStorage.setItem("home_tag_filter", mode);
  };

  // Tag filter options based on mode
  const tagFilterOptions = useMemo(() => {
    switch (tagFilter) {
      case "mine":
        return { excludeTags: AI_TAGS };
      case "ai":
        return { includeTags: AI_TAGS };
      default:
        return {};
    }
  }, [tagFilter]);

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeShortcuts: true,
    includePinned: true,
    ...tagFilterOptions,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  // Auto-scroll to bottom: use MutationObserver to detect when DOM is rendered
  useEffect(() => {
    if (hasScrolled.current || !isInitialized) return;

    const observer = new MutationObserver(() => {
      // Check if memo content has been rendered (look for memo cards)
      const memoCards = document.querySelectorAll('[data-memo-id]');
      if (memoCards.length > 0) {
        observer.disconnect();
        requestAnimationFrame(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
          hasScrolled.current = true;
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback: scroll after 1.5s even if observer doesn't fire
    const fallback = setTimeout(() => {
      if (!hasScrolled.current) {
        observer.disconnect();
        window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
        hasScrolled.current = true;
      }
    }, 1500);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [isInitialized]);

  const filterButtons: { key: TagFilterMode; label: string; icon: string }[] = [
    { key: "all", label: "Tất cả", icon: "📋" },
    { key: "mine", label: "Của tôi", icon: "👤" },
    { key: "ai", label: "AI", icon: "🤖" },
  ];

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

      {/* BOTTOM SECTION — Dashboard + Editor */}
      <div className="w-full max-w-full mx-auto px-2 sm:px-4 lg:px-8 mt-4 pb-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <PersonalDashboard />

        {/* Tag filter + Editor */}
        <div className="mt-4">
          {/* Tag filter bar */}
          <div className="flex items-center gap-1.5 mb-2">
            {filterButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => handleFilterChange(btn.key)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 border ${
                  tagFilter === btn.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <span>{btn.icon}</span>
                <span>{btn.label}</span>
              </button>
            ))}
          </div>

          <MemoEditor
            className="shadow-sm border-2 border-border"
            cacheKey="home-memo-editor"
            placeholder="Ghi nhật ký, chat với hệ thống..."
          />
        </div>
      </div>
    </div>
  );
};

export default Home;
