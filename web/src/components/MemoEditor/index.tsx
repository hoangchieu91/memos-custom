import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useMemo, useEffect } from "react";
import { toast } from "react-hot-toast";
import { CalendarIcon, SparklesIcon, XIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { memoKeys } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { convertVisibilityFromString } from "@/utils/memo";
import { detectPastDate, formatDetectedDate } from "@/utils/dateDetect";
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

  // ── Backdate detection ──────────────────────────────────────────────────────
  const detectedDate = useMemo(() => detectPastDate(state.content), [state.content]);
  const [backdateDismissed, setBackdateDismissed] = useState(false);
  const [backdateApplied, setBackdateApplied] = useState<Date | null>(null);
  // backdateRef stores the date to apply after save (avoids type issues with editor state)
  const backdateRef = useRef<Date | null>(null);
  // Reset dismissed state when a new date is detected
  useEffect(() => {
    setBackdateDismissed(false);
    setBackdateApplied(null);
    backdateRef.current = null;
  }, [detectedDate?.getTime()]);

  const showBackdateBanner = detectedDate && !backdateDismissed && !backdateApplied;

  const handleApplyBackdate = () => {
    if (!detectedDate) return;
    backdateRef.current = detectedDate;
    setBackdateApplied(detectedDate);
    toast.success(`📅 Đã đặt ngày: ${formatDetectedDate(detectedDate)}`);
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

      // Apply backdate if user confirmed via the AI banner
      if (backdateRef.current && result.memoName) {
        try {
          const unixSec = Math.floor(backdateRef.current.getTime() / 1000);
          await fetch(`/api/v1/${result.memoName}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              displayTime: new Date(unixSec * 1000).toISOString(),
              updateMask: "display_time",
            }),
          });
        } catch { /* silent — backdate is best-effort */ }
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

        {/* Editor content grows to fill available space in focus mode */}
        <EditorContent ref={editorRef} placeholder={placeholder} autoFocus={autoFocus} />

        {/* Auto-tag suggestions */}
        {visibleTags.length > 0 && (
          <div className="w-full flex items-center gap-2 flex-wrap px-1">
            <SparklesIcon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">Tự động gán:</span>
            {visibleTags.map((tag) => (
              <div
                key={tag}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-medium"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleDismissTag(tag)}
                  className="hover:bg-violet-200 dark:hover:bg-violet-900/50 p-0.5 rounded transition-colors text-violet-500 hover:text-rose-500 cursor-pointer"
                  title="Không dùng tag này"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* AI Backdate banner */}
        {showBackdateBanner && (
          <div className="w-full flex items-center gap-2 px-1 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <CalendarIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex-1">
              AI phát hiện ghi chú cho ngày: <strong>{formatDetectedDate(detectedDate!)}</strong>
            </span>
            <button
              onClick={handleApplyBackdate}
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors"
            >
              Đặt ngày này
            </button>
            <button
              onClick={() => setBackdateDismissed(true)}
              className="text-amber-500 hover:text-amber-700"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        )}
        {backdateApplied && (
          <div className="w-full flex items-center gap-1.5 px-1">
            <CalendarIcon className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] text-amber-500">📅 Ngày hiển thị: <strong>{formatDetectedDate(backdateApplied)}</strong></span>
            <button onClick={() => { setBackdateApplied(null); backdateRef.current = null; }} className="text-[10px] text-rose-400 underline ml-1">Huỷ</button>
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
