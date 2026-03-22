import { BookmarkIcon, ExternalLinkIcon, StarIcon, Trash2Icon, PlusIcon, MousePointerClickIcon, Loader2Icon } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { useInfiniteMemos, useCreateMemo, useUpdateMemo, memoKeys } from "@/hooks/useMemoQueries";
import { useQueryClient } from "@tanstack/react-query";
import { State } from "@/types/proto/api/v1/common_pb";
import { timestampDate } from "@bufbuild/protobuf/wkt";

interface BookmarkEntry {
  uid: string;
  name: string;
  title: string;
  url: string;
  notes: string;
  clicks: number;
  isPinned: boolean;
  rawContent: string;
  createTime: Date;
  updateTime: Date;
}

const BookmarkManager = () => {
  const queryClient = useQueryClient();
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();

  // Load all NORMAL memos with #bookmark tag
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteMemos({
    filter: "tag in ['bookmark']",
    pageSize: 100,
  });

  // State for new bookmark form
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse memos into BookmarkEntry objects
  const bookmarks = useMemo(() => {
    if (!data?.pages) return [];

    const entries: BookmarkEntry[] = [];

    data.pages.forEach((page) => {
      page.memos.forEach((memo) => {
        // Skip archived/deleted
        if (memo.state !== State.NORMAL) return;

        const content = memo.content;
        
        // Extract Title and URL: format is usually [Title](URL)
        const linkMatch = content.match(/\[(.*?)\]\((.*?)\)/);
        let title = linkMatch ? linkMatch[1] : "Chưa có tiêu đề";
        const url = linkMatch ? linkMatch[2] : "";

        // Fallback for raw URLs if no markdown link format
        const rawUrlMatch = !linkMatch ? content.match(/(https?:\/\/[^\s]+)/) : null;
        const finalUrl = url || (rawUrlMatch ? rawUrlMatch[1] : "");
        if (!linkMatch && rawUrlMatch) title = finalUrl;

        // Extract notes: Everything after the tag, ignoring clicks metadata
        let notes = "";
        const notesMatch = content.match(/Ghi chú:\s*([\s\S]*?)(?=<!-- clicks:|$)/i);
        if (notesMatch) {
          notes = notesMatch[1].trim();
        } else {
           // Fallback if no "Ghi chú:" prefix
           notes = content.replace(/\[(.*?)\]\((.*?)\)/, "")
                          .replace(/#bookmark/g, "")
                          .replace(/<!-- clicks: \d+ -->/g, "")
                          .trim();
        }

        // Extract clicks
        let clicks = 0;
        const clickMatch = content.match(/<!-- clicks: (\d+) -->/);
        if (clickMatch) {
          clicks = parseInt(clickMatch[1], 10);
        }

        const createTime = memo.createTime ? timestampDate(memo.createTime) : new Date();

        entries.push({
          uid: memo.name.split("/")[1] || memo.name,
          name: memo.name,
          title,
          url: finalUrl,
          notes,
          clicks,
          isPinned: memo.pinned,
          rawContent: memo.content,
          createTime,
          updateTime: memo.updateTime ? timestampDate(memo.updateTime) : new Date(),
        });
      });
    });

    // Sort: Pinned first, then by clicks descending, then by updateTime descending
    return entries.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return b.updateTime.getTime() - a.updateTime.getTime();
    });
  }, [data]);

  // Auto-Archive Logic (30 days untouched & unpinned)
  useEffect(() => {
    if (!bookmarks.length) return;
    
    const now = dayjs();
    bookmarks.forEach(bookmark => {
      const daysOld = now.diff(bookmark.createTime, 'day');
      if (daysOld > 30 && !bookmark.isPinned) {
        // Auto archive
        toast(`Tự động lưu trữ bookmark cũ: ${bookmark.title}`, { icon: '📦' });
        updateMemo.mutate(
          {
            update: {
              name: bookmark.name,
              state: State.ARCHIVED
            },
            updateMask: ["state"]
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: memoKeys.all });
            }
          }
        );
      }
    });
  }, [bookmarks, updateMemo, queryClient]);

  const handleAddBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return toast.error("Vui lòng nhập Link URL");
    if (!newNotes.trim()) return toast.error("Bắt buộc phải có Ghi chú cho link này!");

    setIsSubmitting(true);
    
    const title = newTitle.trim() || newUrl.trim();
    const content = `[${title}](${newUrl})\n#bookmark\n\nGhi chú: ${newNotes.trim()}\n<!-- clicks: 0 -->`;

    createMemo.mutate(
      { content } as any,
      {
        onSuccess: () => {
          toast.success("Đã thêm Bookmark thành công!");
          setNewUrl("");
          setNewTitle("");
          setNewNotes("");
          setIsAdding(false);
          queryClient.invalidateQueries({ queryKey: memoKeys.all });
          setIsSubmitting(false);
        },
        onError: (err) => {
          toast.error("Lỗi khi thêm Bookmark: " + err.message);
          setIsSubmitting(false);
        }
      }
    );
  };

  const handleLinkClick = (bookmark: BookmarkEntry) => {
    // Increment click counter and update memo silently to bump it up
    const newClicks = bookmark.clicks + 1;
    let newContent = bookmark.rawContent;

    if (newContent.includes('<!-- clicks:')) {
      newContent = newContent.replace(/<!-- clicks: \d+ -->/, `<!-- clicks: ${newClicks} -->`);
    } else {
      newContent = `${newContent}\n<!-- clicks: ${newClicks} -->`;
    }

    updateMemo.mutate(
      {
        update: {
          name: bookmark.name,
          content: newContent
        },
        updateMask: ["content"]
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: memoKeys.all });
        }
      }
    );
  };

  const togglePin = (bookmark: BookmarkEntry) => {
    updateMemo.mutate(
      {
        update: {
          name: bookmark.name,
          pinned: !bookmark.isPinned
        },
        updateMask: ["pinned"]
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: memoKeys.all });
          toast.success(bookmark.isPinned ? "Đã bỏ ghim" : "Đã ghim bookmark!");
        }
      }
    );
  };

  const handleDelete = (bookmark: BookmarkEntry) => {
    if (confirm("Chắc chắn muốn lưu trữ (xóa) bookmark này?")) {
      updateMemo.mutate(
        {
          update: {
            name: bookmark.name,
            state: State.ARCHIVED
          },
          updateMask: ["state"]
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: memoKeys.all });
            toast.success("Đã lưu trữ Bookmark");
          }
        }
      );
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
            <BookmarkIcon className="w-8 h-8 text-blue-500" />
            Dấu trang (Bookmarks)
          </h1>
          <p className="text-muted-foreground mt-1">
            Lưu trữ link web hữu ích. Tự động Archive sau 30 ngày nếu không ghim.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all active:scale-95 font-medium"
        >
          {isAdding ? "Hủy" : <><PlusIcon className="w-5 h-5" /> Thêm Bookmark</>}
        </button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <form onSubmit={handleAddBookmark} className="bg-card w-full border rounded-2xl p-6 shadow-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <PlusIcon className="w-5 h-5 text-blue-500" /> Thêm Link Mới
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Đường dẫn (URL) *</label>
              <input
                type="url"
                required
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Tiêu đề (Tùy chọn)</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Tên trang web..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Ghi chú (Bắt buộc) *</label>
            <textarea
              required
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Giải thích vì sao bạn lưu link này, dùng để làm gì..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">Ví dụ: Mẫu giao diện UI rất đẹp để tham khảo cho dự án XYZ.</p>
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 border rounded-xl hover:bg-accent font-medium transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors flex items-center gap-2 font-medium disabled:opacity-50"
            >
              {isSubmitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : "Lưu Bookmark"}
            </button>
          </div>
        </form>
      )}

      {/* Bookmarks List */}
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="w-full flex justify-center py-10 opacity-50">
            <Loader2Icon className="w-8 h-8 animate-spin" />
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-dashed flex flex-col items-center justify-center opacity-60">
            <BookmarkIcon className="w-12 h-12 mb-3" />
            <p>Chưa có Bookmark nào được lưu.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bookmarks.map((b) => (
              <div
                key={b.uid}
                className={`group relative bg-card flex flex-col justify-between border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 outline outline-1 outline-transparent hover:outline-blue-500/20 ${
                  b.isPinned ? "ring-2 ring-yellow-400/50 bg-yellow-50/10" : ""
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleLinkClick(b)}
                      className="font-semibold text-lg hover:text-blue-600 flex-1 line-clamp-2 transition-colors flex items-start gap-2"
                    >
                      {b.title}
                      <ExternalLinkIcon className="w-4 h-4 mt-1 shrink-0 opacity-50 relative -top-0.5" />
                    </a>
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4 leading-relaxed bg-accent/30 p-2 rounded-lg border">
                    {b.notes || <span className="opacity-50 italic">Không có ghi chú...</span>}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t mt-auto">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5" title="Số lần truy cập">
                      <MousePointerClickIcon className="w-3.5 h-3.5" />
                      {b.clicks} lượt click
                    </span>
                    <span>•</span>
                    <span title="Cập nhật lần cuối">
                      {dayjs(b.updateTime).format("DD/MM/YYYY")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => togglePin(b)}
                      className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-yellow-500 transition-colors"
                      title={b.isPinned ? "Bỏ ghim" : "Ghim giữ lại"}
                    >
                      <StarIcon className={`w-4 h-4 ${b.isPinned ? "fill-yellow-400 text-yellow-400" : ""}`} />
                    </button>
                    <button
                      onClick={() => window.open(`/${b.name}`, "_blank")}
                      className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-blue-500 transition-colors"
                      title="Xem/Sửa Memo gốc"
                    >
                      <ExternalLinkIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(b)}
                      className="p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Lưu trữ (Xóa)"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {b.isPinned && (
                  <div className="absolute -top-2 -right-2 text-2xl drop-shadow-sm">⭐</div>
                )}
              </div>
            ))}
          </div>
        )}

        {hasNextPage && (
          <button
            className="w-full mt-4 py-3 bg-card border rounded-xl font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Loader2Icon className="w-5 h-5 animate-spin" /> : "Tải thêm..."}
          </button>
        )}
      </div>
    </div>
  );
};

export default BookmarkManager;
