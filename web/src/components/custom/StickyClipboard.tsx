/**
 * StickyClipboard V2 — Multi-item clipboard manager
 *
 * Each clipboard item = one memo with #clipboard tag
 * Metadata stored as HTML comment: <!-- copies: N | lastUsed: ISO -->
 *
 * Features:
 *  - Auto-detect content type: text / link / image
 *  - Pin/Unpin (uses memo.pinned)
 *  - Copy counter + lastUsed tracking
 *  - Auto-archive items idle > 3 days (unpinned only)
 *  - Sorted: pinned → most copies → newest
 */
import {
  ClipboardPasteIcon,
  Loader2Icon,
  CopyIcon,
  Trash2Icon,
  ChevronDownIcon,
  PinIcon,
  PinOffIcon,
  LinkIcon,
  ImageIcon,
  FileTextIcon,
  PlusIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { useInfiniteMemos, useCreateMemo, useUpdateMemo, memoKeys } from "@/hooks/useMemoQueries";
import { useQueryClient } from "@tanstack/react-query";
import { State } from "@/types/proto/api/v1/common_pb";
import { timestampDate } from "@bufbuild/protobuf/wkt";

// ============================================================================
// Types & Helpers
// ============================================================================

type ClipType = "text" | "link" | "image";

interface ClipEntry {
  name: string;         // memo resource name
  content: string;      // pure content (no tag/metadata)
  type: ClipType;
  copies: number;
  lastUsed: Date;
  isPinned: boolean;
  rawContent: string;
  createTime: Date;
  updateTime: Date;
  // For links
  linkUrl?: string;
  linkTitle?: string;
  // For images
  imageUrl?: string;
}

const URL_REGEX = /^https?:\/\/[^\s]+$/;
const MD_LINK_REGEX = /^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/;
const MD_IMAGE_REGEX = /^!\[.*?\]\((.*?)\)$/;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i;
const META_REGEX = /<!-- copies:\s*(\d+)\s*\|\s*lastUsed:\s*([^\s]+)\s*-->/;

const COLLAPSE_KEY = "clipboard_v2_collapsed";
const AUTO_ARCHIVE_DAYS = 3;

function detectType(content: string): { type: ClipType; linkUrl?: string; linkTitle?: string; imageUrl?: string } {
  const trimmed = content.trim();

  // Check markdown image: ![alt](url)
  const imgMatch = trimmed.match(MD_IMAGE_REGEX);
  if (imgMatch) return { type: "image", imageUrl: imgMatch[1] };

  // Check if it's a plain URL pointing to an image
  if (URL_REGEX.test(trimmed) && IMAGE_EXT_REGEX.test(trimmed)) {
    return { type: "image", imageUrl: trimmed };
  }

  // Check markdown link: [title](url)
  const linkMatch = trimmed.match(MD_LINK_REGEX);
  if (linkMatch) return { type: "link", linkTitle: linkMatch[1], linkUrl: linkMatch[2] };

  // Check plain URL
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

// ============================================================================
// Component
// ============================================================================

const StickyClipboard = () => {
  const queryClient = useQueryClient();
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "true"; } catch { return false; }
  });
  const [newContent, setNewContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Fetch all memos with #clipboard
  const { data, isLoading } = useInfiniteMemos({
    filter: "tag in ['clipboard']",
    pageSize: 50,
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
  }, [idleItems.length]); // Only trigger when count changes

  // Add new clip
  const handleAdd = useCallback(async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    const now = new Date();
    const content = buildMemoContent(trimmed, 0, now);

    try {
      await createMemo.mutateAsync({ content } as any);
      setNewContent("");
      setIsAdding(false);
      toast.success("📋 Đã thêm vào clipboard!");
      queryClient.invalidateQueries({ queryKey: memoKeys.all });
    } catch {
      toast.error("Lỗi khi thêm clipboard");
    }
  }, [newContent, createMemo, queryClient]);

  // Copy to system clipboard + bump counter
  const handleCopy = useCallback(async (item: ClipEntry) => {
    // Copy to system clipboard
    try {
      await navigator.clipboard.writeText(item.content);
      toast.success("📋 Đã copy!");
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = item.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("📋 Đã copy!");
    }

    // Bump copies + lastUsed
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

  // Delete (archive)
  const handleDelete = useCallback((item: ClipEntry) => {
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

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch { /**/ }
      return next;
    });
  }, []);

  // Handle paste event for quick add
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain").trim();
    if (!text) return;
    // Auto-fill the input
    setNewContent(text);
    setIsAdding(true);
  }, []);

  // Type icon
  const TypeIcon = ({ type }: { type: ClipType }) => {
    switch (type) {
      case "link": return <LinkIcon className="w-3.5 h-3.5 text-blue-500" />;
      case "image": return <ImageIcon className="w-3.5 h-3.5 text-purple-500" />;
      default: return <FileTextIcon className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full bg-yellow-50/50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-2xl p-4 mb-4 flex items-center justify-center h-12">
        <Loader2Icon className="w-4 h-4 animate-spin text-yellow-500 opacity-50" />
      </div>
    );
  }

  return (
    <div
      className="w-full bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-stone-900 border border-yellow-200 dark:border-yellow-800/50 rounded-2xl shadow-sm relative group overflow-hidden transition-all duration-300 mb-4"
      onPaste={handlePaste}
    >
      {/* Decorative top bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-300 to-amber-400 opacity-40" />

      {/* Header */}
      <button
        onClick={toggleCollapse}
        className="w-full flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-yellow-100/30 dark:hover:bg-yellow-900/10 transition-colors"
      >
        <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-500 flex items-center gap-1.5">
          <ClipboardPasteIcon className="w-4 h-4" />
          Clipboard
          {activeItems.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-yellow-200 dark:bg-yellow-800/50 rounded-full font-bold">
              {activeItems.length}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsAdding(!isAdding); }}
              className="p-1 rounded-lg text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200/50 dark:hover:bg-yellow-800/30 transition-colors"
              title="Thêm mới"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          )}
          <ChevronDownIcon className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} />
        </div>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-4 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Add new item */}
          {isAdding && (
            <div className="mb-3 bg-white/60 dark:bg-white/5 border border-yellow-200/50 dark:border-yellow-800/30 rounded-xl p-3 animate-in fade-in zoom-in-95 duration-150">
              <textarea
                autoFocus
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Dán text, URL, hoặc link ảnh..."
                className="w-full bg-transparent text-sm resize-none min-h-[60px] max-h-[120px] focus:outline-none placeholder:text-muted-foreground/50"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-yellow-200/30">
                <span className="text-[10px] text-muted-foreground/50">Ctrl+Enter để lưu</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setIsAdding(false); setNewContent(""); }}
                    className="px-2.5 py-1 text-xs rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!newContent.trim()}
                    className="px-3 py-1 text-xs bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-colors disabled:opacity-40"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Item list */}
          {activeItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground/50 text-xs">
              <ClipboardPasteIcon className="w-8 h-8 mx-auto mb-1.5 opacity-30" />
              Chưa có mục nào. Bấm + để thêm.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
              {activeItems.map((item) => (
                <div
                  key={item.name}
                  className={`group/item relative flex items-start gap-2.5 p-2.5 rounded-xl transition-all duration-150 hover:bg-white/50 dark:hover:bg-white/5 border border-transparent hover:border-yellow-200/50 dark:hover:border-yellow-700/30 ${
                    item.isPinned ? "bg-yellow-100/30 dark:bg-yellow-900/10 border-yellow-200/30 dark:border-yellow-800/20" : ""
                  }`}
                >
                  {/* Type icon */}
                  <div className="mt-0.5 shrink-0">
                    <TypeIcon type={item.type} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {item.type === "link" ? (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => handleCopy(item)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline line-clamp-1 flex items-center gap-1"
                      >
                        {item.linkTitle || item.linkUrl}
                        <ExternalLinkIcon className="w-3 h-3 shrink-0 opacity-50" />
                      </a>
                    ) : item.type === "image" ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={item.imageUrl}
                          alt="clipboard"
                          className="w-12 h-12 object-cover rounded-lg border border-border shadow-sm cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(item.imageUrl, "_blank")}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <span className="text-xs text-muted-foreground line-clamp-1 break-all">{item.content}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/80 line-clamp-2 break-all whitespace-pre-wrap">{item.content}</p>
                    )}

                    {/* Meta line */}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/50">
                      {item.copies > 0 && <span>{item.copies}× copy</span>}
                      <span>{dayjs(item.lastUsed).format("DD/MM HH:mm")}</span>
                      {item.isPinned && <span className="text-yellow-500">📌</span>}
                    </div>
                  </div>

                  {/* Actions — appear on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleCopy(item)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-yellow-700 dark:hover:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                      title="Copy"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => togglePin(item)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                      title={item.isPinned ? "Bỏ ghim" : "Ghim"}
                    >
                      {item.isPinned
                        ? <PinOffIcon className="w-3.5 h-3.5" />
                        : <PinIcon className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Xóa"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer hint */}
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-yellow-200/20">
            <span className="text-[10px] text-muted-foreground/40">
              Tự xóa sau {AUTO_ARCHIVE_DAYS} ngày nếu không ghim
            </span>
            <span className="text-[10px] text-muted-foreground/40">
              {activeItems.length} mục
            </span>
          </div>
        </div>
      )}
    </div>
  );
};


export default StickyClipboard;
