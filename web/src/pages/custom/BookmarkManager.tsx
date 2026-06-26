import {
  BookmarkIcon,
  ExternalLinkIcon,
  StarIcon,
  Trash2Icon,
  PlusIcon,
  MousePointerClickIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  ClockIcon,
  AlertTriangleIcon,
  GlobeIcon
} from "lucide-react";
import { useState, useMemo } from "react";
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
  isOld: boolean;
  category: string;
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
    pageSize: 150,
  });

  // State for new bookmark form
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newNotes, setNewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Parse memos into BookmarkEntry objects
  const bookmarks = useMemo(() => {
    if (!data?.pages) return [];

    const entries: BookmarkEntry[] = [];
    const now = dayjs();

    data.pages.forEach((page) => {
      page.memos.forEach((memo) => {
        if (memo.state !== State.NORMAL) return;

        const content = memo.content;
        
        // Extract Title and URL: [Title](URL)
        const linkMatch = content.match(/\[(.*?)\]\((.*?)\)/);
        let title = linkMatch ? linkMatch[1] : "Chưa có tiêu đề";
        const url = linkMatch ? linkMatch[2] : "";

        const rawUrlMatch = !linkMatch ? content.match(/(https?:\/\/[^\s]+)/) : null;
        const finalUrl = url || (rawUrlMatch ? rawUrlMatch[1] : "");
        if (!linkMatch && rawUrlMatch) title = finalUrl;

        // Extract category tag #bookmark/something
        const catMatch = content.match(/#bookmark\/([^\s#]+)/);
        const category = catMatch ? catMatch[1] : "general";

        // Extract notes
        let notes = "";
        const notesMatch = content.match(/Ghi chú:\s*([\s\S]*?)(?=<!-- clicks:|$)/i);
        if (notesMatch) {
          notes = notesMatch[1].trim();
        } else {
           notes = content.replace(/\[(.*?)\]\((.*?)\)/, "")
                          .replace(/#bookmark\S*/g, "")
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
        const daysOld = now.diff(createTime, 'day');
        const isOld = daysOld > 30;

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
          isOld,
          category
        });
      });
    });

    // Sort: Pinned first, then clicks desc, then updateTime desc
    return entries.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return b.updateTime.getTime() - a.updateTime.getTime();
    });
  }, [data]);

  // Extract all categories present
  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    bookmarks.forEach(b => {
      if (b.category) cats.add(b.category);
    });
    return Array.from(cats);
  }, [bookmarks]);

  // Filtered bookmarks list
  const filteredBookmarks = useMemo(() => {
    let list = bookmarks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.url.toLowerCase().includes(q) || 
        b.notes.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== "all") {
      list = list.filter(b => b.category === selectedCategory);
    }

    return list;
  }, [bookmarks, searchQuery, selectedCategory]);

  // Extract domain for favicon
  const getDomain = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname;
    } catch {
      return "";
    }
  };

  const handleUrlChange = (val: string) => {
    setNewUrl(val);
    if (val && !newTitle) {
      try {
        const urlObj = new URL(val);
        let domain = urlObj.hostname.replace("www.", "");
        domain = domain.charAt(0).toUpperCase() + domain.slice(1);
        setNewTitle(domain);
      } catch { /* ignore invalid URL */ }
    }
  };

  const handleAddBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return toast.error("Vui lòng nhập Link URL");
    if (!newNotes.trim()) return toast.error("Vui lòng nhập Ghi chú cho bookmark");

    setIsSubmitting(true);
    
    const title = newTitle.trim() || getDomain(newUrl.trim()) || "Bookmark";
    const catTag = newCategory.trim() ? `#bookmark/${newCategory.trim()}` : "#bookmark";
    
    const content = `[${title}](${newUrl.trim()})\n#bookmark ${catTag}\n\nGhi chú: ${newNotes.trim()}\n<!-- clicks: 0 -->`;

    createMemo.mutate(
      { content } as any,
      {
        onSuccess: () => {
          toast.success("Đã thêm Bookmark thành công!");
          setNewUrl("");
          setNewTitle("");
          setNewCategory("general");
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
    const newClicks = bookmark.clicks + 1;
    let newContent = bookmark.rawContent;

    if (newContent.includes('<!-- clicks:')) {
      newContent = newContent.replace(/<!-- clicks: \d+ -->/, `<!-- clicks: ${newClicks} -->`);
    } else {
      newContent = `${newContent}\n<!-- clicks: ${newClicks} -->`;
    }

    updateMemo.mutate({
      update: {
        name: bookmark.name,
        content: newContent
      },
      updateMask: ["content"]
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: memoKeys.all });
      }
    });
  };

  const togglePin = (bookmark: BookmarkEntry) => {
    updateMemo.mutate({
      update: {
        name: bookmark.name,
        pinned: !bookmark.isPinned
      },
      updateMask: ["pinned"]
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: memoKeys.all });
        toast.success(bookmark.isPinned ? "Đã bỏ ghim" : "Đã ghim bookmark!");
      }
    });
  };

  const handleDelete = (bookmark: BookmarkEntry) => {
    if (confirm("Chắc chắn muốn lưu trữ (xóa) bookmark này?")) {
      updateMemo.mutate({
        update: {
          name: bookmark.name,
          state: State.ARCHIVED
        },
        updateMask: ["state"]
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: memoKeys.all });
          toast.success("Đã lưu trữ Bookmark");
        }
      });
    }
  };

  // Manual cleanup for old & unpinned links
  const handleCleanOldBookmarks = async () => {
    const oldBookmarks = bookmarks.filter(b => b.isOld && !b.isPinned);
    
    if (oldBookmarks.length === 0) {
      toast.success("Không có dấu trang cũ nào cần lưu trữ!");
      return;
    }

    if (confirm(`Tìm thấy ${oldBookmarks.length} dấu trang cũ hơn 30 ngày và không được ghim. Lưu trữ toàn bộ?`)) {
      toast.loading("Đang dọn dẹp các dấu trang cũ...", { id: "clean-bookmarks" });
      try {
        for (const b of oldBookmarks) {
          await updateMemo.mutateAsync({
            update: {
              name: b.name,
              state: State.ARCHIVED
            },
            updateMask: ["state"]
          });
        }
        queryClient.invalidateQueries({ queryKey: memoKeys.all });
        toast.success(`Đã lưu trữ thành công ${oldBookmarks.length} dấu trang cũ.`, { id: "clean-bookmarks" });
      } catch (err: any) {
        toast.error("Có lỗi xảy ra: " + err.message, { id: "clean-bookmarks" });
      }
    }
  };

  const oldUnpinnedCount = useMemo(() => {
    return bookmarks.filter(b => b.isOld && !b.isPinned).length;
  }, [bookmarks]);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-5 p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
            <BookmarkIcon className="w-7 h-7 text-blue-500" />
            Dấu trang của tôi
          </h1>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span>Quản lý liên kết quan trọng.</span>
            {oldUnpinnedCount > 0 && (
              <span className="text-amber-500 font-medium flex items-center gap-1">
                <AlertTriangleIcon className="w-3 h-3" /> {oldUnpinnedCount} link cũ sắp hết hạn
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {oldUnpinnedCount > 0 && (
            <button
              onClick={handleCleanOldBookmarks}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-amber-200 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl transition-all font-medium"
              title="Lưu trữ toàn bộ link cũ chưa ghim"
            >
              <AlertTriangleIcon className="w-3.5 h-3.5" /> Dọn dẹp link cũ
            </button>
          )}
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md hover:shadow-blue-500/15 transition-all active:scale-95 text-xs font-semibold"
          >
            {isAdding ? "Đóng form" : <><PlusIcon className="w-4 h-4" /> Thêm Bookmark</>}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {isAdding && (
        <form onSubmit={handleAddBookmark} className="bg-card w-full border border-border rounded-2xl p-5 shadow-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            <SparklesIcon className="w-4 h-4 text-blue-500" /> Thêm bookmark mới
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Link URL *</label>
              <input
                type="url"
                required
                value={newUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/something"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Danh mục (Category)</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="general">Chung (General)</option>
                <option value="dev">Lập trình (Dev)</option>
                <option value="design">Thiết kế (Design)</option>
                <option value="news">Tin tức (News)</option>
                <option value="learn">Học tập (Learn)</option>
                <option value="tools">Công cụ (Tools)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Tiêu đề (Tùy chọn - Gợi ý tự động)</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tên hoặc mô tả ngắn của link..."
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Ghi chú lý do lưu link *</label>
            <textarea
              required
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Ví dụ: Công cụ tạo biểu đồ online cực xịn để vẽ sơ đồ dự án..."
              className="flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2.5 mt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3.5 py-1.5 border rounded-lg hover:bg-accent text-xs font-medium transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : "Lưu Bookmark"}
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between w-full">
        {/* Search */}
        <div className="relative w-full sm:max-w-md">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tiêu đề, ghi chú hoặc link..."
            className="flex h-9 w-full pl-9 pr-4 rounded-xl border border-input bg-card text-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto justify-start sm:justify-end overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${
              selectedCategory === "all"
                ? "bg-blue-600 border-blue-600 text-white font-semibold"
                : "bg-card hover:bg-accent text-muted-foreground border-border"
            }`}
          >
            Tất cả
          </button>
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 text-xs rounded-full border capitalize transition-all ${
                selectedCategory === cat
                  ? "bg-blue-600 border-blue-600 text-white font-semibold"
                  : "bg-card hover:bg-accent text-muted-foreground border-border"
              }`}
            >
              {cat === "general" ? "Chung" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bookmarks List */}
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="w-full flex justify-center py-12 opacity-50">
            <Loader2Icon className="w-7 h-7 animate-spin text-blue-500" />
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="text-center py-14 bg-card rounded-2xl border border-dashed border-border/80 flex flex-col items-center justify-center opacity-65">
            <BookmarkIcon className="w-10 h-10 mb-2 text-muted-foreground/60" />
            <p className="text-xs">Không tìm thấy bookmark phù hợp.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
            {filteredBookmarks.map((b) => {
              const domain = getDomain(b.url);
              const faviconUrl = domain 
                ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`
                : "";

              return (
                <div
                  key={b.uid}
                  className={`group relative bg-card flex flex-col justify-between border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 outline outline-1 outline-transparent hover:outline-blue-500/20 ${
                    b.isPinned ? "ring-1 ring-yellow-400 bg-yellow-500/[0.02]" : ""
                  }`}
                >
                  <div>
                    {/* Header: Favicon + Actions */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 max-w-[80%]">
                        {faviconUrl ? (
                          <img
                            src={faviconUrl}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                            className="w-4 h-4 rounded-sm object-contain"
                          />
                        ) : (
                          <GlobeIcon className="w-4 h-4 text-muted-foreground/65" />
                        )}
                        <span className="text-[10px] text-muted-foreground/75 font-mono truncate">{domain}</span>
                      </div>
                      
                      {b.isOld && !b.isPinned && (
                        <span className="text-[9px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title="Chưa ghim và cũ hơn 30 ngày. Sẽ dọn dẹp nếu click dọn dẹp.">
                          <ClockIcon className="w-2.5 h-2.5" /> 30d+
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleLinkClick(b)}
                      className="font-bold text-sm text-foreground hover:text-blue-600 line-clamp-2 transition-colors flex items-center gap-1 mb-2"
                    >
                      {b.title}
                      <ExternalLinkIcon className="w-3 h-3 shrink-0 opacity-40 inline-block" />
                    </a>
                    
                    {/* Notes */}
                    <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 p-2 rounded-xl border border-border/40 min-h-[50px] mb-3">
                      {b.notes || <span className="opacity-50 italic">Không có ghi chú...</span>}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-border/80 mt-auto">
                    <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/80">
                      <span className="flex items-center gap-1" title="Số lần truy cập">
                        <MousePointerClickIcon className="w-3 h-3" />
                        {b.clicks} clicks
                      </span>
                      {b.category && (
                        <span className="flex items-center gap-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full capitalize text-[9px]">
                          <TagIcon className="w-2.5 h-2.5" /> {b.category === "general" ? "Chung" : b.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => togglePin(b)}
                        className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-yellow-500 transition-colors"
                        title={b.isPinned ? "Bỏ ghim" : "Ghim giữ lại"}
                      >
                        <StarIcon className={`w-3.5 h-3.5 ${b.isPinned ? "fill-yellow-400 text-yellow-400" : ""}`} />
                      </button>
                      <button
                        onClick={() => window.open(`/${b.name}`, "_blank")}
                        className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-blue-500 transition-colors"
                        title="Xem/Sửa Memo gốc"
                      >
                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(b)}
                        className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Lưu trữ (Xóa)"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasNextPage && (
          <button
            className="w-full mt-4 py-2.5 bg-card border border-border rounded-xl text-xs font-semibold hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Loader2Icon className="w-4 h-4 animate-spin" /> : "Tải thêm..."}
          </button>
        )}
      </div>
    </div>
  );
};

export default BookmarkManager;
