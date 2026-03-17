import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useMemo } from "react";
import { toast } from "react-hot-toast";
import { LoaderIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { memoKeys } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { convertVisibilityFromString } from "@/utils/memo";
import { EditorContent, EditorMetadata, EditorToolbar, FocusModeExitButton, FocusModeOverlay, TimestampPopover } from "./components";
import { FOCUS_MODE_STYLES } from "./constants";
import type { EditorRefActions } from "./Editor";
import { useAutoSave, useFocusMode, useKeyboard, useMemoInit } from "./hooks";
import { cacheService, errorService, memoService, validationService } from "./services";
import { suggestTags } from "@/utils/autoTag";
import { EditorProvider, useEditorContext } from "./state";
import type { MemoEditorProps } from "./types";

const MemoEditor = (props: MemoEditorProps) => (
  <EditorProvider>
    <MemoEditorImpl {...props} />
  </EditorProvider>
);

const QuickCheckinMenu = ({ onSave, editorRef }: { onSave: () => void, editorRef: React.RefObject<EditorRefActions> }) => {
  const { dispatch, actions } = useEditorContext();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = (label: string, icon: string) => {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ Geolocation.");
      return;
    }
    setLoadingAction(label);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          let address = "Vị trí không xác định";
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
            const data = await res.json();
            address = data.display_name || address;
          } catch(e) {}
          const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
          
          const content = `#checkin Thực hiện: ${icon} **${label}**\n📍 Tại: ${address}\n[Google Maps](${mapLink})`;
          
          if (editorRef.current) {
            editorRef.current.setContent(content);
            dispatch(actions.updateContent(content));
            
            setTimeout(() => {
              onSave();
              setLoadingAction(null);
            }, 100);
          }
        } catch (e) {
          toast.error("Lỗi lấy địa chỉ.");
          setLoadingAction(null);
        }
      },
      (error) => {
        let errorMessage = "Lỗi GPS: " + error.message;
        if (error.code === error.PERMISSION_DENIED) errorMessage = "Vui lòng cho phép quyền truy cập Vị trí.";
        toast.error(errorMessage);
        setLoadingAction(null);
      }
    );
  };

  const buttons = [
    { label: "Đến cty", icon: "🏢" },
    { label: "Rời cty", icon: "🚗" },
    { label: "Về nhà", icon: "🏠" },
    { label: "Ra khỏi nhà", icon: "🚶" },
    { label: "Tới dự án", icon: "🚧" },
    { label: "Rời dự án", icon: "🏁" },
  ];

  return (
    <div className="w-full grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2 p-1 bg-gray-50 dark:bg-zinc-900 rounded-md border border-gray-100 dark:border-zinc-800">
      {buttons.map((btn) => (
        <Button
          key={btn.label}
          variant="outline"
          className="h-10 text-xs sm:text-sm font-semibold border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 shadow-sm text-gray-800 dark:text-gray-200"
          onClick={() => handleAction(btn.label, btn.icon)}
          disabled={loadingAction !== null}
        >
          {loadingAction === btn.label ? <LoaderIcon className="size-4 animate-spin text-gray-400" /> : <span className="mr-1">{btn.icon}</span>}
          {btn.label}
        </Button>
      ))}
    </div>
  );
};

const MemoEditorImpl: React.FC<MemoEditorProps> = ({
  className,
  cacheKey,
  memo,
  parentMemoName,
  autoFocus,
  placeholder,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const editorRef = useRef<EditorRefActions>(null);
  const { state, actions, dispatch } = useEditorContext();
  const { userGeneralSetting } = useAuth();

  const memoName = memo?.name;

  // Get default visibility from user settings
  const defaultVisibility = userGeneralSetting?.memoVisibility ? convertVisibilityFromString(userGeneralSetting.memoVisibility) : undefined;

  useMemoInit({ editorRef, memo, cacheKey, username: currentUser?.name ?? "", autoFocus, defaultVisibility });

  // Auto-save content to localStorage
  useAutoSave(state.content, currentUser?.name ?? "", cacheKey);

  // Focus mode management with body scroll lock
  useFocusMode(state.ui.isFocusMode);

  const handleToggleFocusMode = () => {
    dispatch(actions.toggleFocusMode());
  };

  // Smart auto-tag suggestions (real-time)
  const suggestedTags = useMemo(() => suggestTags(state.content), [state.content]);
  const [dismissedTags, setDismissedTags] = useState<Set<string>>(new Set());
  const visibleTags = suggestedTags.filter((t) => !dismissedTags.has(t));

  const handleDismissTag = (tag: string) => {
    setDismissedTags((prev) => new Set([...prev, tag]));
  };

  const handleAcceptTag = (tag: string) => {
    if (editorRef.current) {
      const currentContent = editorRef.current.getContent();
      const newContent = `${currentContent.trimEnd()} ${tag}`;
      editorRef.current.setContent(newContent);
      dispatch(actions.updateContent(newContent));
      setDismissedTags((prev) => new Set([...prev, tag]));
    }
  };

  useKeyboard(editorRef, { onSave: handleSave });

  async function handleSave() {
    // Auto-apply remaining suggested tags before save
    let contentToSave = state.content;
    if (visibleTags.length > 0) {
      const tagsToAppend = visibleTags.filter((t) => !contentToSave.includes(t));
      if (tagsToAppend.length > 0) {
        contentToSave = `${contentToSave.trimEnd()}\n${tagsToAppend.join(" ")}`;
        dispatch(actions.updateContent(contentToSave));
        if (editorRef.current) {
          editorRef.current.setContent(contentToSave);
        }
        // Small delay to let state update propagate
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // Validate before saving
    const { valid, reason } = validationService.canSave(state);
    if (!valid) {
      toast.error(reason || "Cannot save");
      return;
    }

    dispatch(actions.setLoading("saving", true));

    try {
      const result = await memoService.save(state, { memoName, parentMemoName });

      if (!result.hasChanges) {
        toast.error(t("editor.no-changes-detected"));
        onCancel?.();
        return;
      }

      // Clear localStorage cache on successful save
      cacheService.clear(cacheService.key(currentUser?.name ?? "", cacheKey));

      // Invalidate React Query cache to refresh memo lists across the app
      const invalidationPromises = [
        queryClient.invalidateQueries({ queryKey: memoKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: userKeys.stats() }),
      ];

      // Ensure memo detail pages don't keep stale cached content after edits.
      if (memoName) {
        invalidationPromises.push(queryClient.invalidateQueries({ queryKey: memoKeys.detail(memoName) }));
      }

      // If this was a comment, also invalidate the comments query for the parent memo
      if (parentMemoName) {
        invalidationPromises.push(queryClient.invalidateQueries({ queryKey: memoKeys.comments(parentMemoName) }));
      }

      await Promise.all(invalidationPromises);

      // Reset editor state to initial values
      dispatch(actions.reset());
      setDismissedTags(new Set());
      if (!memoName && defaultVisibility) {
        dispatch(actions.setMetadata({ visibility: defaultVisibility }));
      }

      // Notify parent component of successful save
      onConfirm?.(result.memoName);
    } catch (error) {
      handleError(error, toast.error, {
        context: "Failed to save memo",
        fallbackMessage: errorService.getErrorMessage(error),
      });
    } finally {
      dispatch(actions.setLoading("saving", false));
    }
  }

  return (
    <>
      <FocusModeOverlay isActive={state.ui.isFocusMode} onToggle={handleToggleFocusMode} />

      {/*
        Layout structure:
        - Uses justify-between to push content to top and bottom
        - In focus mode: becomes fixed with specific spacing, editor grows to fill space
        - In normal mode: stays relative with max-height constraint
      */}
      <div
        className={cn(
          "group relative w-full flex flex-col justify-between items-start bg-card px-4 pt-3 pb-1 rounded-lg border border-border gap-2",
          FOCUS_MODE_STYLES.transition,
          state.ui.isFocusMode && cn(FOCUS_MODE_STYLES.container.base, FOCUS_MODE_STYLES.container.spacing),
          className,
        )}
      >
        {/* Exit button is absolutely positioned in top-right corner when active */}
        <FocusModeExitButton isActive={state.ui.isFocusMode} onToggle={handleToggleFocusMode} title={t("editor.exit-focus-mode")} />

        {memoName && (
          <div className="w-full -mb-1">
            <TimestampPopover />
          </div>
        )}

        {/* Quick Check-in Buttons grid only for home page */}
        {cacheKey === "home-memo-editor" && (
          <QuickCheckinMenu onSave={handleSave} editorRef={editorRef} />
        )}

        {/* Editor content grows to fill available space in focus mode */}
        <EditorContent ref={editorRef} placeholder={placeholder} autoFocus={autoFocus} />

        {/* Auto-tag suggestions */}
        {visibleTags.length > 0 && (
          <div className="w-full flex items-center gap-1.5 flex-wrap px-1">
            <SparklesIcon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-[10px] text-violet-500 font-medium">Auto-tag:</span>
            {visibleTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleAcceptTag(tag)}
                className="group/tag flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 transition-colors border border-violet-500/20"
              >
                {tag}
                <XIcon
                  className="w-3 h-3 opacity-0 group-hover/tag:opacity-100 hover:text-red-400 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handleDismissTag(tag); }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Metadata and toolbar grouped together at bottom */}
        <div className="w-full flex flex-col gap-2">
          <EditorMetadata memoName={memoName} />
          <EditorToolbar onSave={handleSave} onCancel={onCancel} memoName={memoName} editorRef={editorRef} />
        </div>
      </div>
    </>
  );
};

export default MemoEditor;
