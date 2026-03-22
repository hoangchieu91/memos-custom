import { HashIcon, LoaderIcon, MergeIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useInfiniteMemos, useUpdateMemo } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";

interface TagInfo {
  tag: string;
  count: number;
  memoNames: string[];
}

type ModalMode = "rename" | "merge" | "delete" | null;

const TagManager = () => {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedTag, setSelectedTag] = useState<TagInfo | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, refetch } = useInfiniteMemos({
    pageSize: 500,
    state: State.NORMAL,
    orderBy: "display_time desc",
  });
  const updateMemo = useUpdateMemo();

  const allMemos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.memos || []);
  }, [data]);

  // Extract all tags with count and associated memo names
  const tags: TagInfo[] = useMemo(() => {
    const tagMap = new Map<string, Set<string>>();
    allMemos.forEach((memo) => {
      const content = memo.content || "";
      const found = content.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF/]+/g) || [];
      found.forEach((tag) => {
        if (!tagMap.has(tag)) tagMap.set(tag, new Set());
        tagMap.get(tag)!.add(memo.name);
      });
    });
    return Array.from(tagMap.entries())
      .map(([tag, names]) => ({ tag, count: names.size, memoNames: Array.from(names) }))
      .sort((a, b) => b.count - a.count);
  }, [allMemos]);

  const filteredTags = useMemo(() => {
    if (!searchQuery) return tags;
    const q = searchQuery.toLowerCase();
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, searchQuery]);

  // Update all memos that contain oldTag, replacing with newTag (or removing)
  const cascadeTagUpdate = useCallback(
    async (oldTag: string, newTag: string | null, memoNames: string[]) => {
      setProcessing(true);
      try {
        for (const memoName of memoNames) {
          const memo = allMemos.find((m) => m.name === memoName);
          if (!memo) continue;

          let newContent: string;
          if (newTag) {
            // Replace tag (rename or merge)
            newContent = memo.content.replace(new RegExp(oldTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), newTag);
          } else {
            // Delete tag
            newContent = memo.content.replace(new RegExp("\\s*" + oldTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
          }

          if (newContent !== memo.content) {
            await updateMemo.mutateAsync({
              update: { name: memo.name, content: newContent },
              updateMask: ["content"],
            });
          }
        }
        await refetch();
      } finally {
        setProcessing(false);
        closeModal();
      }
    },
    [allMemos, updateMemo, refetch],
  );

  const openRename = (tag: TagInfo) => {
    setSelectedTag(tag);
    setInputValue(tag.tag);
    setModalMode("rename");
  };

  const openMerge = (tag: TagInfo) => {
    setSelectedTag(tag);
    setMergeTarget("");
    setModalMode("merge");
  };

  const openDelete = (tag: TagInfo) => {
    setSelectedTag(tag);
    setModalMode("delete");
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedTag(null);
    setInputValue("");
    setMergeTarget("");
  };

  const handleRename = () => {
    if (!selectedTag || !inputValue || inputValue === selectedTag.tag) return;
    const newTag = inputValue.startsWith("#") ? inputValue : `#${inputValue}`;
    cascadeTagUpdate(selectedTag.tag, newTag, selectedTag.memoNames);
  };

  const handleMerge = () => {
    if (!selectedTag || !mergeTarget) return;
    cascadeTagUpdate(selectedTag.tag, mergeTarget, selectedTag.memoNames);
  };

  const handleDelete = () => {
    if (!selectedTag) return;
    cascadeTagUpdate(selectedTag.tag, null, selectedTag.memoNames);
  };

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HashIcon className="w-6 h-6 text-violet-500" />
          Tag Manager
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tags.length} tags · {allMemos.length} memos
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Tìm kiếm tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors"
        />
      </div>

      {/* Tag list */}
      <div className="space-y-2">
        {filteredTags.map((tagInfo) => (
          <div
            key={tagInfo.tag}
            className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 hover:border-violet-500/30 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium text-violet-400 truncate">{tagInfo.tag}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{tagInfo.count} memo{tagInfo.count > 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => openRename(tagInfo)}
                className="p-1.5 rounded-lg hover:bg-violet-500/10 text-muted-foreground hover:text-violet-400 transition-colors"
                title="Đổi tên tag"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => openMerge(tagInfo)}
                className="p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-400 transition-colors"
                title="Gộp vào tag khác"
              >
                <MergeIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => openDelete(tagInfo)}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Xóa tag"
              >
                <Trash2Icon className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal overlay */}
      {modalMode && selectedTag && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {modalMode === "rename" && "✏️ Đổi tên tag"}
                {modalMode === "merge" && "🔀 Gộp tag"}
                {modalMode === "delete" && "🗑️ Xóa tag"}
              </h2>
              <button onClick={closeModal} className="p-1 rounded hover:bg-muted">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Tag <span className="font-bold text-violet-400">{selectedTag.tag}</span> xuất hiện trong{" "}
              <span className="font-bold">{selectedTag.count}</span> memo
            </p>

            {/* Rename mode */}
            {modalMode === "rename" && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="#tag_mới"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Tất cả {selectedTag.count} memo sẽ được cập nhật: {selectedTag.tag} → {inputValue}
                </p>
              </div>
            )}

            {/* Merge mode */}
            {modalMode === "merge" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Chọn tag đích để gộp vào:</p>
                <select
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                >
                  <option value="">-- Chọn tag đích --</option>
                  {tags
                    .filter((t) => t.tag !== selectedTag.tag)
                    .map((t) => (
                      <option key={t.tag} value={t.tag}>
                        {t.tag} ({t.count} memos)
                      </option>
                    ))}
                </select>
                {mergeTarget && (
                  <p className="text-xs text-amber-400">
                    ⚠️ {selectedTag.tag} sẽ bị xóa và thay bằng {mergeTarget} trong {selectedTag.count} memo
                  </p>
                )}
              </div>
            )}

            {/* Delete mode */}
            {modalMode === "delete" && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">
                  ⚠️ Tag <strong>{selectedTag.tag}</strong> sẽ bị xóa khỏi {selectedTag.count} memo. Hành động này không thể hoàn tác!
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                Hủy
              </button>
              <button
                onClick={modalMode === "rename" ? handleRename : modalMode === "merge" ? handleMerge : handleDelete}
                disabled={processing || (modalMode === "rename" && !inputValue) || (modalMode === "merge" && !mergeTarget)}
                className={`px-4 py-2 text-sm rounded-lg text-white transition-colors disabled:opacity-50 ${
                  modalMode === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-violet-500 hover:bg-violet-600"
                }`}
              >
                {processing ? (
                  <span className="flex items-center gap-2">
                    <LoaderIcon className="w-4 h-4 animate-spin" /> Đang xử lý...
                  </span>
                ) : modalMode === "rename" ? (
                  "Đổi tên"
                ) : modalMode === "merge" ? (
                  "Gộp tag"
                ) : (
                  "Xóa tag"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagManager;
