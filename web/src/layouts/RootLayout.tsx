import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import usePrevious from "react-use/lib/usePrevious";
import Navigation from "@/components/Navigation";
import AiChatPanel from "@/components/custom/AiChatPanel";
import FocusZenMode from "@/components/custom/FocusZenMode";
import FloatingHub from "@/components/custom/FloatingHub";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import useMediaQuery from "@/hooks/useMediaQuery";
import useNavigateTo from "@/hooks/useNavigateTo";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";
import { redirectOnAuthFailure } from "@/utils/auth-redirect";

const RootLayout = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sm = useMediaQuery("sm");
  const currentUser = useCurrentUser();
  const navigateTo = useNavigateTo();
  const { memoRelatedSetting } = useInstance();
  const { removeFilter } = useMemoFilterContext();
  const pathname = useMemo(() => location.pathname, [location.pathname]);
  const prevPathname = usePrevious(pathname);

  // Mobile sidebar drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const edgeTouchStartX = useRef(0);
  const edgeTouchStartY = useRef(0);

  // Listen to global sidebar toggle events
  useEffect(() => {
    const handleToggle = () => setMobileMenuOpen(prev => !prev);
    const handleOpen = () => setMobileMenuOpen(true);
    const handleClose = () => setMobileMenuOpen(false);

    window.addEventListener("toggle-mobile-sidebar", handleToggle);
    window.addEventListener("open-mobile-sidebar", handleOpen);
    window.addEventListener("close-mobile-sidebar", handleClose);

    return () => {
      window.removeEventListener("toggle-mobile-sidebar", handleToggle);
      window.removeEventListener("open-mobile-sidebar", handleOpen);
      window.removeEventListener("close-mobile-sidebar", handleClose);
    };
  }, []);

  // FloatingHub panel state
  const [aiOpen, setAiOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const handleOpenAI = useCallback(() => setAiOpen(true), []);
  const handleCloseAI = useCallback(() => setAiOpen(false), []);
  const handleOpenFocus = useCallback(() => setFocusOpen(true), []);
  const handleCloseFocus = useCallback(() => setFocusOpen(false), []);

  useEffect(() => {
    if (!currentUser) {
      if (memoRelatedSetting.disallowPublicVisibility) {
        redirectOnAuthFailure(true);
      } else if (pathname === ROUTES.ROOT) {
        // Redirect to login page instead of empty explore page
        navigateTo(ROUTES.AUTH);
      } else {
        redirectOnAuthFailure();
      }
    }
  }, [currentUser, pathname, memoRelatedSetting.disallowPublicVisibility, navigateTo]);

  useEffect(() => {
    if (prevPathname !== pathname && !searchParams.has("filter")) {
      removeFilter(() => true);
    }
  }, [prevPathname, pathname, searchParams, removeFilter]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Edge swipe detection for mobile sidebar
  useEffect(() => {
    if (sm) return; // Desktop doesn't need this

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      edgeTouchStartX.current = touch.clientX;
      edgeTouchStartY.current = touch.clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - edgeTouchStartX.current;
      const deltaY = touch.clientY - edgeTouchStartY.current;

      // Swipe right from left edge (within 30px)
      if (
        edgeTouchStartX.current < 30 &&
        deltaX > 80 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 2
      ) {
        setMobileMenuOpen(true);
      }

      // Swipe left to close (when menu is open)
      if (mobileMenuOpen && deltaX < -60) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [sm, mobileMenuOpen]);

  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("nav_collapsed") !== "false"; } catch { return true; }
  });

  // Sync sidebar width when Navigation toggle fires
  useEffect(() => {
    const onStorage = () => {
      try { setNavCollapsed(localStorage.getItem("nav_collapsed") !== "false"); } catch { /**/ }
    };
    // Poll every 200ms (Navigation uses setState not StorageEvent for same-tab)
    const interval = setInterval(onStorage, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={cn("w-full min-h-full flex flex-row justify-center items-start", sm && (navCollapsed ? "sm:pl-16" : "sm:pl-64"))}>
      {/* Desktop sidebar — width driven by click-toggle state */}
      {sm && (
        <div
          className={cn(
            "flex flex-col justify-start items-start fixed top-0 left-0 select-none h-full bg-sidebar z-50",
            "transition-[width] duration-200 ease-in-out overflow-hidden",
            "border-r border-border",
            navCollapsed ? "w-16" : "w-64",
          )}
        >
          <Navigation className="py-4 md:pt-6 w-full" />
        </div>
      )}

      {/* Mobile sidebar drawer */}
      {!sm && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm transition-opacity duration-300",
              mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            )}
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer */}
          <div
            className={cn(
              "fixed top-0 left-0 z-[999] h-full w-64 bg-sidebar border-r border-border shadow-2xl",
              "transform transition-transform duration-300 ease-out",
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Navigation className="py-6 px-2" collapsed={false} />
          </div>
        </>
      )}

      <main className="w-full h-auto grow shrink flex flex-col justify-start items-center">
        <Outlet />
      </main>
      {currentUser && (
        <>
          <FloatingHub onOpenAI={handleOpenAI} onOpenFocus={handleOpenFocus} />
          <AiChatPanel externalOpen={aiOpen} onExternalClose={handleCloseAI} />
          <FocusZenMode externalOpen={focusOpen} onExternalClose={handleCloseFocus} />
        </>
      )}
    </div>
  );
};

export default RootLayout;
