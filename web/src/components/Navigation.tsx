import { BarChart3Icon, BellIcon, BrainCircuitIcon, DatabaseIcon, EarthIcon, LibraryIcon, PackageIcon, PaperclipIcon, SparklesIcon, TagsIcon, UserCircleIcon, LayoutDashboardIcon, WorkflowIcon, SunIcon, MoonIcon, MonitorIcon, BookOpenIcon, WalletIcon, ShoppingBagIcon, BanknoteIcon } from "lucide-react";
import { useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useUserQueries";
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
}

interface Props {
  collapsed?: boolean;
  className?: string;
}

const Navigation = (props: Props) => {
  const { collapsed, className } = props;
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { data: notifications = [] } = useNotifications();

  // Theme toggle state
  const [theme, setTheme] = useState<Theme>(getInitialTheme());
  const THEME_CYCLE: Theme[] = ["system", "default", "default-dark", "paper"];
  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
    setTheme(nextTheme);
    loadTheme(nextTheme);
  }, [theme]);

  const themeIcon = theme === "default" ? <SunIcon className="w-5 h-5" /> : theme === "default-dark" ? <MoonIcon className="w-5 h-5" /> : theme === "paper" ? <BookOpenIcon className="w-5 h-5" /> : <MonitorIcon className="w-5 h-5" />;
  const themeLabel = theme === "default" ? "Light" : theme === "default-dark" ? "Dark" : theme === "paper" ? "Paper" : "System";

  const homeNavLink: NavLinkItem = {
    id: "header-memos",
    path: Routes.ROOT,
    title: t("common.memos"),
    icon: <LibraryIcon className="w-6 h-auto shrink-0" />,
  };
  const exploreNavLink: NavLinkItem = {
    id: "header-explore",
    path: Routes.EXPLORE,
    title: t("common.explore"),
    icon: <EarthIcon className="w-6 h-auto shrink-0" />,
  };
  const boardNavLink: NavLinkItem = {
    id: "header-board",
    path: Routes.BOARD,
    title: "Bảng Tasks",
    icon: <LayoutDashboardIcon className="w-6 h-auto shrink-0" />,
  };
  const attachmentsNavLink: NavLinkItem = {
    id: "header-attachments",
    path: Routes.ATTACHMENTS,
    title: t("common.attachments"),
    icon: <PaperclipIcon className="w-6 h-auto shrink-0" />,
  };
  const unreadCount = notifications.filter((n) => n.status === UserNotification_Status.UNREAD).length;
  const inboxNavLink: NavLinkItem = {
    id: "header-inbox",
    path: Routes.INBOX,
    title: t("common.inbox"),
    icon: (
      <div className="relative">
        <BellIcon className="w-6 h-auto shrink-0" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-semibold rounded-full border-2 border-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    ),
  };
  const signInNavLink: NavLinkItem = {
    id: "header-auth",
    path: Routes.AUTH,
    title: t("common.sign-in"),
    icon: <UserCircleIcon className="w-6 h-auto shrink-0" />,
  };

  const graphNavLink: NavLinkItem = {
    id: "header-graph",
    path: Routes.GRAPH,
    title: "Bản đồ Tri thức",
    icon: <BrainCircuitIcon className="w-6 h-auto shrink-0" />,
  };

  const nocodbNavLink: NavLinkItem = {
    id: "header-nocodb",
    path: "/nocodb",
    title: "CRM / Contacts",
    icon: <DatabaseIcon className="w-6 h-auto shrink-0" />,
  };
  const n8nNavLink: NavLinkItem = {
    id: "header-n8n",
    path: "/n8n",
    title: "Tự động hóa",
    icon: <WorkflowIcon className="w-6 h-auto shrink-0" />,
  };
  const timelineNavLink: NavLinkItem = {
    id: "header-timeline",
    path: "/timeline",
    title: "Quest Timeline",
    icon: <SparklesIcon className="w-6 h-auto shrink-0" />,
  };
  const tagsNavLink: NavLinkItem = {
    id: "header-tags",
    path: "/tags",
    title: "Quản lý Tag",
    icon: <TagsIcon className="w-6 h-auto shrink-0" />,
  };
  const assetsNavLink: NavLinkItem = {
    id: "header-assets",
    path: "/inventory",
    title: "Tài sản",
    icon: <PackageIcon className="w-6 h-auto shrink-0" />,
  };
  const statsNavLink: NavLinkItem = {
    id: "header-stats",
    path: "/stats",
    title: "Th\u1ed1ng k\u00ea",
    icon: <BarChart3Icon className="w-6 h-auto shrink-0" />,
  };
  const debtNavLink: NavLinkItem = {
    id: "header-debt",
    path: "/debt",
    title: "Công nợ",
    icon: <WalletIcon className="w-6 h-auto shrink-0" />,
  };
  const cashflowNavLink: NavLinkItem = {
    id: "header-cashflow",
    path: "/cashflow",
    title: "Thu Chi",
    icon: <BanknoteIcon className="w-6 h-auto shrink-0" />,
  };

  const navLinks: NavLinkItem[] = currentUser
    ? [homeNavLink, boardNavLink, graphNavLink, timelineNavLink, tagsNavLink, assetsNavLink, debtNavLink, cashflowNavLink, statsNavLink, nocodbNavLink, n8nNavLink, exploreNavLink, attachmentsNavLink, inboxNavLink]
    : [exploreNavLink, signInNavLink];

  return (
    <header className={cn("w-full h-full overflow-auto flex flex-col justify-between items-start gap-4", className)}>
      <div className="w-full px-1 py-1 flex flex-col justify-start items-start space-y-2 overflow-auto overflow-x-hidden shrink">
        <NavLink className="mb-3 cursor-default" to={currentUser ? Routes.ROOT : Routes.EXPLORE}>
          <MemosLogo collapsed={collapsed} />
        </NavLink>
        {navLinks.map((navLink) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                "px-2 py-2 rounded-2xl border flex flex-row items-center text-lg text-sidebar-foreground transition-colors",
                collapsed ? "" : "w-full px-4",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-border drop-shadow"
                  : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-accent-border opacity-80",
              )
            }
            key={navLink.id}
            to={navLink.path}
            id={navLink.id}
            viewTransition
          >
            {props.collapsed ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>{navLink.icon}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{navLink.title}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              navLink.icon
            )}
            {!props.collapsed && <span className="ml-3 truncate">{navLink.title}</span>}
          </NavLink>
        ))}
      </div>

      {/* Theme toggle */}
      <div className={cn("w-full flex", props.collapsed ? "justify-center" : "px-3")}>
        <button
          onClick={cycleTheme}
          className={cn(
            "p-2 rounded-xl border border-transparent text-sidebar-foreground opacity-70 hover:opacity-100 hover:bg-sidebar-accent hover:border-sidebar-accent-border transition-all",
            !collapsed && "w-full flex items-center gap-3"
          )}
          title={`Theme: ${themeLabel}`}
        >
          {collapsed ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>{themeIcon}</div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Theme: {themeLabel}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <>
              {themeIcon}
              <span className="text-sm">Theme: {themeLabel}</span>
            </>
          )}
        </button>
      </div>

      {currentUser && (
        <div className={cn("w-full flex flex-col justify-end", props.collapsed ? "items-center" : "items-start pl-3")}>
          <UserMenu collapsed={collapsed} />
        </div>
      )}
    </header>
  );
};

export default Navigation;
