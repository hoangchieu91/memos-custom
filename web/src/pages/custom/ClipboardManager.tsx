import {
  ClipboardPasteIcon,
  Loader2Icon,
  CopyIcon,
  Trash2Icon,
  PinIcon,
  PinOffIcon,
  LinkIcon,
  ImageIcon,
  FileTextIcon,
  PlusIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { useInfiniteMemos, useCreateMemo, useUpdateMemo, memoKeys } from "@/hooks/useMemoQueries";
import { useQueryClient } from "@tanstack/react-query";
import { State } from "@/types/proto/api/v1/common_pb";
import { timestampDate } from "@bufbuild/protobuf/wkt";

type ClipType = "text" | "link" | "image";

interface ClipEntry {
  name: string;
  content: string;
  type: ClipType;
  copies: number;
  lastUsed: Date;
  isPinned: boolean;
  rawContent: string;
  createTime: Date;
  updateTime: Date;
  linkUrl?: string;
  linkTitle?: string;
  imageUrl?: string;
}

const URL_REGEX = /^https?:\/\/[^\s]+$/;
const MD_LINK_REGEX = /^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/;
const MD_IMAGE_REGEX = /^!\[.*?\]\((.*?)\)$/;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i;
const META_REGEX = /<!-- copies:\s*(\d+)\s*\|\s*lastUsed:\s*([^\s]+)\s*-->/;

const AUTO_ARCHIVE_DAYS = 3;

function detectType(content: string): { type: ClipType; linkUrl?: string; linkTitle?: string; imageUrl?: string } {
  const trimmed = content.trim();

  const imgMatch = trimmed.match(MD_IMAGE_REGEX);
  if (imgMatch) return { type: "image", imageUrl: imgMatch[1] };

  if (URL_REGEX.test(trimmed) && IMAGE_EXT_REGEX.test(trimmed)) {
    return { type: "image", imageUrl: trimmed };
  }

  const linkMatch = trimmed.match(MD_LINK_REGEX);
  if (linkMatch) return { type: "link", linkTitle: linkMatch[1], linkUrl: linkMatch[2] };

  if (URL_REGEX.test(trimmed)) {
    return { type: "link", linkUrl: trimmed, linkTitle: trimmed };
  }

  return { type: "text" };
}

function parseMeta(raw: string): { copies: number; lastUsed: Date } {
  const match = raw.match(META_REGEX);
  if (match) {
    return { copies: parseInt(match[1], 10), lastUsed: new Date(match[2]) };
  }
  return { copies: 0, lastUsed: new Date() };
}

function buildMemoContent(content: string, copies: number, lastUsed: Date): string {
  return `${content}\n#clipboard\n<!-- copies: ${copies} | lastUsed: ${lastUsed.toISOString()} -->`;
}

function extractPureContent(raw: string): string {
  return raw
    .replace(/\s*#clipboard\s*/g, "")
    .replace(META_REGEX, "")
    .trim();
}

const ClipboardManager = () => {
  const queryClient = useQueryClient();
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();

  const [newContent, setNewContent] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | ClipType>("all");

  // Fetch all memos with #clipboard
  const { data, isLoading } = useInfiniteMemos({
    filter: "tag in ['clipboard']",
    pageSize: 100,
    state: State.NORMAL,
  });

  // Parse memos into ClipEntry[]
  const items = useMemo(() => {
    if (!data?.pages) return [];

    const entries: ClipEntry[] = [];

    data.pages.forEach((page) => {
      page.memos.forEach((memo) => {
        if (memo.state !== State.NORMAL) return;

        const raw = memo.content;
        const pureContent = extractPureContent(raw);
        if (!pureContent) return;

        const { copies, lastUsed } = parseMeta(raw);
        const { type, linkUrl, linkTitle, imageUrl } = detectType(pureContent);

        entries.push({
          name: memo.name,
          content: pureContent,
          type,
          copies,
          lastUsed,
          isPinned: memo.pinned,
          rawContent: raw,
          createTime: memo.createTime ? timestampDate(memo.createTime) : new Date(),
          updateTime: memo.updateTime ? timestampDate(memo.updateTime) : new Date(),
          linkUrl,
          linkTitle,
          imageUrl,
        });
      });
    });

    // Sort: pinned first → most copies → newest lastUsed
    return entries.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (b.copies !== a.copies) return b.copies - a.copies;
      return b.lastUsed.getTime() - a.lastUsed.getTime();
    });
  }, [data]);

  // Split into active and idle
  const { activeItems, idleItems } = useMemo(() => {
    const now = dayjs();
    const active: ClipEntry[] = [];
    const idle: ClipEntry[] = [];

    items.forEach((item) => {
      const daysSinceUsed = now.diff(dayjs(item.lastUsed), "day");
      if (!item.isPinned && daysSinceUsed >= AUTO_ARCHIVE_DAYS) {
        idle.push(item);
      } else {
        active.push(item);
      }
    });

    return { activeItems: active, idleItems: idle };
  }, [items]);

  // Auto-archive idle items
  useEffect(() => {
    if (!idleItems.length) return;

    idleItems.forEach((item) => {
      updateMemo.mutate(
        { update: { name: item.name, state: State.ARCHIVED }, updateMask: ["state"] },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: memoKeys.all });
          },
        }
      );
    });

    if (idleItems.length > 0) {
      toast(`🧹 Đã ẩn ${idleItems.length} mục cũ (> ${AUTO_ARCHIVE_DAYS} ngày)`, { icon: "📦" });
    }
  }, [idleItems.length]);

  // Add new clip helper
  const handleAddClip = useCallback(async (contentStr: string) => {
    const trimmed = contentStr.trim();
    if (!trimmed) return;

    const now = new Date();
    const content = buildMemoContent(trimmed, 0, now);

    try {
      await createMemo.mutateAsync({ content } as any);
      toast.success("📋 Đã lưu vào clipboard!");
      queryClient.invalidateQueries({ queryKey: memoKeys.all });
    } catch {
      toast.error("Lỗi khi lưu clipboard");
    }
  }, [createMemo, queryClient]);

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    await handleAddClip(newContent);
    setNewContent("");
  };

  // Global paste handler
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        return;
      }
      const text = e.clipboardData?.getData("text/plain").trim();
      if (text) {
        handleAddClip(text);
      }
    };
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [handleAddClip]);

  // Copy to system clipboard + bump counter
  const handleCopy = useCallback(async (item: ClipEntry) => {
    try {
      await navigator.clipboard.writeText(item.content);
      toast.success("📋 Đã copy vào hệ thống!");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = item.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("📋 Đã copy vào hệ thống!");
    }

    const newCopies = item.copies + 1;
    const now = new Date();
    const updatedContent = buildMemoContent(item.content, newCopies, now);

    updateMemo.mutate(
      { update: { name: item.name, content: updatedContent }, updateMask: ["content"] },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: memoKeys.all }) }
    );
  }, [updateMemo, queryClient]);

  // Toggle pin
  const togglePin = useCallback((item: ClipEntry) => {
    updateMemo.mutate(
      { update: { name: item.name, pinned: !item.isPinned }, updateMask: ["pinned"] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: memoKeys.all });
          toast.success(item.isPinned ? "Đã bỏ ghim" : "📌 Đã ghim!");
        },
      }
    );
  }, [updateMemo, queryClient]);

  // Delete
  const handleDelete = useCallback((item: ClipEntry) => {
    if (!confirm("Xóa mục này khỏi Clipboard?")) return;
    updateMemo.mutate(
      { update: { name: item.name, state: State.ARCHIVED }, updateMask: ["state"] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: memoKeys.all });
          toast.success("🗑️ Đã xóa");
        },
      }
    );
  }, [updateMemo, queryClient]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let res = activeItems;
    if (filterType !== "all") {
      res = res.filter((item) => item.type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter((item) => item.content.toLowerCase().includes(q));
    }
    return res;
  }, [activeItems, filterType, search]);

  const TypeIcon = ({ type }: { type: ClipType }) => {
    switch (type) {
      case "link": return <LinkIcon className="w-4 h-4 text-blue-500" />;
      case "image": return <ImageIcon className="w-4 h-4 text-purple-500" />;
      default: return <FileTextIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
    }
  };

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-7xl mx-auto flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-amber-500 bg-clip-text text-transparent flex items-center gap-2">
            <ClipboardPasteIcon className="w-8 h-8 text-yellow-500" />
            Bảng nhớ tạm (Clipboard)
          </h1>
          <p className="text-muted-foreground mt-1">
            Lưu trữ nhanh dữ liệu sao chép. Bấm **Ctrl + V** bất kỳ đâu trên trang này để dán nhanh!
          </p>
        </div>
      </div>

      {/* Quick Info Box */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 text-sm text-yellow-800 dark:text-yellow-400">
        💡 <strong>Mẹo:</strong> Không cần click vào ô nhập, chỉ cần mở trang này và bấm tổ hợp phím <strong>Ctrl + V</strong> (hoặc Cmd + V) để lưu nhanh đoạn văn bản vừa copy. Các mục không được ghim sẽ tự động dọn dẹp sau {AUTO_ARCHIVE_DAYS} ngày.
      </div>

      {/* Manual Input Form */}
      <form onSubmit={handleManualAdd} className="bg-card border rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Nhập hoặc dán văn bản, link web, link ảnh tại đây..."
          className="w-full bg-background border border-border rounded-xl p-3 text-sm min-h-[80px] focus:outline-none focus:border-yellow-500 transition-colors resize-y"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleAddClip(newContent);
              setNewContent("");
            }
          }}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground/60">Bấm <strong>Ctrl + Enter</strong> để lưu nhanh</span>
          <button
            type="submit"
            disabled={!newContent.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            Lưu Clipboard
          </button>
        </div>
      </form>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: "all", label: "Tất cả", icon: "📋" },
            { key: "text", label: "Văn bản", icon: "📝" },
            { key: "link", label: "Liên kết", icon: "🔗" },
            { key: "image", label: "Hình ảnh", icon: "🖼️" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilterType(t.key)}
              className={`px-3.5 py-1.5 text-xs rounded-full border transition-all ${
                filterType === t.key
                  ? "bg-yellow-500 text-white border-yellow-500 shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:border-yellow-500/50"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Tìm kiếm nội dung sao chép..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-yellow-500 transition-colors"
          />
        </div>
      </div>

      {/* Clipboard List */}
      {isLoading ? (
        <div className="w-full flex justify-center py-12 opacity-50">
          <Loader2Icon className="w-8 h-8 animate-spin text-yellow-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-dashed flex flex-col items-center justify-center opacity-60">
          <ClipboardPasteIcon className="w-12 h-12 mb-3 text-muted-foreground" />
          <p className="text-sm">Không tìm thấy nội dung bảng nhớ tạm nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.name}
              className={`group bg-card flex flex-col justify-between border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:border-yellow-500/20 relative ${
                item.isPinned ? "ring-2 ring-yellow-400/40 bg-yellow-50/5 dark:bg-yellow-950/5" : ""
              }`}
            >
              <div>
                <div className="flex justify-between items-start gap-3 mb-2.5">
                  <span className="flex items-center gap-1.5">
                    <TypeIcon type={item.type} />
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      {item.type === "link" ? "Liên kết" : item.type === "image" ? "Hình ảnh" : "Văn bản"}
                    </span>
                  </span>
                  {item.isPinned && <span className="text-xs">📌</span>}
                </div>

                <div className="mb-4">
                  {item.type === "link" ? (
                    <a
                      href={item.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleCopy(item)}
                      className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 leading-snug break-all"
                    >
                      {item.linkTitle || item.linkUrl}
                      <ExternalLinkIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </a>
                  ) : item.type === "image" ? (
                    <div className="flex flex-col gap-2">
                      <img
                        src={item.imageUrl}
                        alt="clipboard"
                        className="w-full max-h-36 object-contain rounded-lg border bg-stone-100 dark:bg-stone-800/50 cursor-pointer hover:opacity-90"
                        onClick={() => window.open(item.imageUrl, "_blank")}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <p className="text-xs text-muted-foreground break-all">{item.content}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-all leading-relaxed font-mono bg-accent/20 p-2.5 rounded-xl border border-border/30 max-h-48 overflow-y-auto">
                      {item.content}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border/30 mt-auto text-xs text-muted-foreground/60">
                <div className="flex items-center gap-2">
                  {item.copies > 0 && (
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">
                      {item.copies}× copy
                    </span>
                  )}
                  <span>•</span>
                  <span>{dayjs(item.lastUsed).format("DD/MM HH:mm")}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(item)}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-yellow-600 transition-colors cursor-pointer"
                    title="Sao chép"
                  >
                    <CopyIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => togglePin(item)}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-yellow-500 transition-colors cursor-pointer"
                    title={item.isPinned ? "Bỏ ghim" : "Ghim"}
                  >
                    {item.isPinned ? <PinOffIcon className="w-4 h-4" /> : <PinIcon className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Xóa"
                  >
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClipboardManager;
