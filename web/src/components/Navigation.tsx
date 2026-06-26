/**
 * Navigation.tsx — Click-to-toggle sidebar (v2)
 *
 * ✅ Click « / » to expand/collapse (persisted)
 * ✅ Icons always at same position
 * ✅ Collapsed: icon-only (w-16), tooltip on each item
 * ✅ Expanded: icon + label (w-52), group headers visible
 * ✅ Quick search filter (expanded mode)
 * ✅ Active indicator animation (left bar)
 * ✅ Doing badge on Board nav item
 */

import {
  BarChart3Icon, BellIcon, BrainCircuitIcon, DatabaseIcon, EarthIcon,
  LibraryIcon, PackageIcon, PaperclipIcon, SparklesIcon, TagsIcon,
  UserCircleIcon, LayoutDashboardIcon, WorkflowIcon, SunIcon, MoonIcon,
  MonitorIcon, BookOpenIcon, WalletIcon, BanknoteIcon,
  BriefcaseIcon, FileTextIcon, ScrollTextIcon, ChevronDownIcon,
  ChevronsLeftIcon, ChevronsRightIcon, UsersIcon, BookmarkIcon,
  SearchIcon, XIcon, Settings2Icon, ClipboardPasteIcon,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useUserQueries";
import { useMemos } from "@/hooks/useMemoQueries";
import { cn } from "@/lib/utils";
import { Routes } from "@/router";
import { UserNotification_Status } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";
import { getInitialTheme, loadTheme, type Theme } from "@/utils/theme";
import MemosLogo from "./MemosLogo";
import UserMenu from "./UserMenu";

interface NavLinkItem {
  id: string;
  path: string;
  title: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavLinkItem[];
  defaultOpen?: boolean;
}

interface Props {
  collapsed?: boolean;
  className?: string;
}

// ── Nav item ─────────────────────────────────────────────────────────────────
const NavItem = ({ navLink, collapsed }: { navLink: NavLinkItem; collapsed: boolean }) => (
  <NavLink
    className={({ isActive }) =>
      cn(
        "flex flex-row items-center rounded-2xl border transition-colors duration-150 overflow-hidden relative",
        "pl-2 pr-2 py-1.5",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-border drop-shadow"
          : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-accent-border opacity-70 hover:opacity-100",
      )
    }
    to={navLink.path}
    id={navLink.id}
    viewTransition
  >
    {({ isActive }) => (
      <>
        {/* Active indicator bar */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-full animate-in slide-in-from-left-1 duration-200" />
        )}
        {collapsed ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 flex items-center justify-center w-7 h-7 relative">
                  {navLink.icon}
                  {navLink.badge != null && navLink.badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center bg-amber-500 text-white text-[8px] font-bold rounded-full">
                      {navLink.badge > 9 ? "9+" : navLink.badge}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{navLink.title}{navLink.badge ? ` (${navLink.badge})` : ""}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <>
            <span className="shrink-0 flex items-center justify-center w-7 h-7">{navLink.icon}</span>
            <span className="ml-2 text-sm whitespace-nowrap flex-1">{navLink.title}</span>
            {navLink.badge != null && navLink.badge > 0 && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {navLink.badge}
              </span>
            )}
          </>
        )}
      </>
    )}
  </NavLink>
);

// ── Group section ─────────────────────────────────────────────────────────────
const NavGroupSection = ({ group, collapsed }: { group: NavGroup; collapsed: boolean }) => {
  const [open, setOpen] = useState(group.defaultOpen ?? true);

  return (
    <div className="w-full">
      {!collapsed && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-2 py-1 mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors"
        >
          <span>{group.label}</span>
          <ChevronDownIcon className={cn("w-3 h-3 transition-transform", !open && "-rotate-90")} />
        </button>
      )}
      {(open || collapsed) && (
        <div className="flex flex-col gap-0.5">
          {group.items.map((navLink) => (
            <NavItem key={navLink.id} navLink={navLink} collapsed={collapsed} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const COLLAPSE_KEY = "nav_collapsed";

const Navigation = (props: Props) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch { /**/ }
      return next;
    });
  }, []);

  const { className } = props;
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { data: notifications = [] } = useNotifications();

  // Quick search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Count doing tasks for badge
  const { data: memosData } = useMemos({ pageSize: 500 });
  const doingCount = useMemo(() => {
    if (!memosData?.memos) return 0;
    return memosData.memos.filter((m) => (m.tags || []).includes("doing")).length;
  }, [memosData]);

  const [theme, setTheme] = useState<Theme>(getInitialTheme());
  const THEME_CYCLE: Theme[] = ["system", "default", "default-dark", "paper"];
  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
    setTheme(nextTheme);
    loadTheme(nextTheme);
  }, [theme]);

  const themeIcon =
    theme === "default" ? <SunIcon className="w-5 h-5 shrink-0" /> :
    theme === "default-dark" ? <MoonIcon className="w-5 h-5 shrink-0" /> :
    theme === "paper" ? <BookOpenIcon className="w-5 h-5 shrink-0" /> :
    <MonitorIcon className="w-5 h-5 shrink-0" />;
  const themeLabel =
    theme === "default" ? "Light" :
    theme === "default-dark" ? "Dark" :
    theme === "paper" ? "Paper" : "System";

  const unreadCount = notifications.filter((n) => n.status === UserNotification_Status.UNREAD).length;

  const groups: NavGroup[] = [
    {
      id: "notes",
      label: "📒 Ghi chú",
      defaultOpen: true,
      items: [
        { id: "header-memos", path: Routes.ROOT, title: t("common.memos"), icon: <LibraryIcon className="w-5 h-5" /> },
        { id: "header-clipboard", path: "/clipboard", title: "Clipboard", icon: <ClipboardPasteIcon className="w-5 h-5" /> },
        { id: "header-bookmarks", path: "/bookmarks", title: "Dấu trang", icon: <BookmarkIcon className="w-5 h-5" /> },
        { id: "header-board", path: Routes.BOARD, title: "Bảng Tasks", icon: <LayoutDashboardIcon className="w-5 h-5" />, badge: doingCount },
        { id: "header-timeline", path: "/timeline", title: "Quest Timeline", icon: <SparklesIcon className="w-5 h-5" /> },
        { id: "header-graph", path: Routes.GRAPH, title: "Bản đồ Tri thức", icon: <BrainCircuitIcon className="w-5 h-5" /> },
      ],
    },
    {
      id: "finance",
      label: "💰 Tài chính",
      defaultOpen: true,
      items: [
        { id: "header-cashflow", path: "/cashflow", title: "Thu Chi", icon: <BanknoteIcon className="w-5 h-5" /> },
        { id: "header-debt", path: "/debt", title: "Công nợ", icon: <WalletIcon className="w-5 h-5" /> },
        { id: "header-assets", path: "/inventory", title: "Tài sản", icon: <PackageIcon className="w-5 h-5" /> },
      ],
    },
    {
      id: "work",
      label: "🏢 Công việc",
      defaultOpen: true,
      items: [
        { id: "header-projects", path: "/projects", title: "Dự án", icon: <BriefcaseIcon className="w-5 h-5" /> },
        { id: "header-contracts", path: "/contracts", title: "Hợp đồng", icon: <FileTextIcon className="w-5 h-5" /> },
        { id: "header-documents", path: "/documents", title: "Biên bản", icon: <ScrollTextIcon className="w-5 h-5" /> },
      ],
    },
    {
      id: "system",
      label: "⚙️ Hệ thống",
      defaultOpen: false,
      items: [
        { id: "header-system", path: "/system", title: "Điều khiển Hệ thống", icon: <Settings2Icon className="w-5 h-5" /> },
        { id: "header-stats", path: "/stats", title: "Thống kê", icon: <BarChart3Icon className="w-5 h-5" /> },
        { id: "header-tags", path: "/tags", title: "Quản lý Tag", icon: <TagsIcon className="w-5 h-5" /> },
        { id: "header-contacts", path: "/contacts", title: "Danh bạ", icon: <UsersIcon className="w-5 h-5" /> },
        { id: "header-nocodb", path: "/nocodb", title: "NocoDB", icon: <DatabaseIcon className="w-5 h-5" /> },
        { id: "header-n8n", path: "/n8n", title: "Tự động hóa", icon: <WorkflowIcon className="w-5 h-5" /> },
        { id: "header-explore", path: Routes.EXPLORE, title: t("common.explore"), icon: <EarthIcon className="w-5 h-5" /> },
        {
          id: "header-inbox", path: Routes.INBOX, title: t("common.inbox"),
          badge: unreadCount > 0 ? unreadCount : undefined,
          icon: (
            <div className="relative w-5 h-5 flex items-center justify-center">
              <BellIcon className="w-5 h-5" />
            </div>
          ),
        },
        { id: "header-attachments", path: Routes.ATTACHMENTS, title: t("common.attachments"), icon: <PaperclipIcon className="w-5 h-5" /> },
      ],
    },
  ];

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.title.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
      ),
    })).filter((group) => group.items.length > 0);
  }, [groups, searchQuery]);

  const guestLinks: NavLinkItem[] = [
    { id: "header-explore", path: Routes.EXPLORE, title: t("common.explore"), icon: <EarthIcon className="w-5 h-5" /> },
    { id: "header-auth", path: Routes.AUTH, title: t("common.sign-in"), icon: <UserCircleIcon className="w-5 h-5" /> },
  ];

  return (
    <header className={cn("w-full h-full overflow-y-auto overflow-x-hidden flex flex-col justify-between items-start gap-2", className)}>
      {/* Top: logo + toggle */}
      <div className="w-full px-1 py-1 flex flex-col justify-start items-start space-y-1 overflow-y-auto overflow-x-hidden shrink">
        <div className="w-full flex items-center justify-between mb-2 px-1">
          <NavLink className="cursor-default" to={currentUser ? Routes.ROOT : Routes.EXPLORE}>
            <MemosLogo collapsed={collapsed} />
          </NavLink>
          <button
            onClick={toggle}
            title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors"
          >
            {collapsed
              ? <ChevronsRightIcon className="w-3.5 h-3.5" />
              : <ChevronsLeftIcon className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Quick search (expanded mode only) */}
        {!collapsed && currentUser && (
          <div className="w-full px-1 mb-2 relative">
            <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm menu..."
              className="w-full h-7 pl-7 pr-7 rounded-lg border border-border/50 bg-sidebar-accent/30 text-xs text-sidebar-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Nav groups */}
        {currentUser ? (
          <div className="w-full flex flex-col gap-3">
            {filteredGroups.map((group) => (
              <NavGroupSection key={group.id} group={group} collapsed={collapsed} />
            ))}
            {searchQuery && filteredGroups.length === 0 && (
              <p className="text-[10px] text-muted-foreground/50 text-center py-4">
                Không tìm thấy
              </p>
            )}
          </div>
        ) : (
          guestLinks.map((link) => (
            <NavItem key={link.id} navLink={link} collapsed={collapsed} />
          ))
        )}
      </div>

      {/* Bottom: theme + user */}
      <div className="w-full flex flex-col gap-1 pb-2 px-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={cycleTheme}
                className={cn(
                  "flex items-center pl-2 pr-2 py-1.5 rounded-2xl border border-transparent",
                  "text-sidebar-foreground opacity-60 hover:opacity-100 hover:bg-sidebar-accent hover:border-sidebar-accent-border transition-colors",
                  !collapsed && "w-full",
                )}
                title={`Theme: ${themeLabel}`}
              >
                <span className="shrink-0 flex items-center justify-center w-7 h-7">{themeIcon}</span>
                {!collapsed && <span className="ml-2 text-sm">{themeLabel}</span>}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right"><p>Theme: {themeLabel}</p></TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {currentUser && (
          <UserMenu collapsed={collapsed} />
        )}
      </div>
    </header>
  );
};

export default Navigation;
