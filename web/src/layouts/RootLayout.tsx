import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import usePrevious from "react-use/lib/usePrevious";
import Navigation from "@/components/Navigation";
import AiChatPanel from "@/components/AiChatPanel";
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

  return (
    <div className="w-full min-h-full flex flex-row justify-center items-start sm:pl-16">
      {/* Desktop sidebar */}
      {sm && (
        <div
          className={cn(
            "group flex flex-col justify-start items-start fixed top-0 left-0 select-none h-full bg-sidebar",
            "w-16 px-2",
            "border-r border-border",
          )}
        >
          <Navigation className="py-4 md:pt-6" collapsed={true} />
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
      {currentUser && <AiChatPanel />}
    </div>
  );
};

export default RootLayout;
