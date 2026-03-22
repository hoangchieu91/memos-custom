import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { userServiceClient } from "@/connect";
import { useView } from "@/contexts/ViewContext";
import { DEFAULT_LIST_MEMOS_PAGE_SIZE } from "@/helpers/consts";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

// Removed useTranslate as it's no longer used
import type { MemoRenderContext } from "../MasonryView";
import MasonryView from "../MasonryView";
import MemoFilters from "../MemoFilters";
import Skeleton from "../Skeleton";

interface Props {
  renderer: (memo: Memo, context?: MemoRenderContext) => JSX.Element;
  listSort?: (list: Memo[]) => Memo[];
  state?: State;
  orderBy?: string;
  filter?: string;
  pageSize?: number;
  showCreator?: boolean;
  enabled?: boolean;
}

function useAutoFetchWhenNotScrollable({
  hasNextPage,
  isFetchingNextPage,
  memoCount,
  onFetchNext,
}: {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  memoCount: number;
  onFetchNext: () => Promise<unknown>;
}) {
  const autoFetchTimeoutRef = useRef<number | null>(null);

  const isPageScrollable = useCallback(() => {
    const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    return documentHeight > window.innerHeight + 100;
  }, []);

  const checkAndFetchIfNeeded = useCallback(async () => {
    if (autoFetchTimeoutRef.current) {
      clearTimeout(autoFetchTimeoutRef.current);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    const shouldFetch = !isPageScrollable() && hasNextPage && !isFetchingNextPage && memoCount > 0;

    if (shouldFetch) {
      await onFetchNext();

      autoFetchTimeoutRef.current = window.setTimeout(() => {
        void checkAndFetchIfNeeded();
      }, 500);
    }
  }, [hasNextPage, isFetchingNextPage, memoCount, isPageScrollable, onFetchNext]);

  useEffect(() => {
    if (!isFetchingNextPage && memoCount > 0) {
      void checkAndFetchIfNeeded();
    }
  }, [memoCount, isFetchingNextPage, checkAndFetchIfNeeded]);

  useEffect(() => {
    return () => {
      if (autoFetchTimeoutRef.current) {
        clearTimeout(autoFetchTimeoutRef.current);
      }
    };
  }, []);
}

const PagedMemoList = (props: Props) => {
  const { layout } = useView();
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteMemos(
    {
      state: props.state || State.NORMAL,
      orderBy: props.orderBy || "display_time desc",
      filter: props.filter,
      pageSize: props.pageSize || DEFAULT_LIST_MEMOS_PAGE_SIZE,
    },
    { enabled: props.enabled ?? true },
  );

  // Flatten pages into a single array of memos
  const memos = useMemo(() => data?.pages.flatMap((page) => page.memos) || [], [data]);

  // Apply custom sorting if provided, otherwise use memos directly
  // REVERSE THE LIST FOR CHAT UI (Newest at bottom)
  const sortedMemoList = useMemo(() => {
    const list = props.listSort ? props.listSort(memos) : memos;
    return list.slice().reverse();
  }, [memos, props.listSort]);

  // Prefetch creators when new data arrives to improve performance
  useEffect(() => {
    if (!data?.pages || !props.showCreator) return;

    const lastPage = data.pages[data.pages.length - 1];
    if (!lastPage?.memos) return;

    const uniqueCreators = Array.from(new Set(lastPage.memos.map((memo) => memo.creator)));
    for (const creator of uniqueCreators) {
      void queryClient.prefetchQuery({
        queryKey: userKeys.detail(creator),
        queryFn: async () => {
          const user = await userServiceClient.getUser({ name: creator });
          return user;
        },
        staleTime: 1000 * 60 * 5,
      });
    }
  }, [data?.pages, props.showCreator, queryClient]);

  // Auto-fetch hook: fetches more content when page isn't scrollable
  useAutoFetchWhenNotScrollable({
    hasNextPage,
    isFetchingNextPage,
    memoCount: sortedMemoList.length,
    onFetchNext: fetchNextPage,
  });

  // Infinite scroll: fetch more when user scrolls near TOP (for chat layout)
  useEffect(() => {
    if (!hasNextPage) return;

    const handleScroll = () => {
      const nearTop = window.scrollY <= 300;
      if (nearTop && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-scroll to bottom on initial load (Page 1)
  useEffect(() => {
    if (sortedMemoList.length > 0 && data?.pages?.length === 1 && !isFetchingNextPage) {
      const isMobile = window.innerWidth <= 768;
      setTimeout(() => {
         window.scrollTo({ top: document.body.scrollHeight, behavior: isMobile ? 'auto' : 'smooth' });
      }, 300);
    }
  }, [sortedMemoList.length, data?.pages?.length, isFetchingNextPage]);

  const children = (
    <div className="flex flex-col justify-start items-start w-full max-w-full pb-8">
      {/* Show skeleton loader during initial load */}
      {isLoading ? (
        <Skeleton showCreator={props.showCreator} count={4} />
      ) : (
        <>
          {/* LOAD MORE TOP: Loading indicator for pagination (Chat style) */}
          <div className="w-full flex justify-center items-center py-4 mb-4 border-b border-border">
            {isFetchingNextPage ? (
               <Skeleton showCreator={props.showCreator} count={2} />
            ) : hasNextPage ? (
               <Button variant="ghost" onClick={() => fetchNextPage()}>Tải thêm lịch sử</Button>
            ) : (
               <span className="text-muted-foreground text-sm opacity-50">Hết dữ liệu lịch sử</span>
            )}
          </div>

          <MasonryView
            memoList={sortedMemoList}
            renderer={props.renderer}
            prefixElement={<MemoFilters />}
            listMode={layout === "LIST"}
          />
        
        </>
      )}
    </div>
  );

  return children;
};

export default PagedMemoList;
