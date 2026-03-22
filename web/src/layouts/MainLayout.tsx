import { useEffect, useMemo, useState } from "react";
import { matchPath, Outlet, useLocation } from "react-router-dom";
import type { MemoExplorerContext } from "@/components/MemoExplorer";
import { MemoExplorer } from "@/components/MemoExplorer";
import { userServiceClient } from "@/connect";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useFilteredMemoStats } from "@/hooks/useFilteredMemoStats";
import useMediaQuery from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { Routes } from "@/router";

const MainLayout = () => {
  const md = useMediaQuery("md");
  const lg = useMediaQuery("lg");
  const location = useLocation();
  const currentUser = useCurrentUser();
  const [profileUserName, setProfileUserName] = useState<string | undefined>();

  // Track sidebar collapsed state (synced with Navigation & RootLayout)
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("nav_collapsed") !== "false"; } catch { return true; }
  });

  useEffect(() => {
    const onStorage = () => {
      try { setNavCollapsed(localStorage.getItem("nav_collapsed") !== "false"); } catch { /**/ }
    };
    const interval = setInterval(onStorage, 200);
    return () => clearInterval(interval);
  }, []);

  // Determine context based on current route
  const context: MemoExplorerContext = useMemo(() => {
    if (location.pathname === Routes.ROOT) return "home";
    if (location.pathname === Routes.EXPLORE) return "explore";
    if (matchPath("/archived", location.pathname)) return "archived";
    if (matchPath("/u/:username", location.pathname)) return "profile";
    return "home"; // fallback
  }, [location.pathname]);

  // Extract username from URL for profile context
  useEffect(() => {
    const match = matchPath("/u/:username", location.pathname);
    if (match && context === "profile") {
      const username = match.params.username;
      if (username) {
        userServiceClient
          .getUser({ name: `users/${username}` })
          .then((user) => {
            setProfileUserName(user.name);
          })
          .catch((error) => {
            console.error("Failed to fetch profile user:", error);
            setProfileUserName(undefined);
          });
      }
    } else {
      setProfileUserName(undefined);
    }
  }, [location.pathname, context]);

  const statsUserName = useMemo(() => {
    if (context === "home") return currentUser?.name;
    if (context === "profile") return profileUserName;
    return undefined;
  }, [context, currentUser, profileUserName]);

  const { statistics, tags } = useFilteredMemoStats({ userName: statsUserName, context });

  // Explorer panel width
  const explorerW = lg ? "w-72" : "w-56";

  return (
    <section className="w-full min-h-svh flex flex-row justify-center items-start overflow-x-hidden">
      {/* 1. Mobile Top Spacer (only on non-md) */}
      {!md && <div className="h-14 shrink-0" />}

      {/* 2. PC Explorer (hidden on mobile) */}
      {md && (
        <div className={cn("fixed top-0 bottom-0 z-40 border-r border-border bg-sidebar transition-all duration-200 overflow-y-auto", 
          navCollapsed ? "left-16" : "left-64", 
          explorerW
        )}>
          <MemoExplorer className="px-3 py-6" context={context} statisticsData={statistics} tagCount={tags} />
        </div>
      )}

      {/* 3. Main Content Area */}
      {/* We add padding-left to the main content ONLY for the Explorer width, because RootLayout already handles Sidebar padding */}
      <main className={cn("flex-1 h-auto transition-all duration-300", md ? (lg ? "pl-72" : "pl-56") : "pt-14")}>
        <div className="w-full max-w-full mx-auto px-4 sm:px-6 lg:px-12 xl:px-24 md:py-8 transition-all duration-300">
          <Outlet />
        </div>
      </main>
    </section>
  );
};

export default MainLayout;
