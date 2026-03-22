import { useQueryClient } from "@tanstack/react-query";
import copy from "copy-to-clipboard";
import { useCallback } from "react";
import toast from "react-hot-toast";
import { useLocation } from "react-router-dom";
import { useInstance } from "@/contexts/InstanceContext";
import { memoKeys, useDeleteMemo, useUpdateMemo } from "@/hooks/useMemoQueries";
import useNavigateTo from "@/hooks/useNavigateTo";
import { userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

interface UseMemoActionHandlersOptions {
  memo: Memo;
  onEdit?: () => void;
  setDeleteDialogOpen: (open: boolean) => void;
}

export const useMemoActionHandlers = ({ memo, onEdit, setDeleteDialogOpen: _setDeleteDialogOpen }: UseMemoActionHandlersOptions) => {
  const t = useTranslate();
  const location = useLocation();
  const navigateTo = useNavigateTo();
  const queryClient = useQueryClient();
  const { profile } = useInstance();
  const { mutateAsync: updateMemo } = useUpdateMemo();
  const { mutateAsync: deleteMemo } = useDeleteMemo();
  const isInMemoDetailPage = location.pathname.startsWith(`/${memo.name}`);

  const memoUpdatedCallback = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: userKeys.stats() });
  }, [queryClient]);

  const handleTogglePinMemoBtnClick = useCallback(async () => {
    try {
      await updateMemo({
        update: { name: memo.name, pinned: !memo.pinned },
        updateMask: ["pinned"],
      });
    } catch { /* silent */ }
  }, [memo.name, memo.pinned, updateMemo]);

  const handleEditMemoClick = useCallback(() => {
    onEdit?.();
  }, [onEdit]);

  const handleToggleMemoStatusClick = useCallback(async () => {
    const isArchiving = memo.state !== State.ARCHIVED;
    const state = memo.state === State.ARCHIVED ? State.NORMAL : State.ARCHIVED;
    const message = memo.state === State.ARCHIVED ? t("message.restored-successfully") : t("message.archived-successfully");
    try {
      await updateMemo({ update: { name: memo.name, state }, updateMask: ["state"] });
      toast.success(message);
    } catch (error: unknown) {
      handleError(error, toast.error, { context: isArchiving ? "Archive memo" : "Restore memo", fallbackMessage: "An error occurred" });
      return;
    }
    if (isInMemoDetailPage) {
      navigateTo(memo.state === State.ARCHIVED ? "/" : "/archived");
    }
    memoUpdatedCallback();
  }, [memo.name, memo.state, t, isInMemoDetailPage, navigateTo, memoUpdatedCallback, updateMemo]);

  const handleCopyLink = useCallback(() => {
    let host = profile.instanceUrl;
    if (host === "") host = window.location.origin;
    copy(`${host}/${memo.name}`);
    toast.success(t("message.succeed-copy-link"));
  }, [memo.name, t, profile.instanceUrl]);

  const handleCopyContent = useCallback(() => {
    copy(memo.content);
    toast.success(t("message.succeed-copy-content"));
  }, [memo.content, t]);

  // ── SOFT DELETE: Archive + undo toast ────────────────────────────────────
  const handleDeleteMemoClick = useCallback(async () => {
    // Step 1: archive (soft delete)
    try {
      await updateMemo({
        update: { name: memo.name, state: State.ARCHIVED },
        updateMask: ["state"],
      });
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
    } catch (error: unknown) {
      handleError(error, toast.error, { context: "Archive memo", fallbackMessage: "Không thể xóa" });
      return;
    }

    // Step 2: undo toast using a simple approach
    let undone = false;
    const toastId = toast.loading("🗑️ Đã xóa memo — đang chờ 5s để hoàn tác...", {
      duration: 5000,
      position: "bottom-center",
      style: { background: "#27272a", color: "#fff", borderRadius: "12px", fontSize: "14px" },
    });

    // Auto-dismiss after 5s
    setTimeout(() => {
      toast.dismiss(toastId);
      if (!undone) {
        toast.success("Memo đã xóa", { duration: 1500 });
      }
    }, 5000);

    // Listen for click on toast to undo
    const handleUndoClick = async () => {
      undone = true;
      toast.dismiss(toastId);
      try {
        await updateMemo({
          update: { name: memo.name, state: State.NORMAL },
          updateMask: ["state"],
        });
        queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
        queryClient.invalidateQueries({ queryKey: userKeys.stats() });
        toast.success("✅ Đã khôi phục");
        if (memo.parent) {
          queryClient.invalidateQueries({ queryKey: memoKeys.comments(memo.parent) });
        }
      } catch { /* silent */ }
    };

    // Replace loading toast with clickable undo toast
    setTimeout(() => {
      if (!undone) {
        toast.dismiss(toastId);
        toast(
          "🗑️ Đã xóa memo. Bấm để hoàn tác",
          {
            duration: 5000,
            position: "bottom-center",
            style: { background: "#27272a", color: "#fbbf24", borderRadius: "12px", fontSize: "14px", cursor: "pointer" },
            id: toastId + "-undo",
          },
        );
        // Add click listener to the toast
        const toastEl = document.querySelector(`[data-toast-id="${toastId}-undo"]`) as HTMLElement;
        if (toastEl) toastEl.addEventListener("click", handleUndoClick, { once: true });
      }
    }, 100);

    if (memo.parent) {
      queryClient.invalidateQueries({ queryKey: memoKeys.comments(memo.parent) });
    }
    if (isInMemoDetailPage) {
      navigateTo("/");
    }
    memoUpdatedCallback();
  }, [memo.name, memo.parent, isInMemoDetailPage, navigateTo, memoUpdatedCallback, updateMemo, queryClient]);

  // ── HARD DELETE (only from Archived page) ────────────────────────────────
  const confirmDeleteMemo = useCallback(async () => {
    try {
      await deleteMemo(memo.name);
    } catch (error: unknown) {
      handleError(error, toast.error, { context: "Delete memo", fallbackMessage: "An error occurred" });
      return;
    }
    toast.success(t("message.deleted-successfully"));
    if (memo.parent) {
      queryClient.invalidateQueries({ queryKey: memoKeys.comments(memo.parent) });
    }
    if (isInMemoDetailPage) {
      navigateTo("/");
    }
    memoUpdatedCallback();
  }, [memo.name, memo.parent, t, isInMemoDetailPage, navigateTo, memoUpdatedCallback, deleteMemo, queryClient]);

  return {
    handleTogglePinMemoBtnClick,
    handleEditMemoClick,
    handleToggleMemoStatusClick,
    handleCopyLink,
    handleCopyContent,
    handleDeleteMemoClick,
    confirmDeleteMemo,
  };
};
