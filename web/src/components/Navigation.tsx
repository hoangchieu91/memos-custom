import {
  BarChart3Icon, BellIcon, BrainCircuitIcon, DatabaseIcon, EarthIcon,
  LibraryIcon, PackageIcon, PaperclipIcon, SparklesIcon, TagsIcon,
  UserCircleIcon, LayoutDashboardIcon, WorkflowIcon, SunIcon, MoonIcon,
  MonitorIcon, BookOpenIcon, WalletIcon, BanknoteIcon, HandCoinsIcon,
  BriefcaseIcon, FileTextIcon, ScrollTextIcon, ChevronDownIcon,
} from "lucide-react";
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

// ── Collapsible group component ──────────────────────────────────────────────
const NavGroupSection = ({
  group,
  collapsed,
}: {
  group: NavGroup;
  collapsed?: boolean;
}) => {
  const [open, setOpen] = useState(group.defaultOpen ?? true);

  return (
    <div className="w-full">
      {/* Group header – hidden when collapsed */}
      {!collapsed && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-1 mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
        >
          <span>{group.label}</span>
          <ChevronDownIcon
            className={cn("w-3 h-3 transition-transform", !open && "-rotate-90")}
          />
        </button>
      )}
      {/* Items – always shown when collapsed (icons only), otherwise toggleable */}
      {(open || collapsed) && (
        <div className="flex flex-col gap-0.5 w-full">
          {group.items.map((navLink) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "px-2 py-2 rounded-2xl border flex flex-row items-center text-base text-sidebar-foreground transition-colors",
                  collapsed ? "" : "w-full px-3",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-border drop-shadow"
                    : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-accent-border opacity-70 hover:opacity-100",
                )
              }
              key={navLink.id}
              to={navLink.path}
              id={navLink.id}
              viewTransition
            >
              {collapsed ? (
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
                <>
                  {navLink.icon}
                  <span className="ml-2.5 truncate text-sm">{navLink.title}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Navigation ───────────────────────────────────────────────────────────
const Navigation = (props: Props) => {
  const { collapsed, className } = props;
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { data: notifications = [] } = useNotifications();

  const [theme, setTheme] = useState<Theme>(getInitialTheme());
  const THEME_CYCLE: Theme[] = ["system", "default", "default-dark", "paper"];
  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
    setTheme(nextTheme);
    loadTheme(nextTheme);
  }, [theme]);

  const themeIcon =
    theme === "default" ? <SunIcon className="w-5 h-5" /> :
    theme === "default-dark" ? <MoonIcon className="w-5 h-5" /> :
    theme === "paper" ? <BookOpenIcon className="w-5 h-5" /> :
    <MonitorIcon className="w-5 h-5" />;
  const themeLabel =
    theme === "default" ? "Light" :
    theme === "default-dark" ? "Dark" :
    theme === "paper" ? "Paper" : "System";

  const unreadCount = notifications.filter((n) => n.status === UserNotification_Status.UNREAD).length;

  // ── Groups ────────────────────────────────────────────────────────────────
  const groups: NavGroup[] = [
    {
      id: "notes",
      label: "📒 Ghi chú",
      defaultOpen: true,
      items: [
        { id: "header-memos", path: Routes.ROOT, title: t("common.memos"), icon: <LibraryIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-board", path: Routes.BOARD, title: "Bảng Tasks", icon: <LayoutDashboardIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-timeline", path: "/timeline", title: "Quest Timeline", icon: <SparklesIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-graph", path: Routes.GRAPH, title: "Bản đồ Tri thức", icon: <BrainCircuitIcon className="w-5 h-5 shrink-0" /> },
      ],
    },
    {
      id: "finance",
      label: "💰 Tài chính",
      defaultOpen: true,
      items: [
        { id: "header-cashflow", path: "/cashflow", title: "Thu Chi", icon: <BanknoteIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-debt", path: "/debt", title: "Công nợ", icon: <WalletIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-salary", path: "/salary", title: "Lương & Gia đình", icon: <HandCoinsIcon className="w-5 h-5 shrink-0" /> },
      ],
    },
    {
      id: "work",
      label: "🏢 Công việc",
      defaultOpen: true,
      items: [
        { id: "header-projects", path: "/projects", title: "Dự án", icon: <BriefcaseIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-contracts", path: "/contracts", title: "Hợp đồng", icon: <FileTextIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-documents", path: "/documents", title: "Biên bản", icon: <ScrollTextIcon className="w-5 h-5 shrink-0" /> },
      ],
    },
    {
      id: "system",
      label: "⚙️ Hệ thống",
      defaultOpen: false,
      items: [
        { id: "header-assets", path: "/inventory", title: "Tài sản", icon: <PackageIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-stats", path: "/stats", title: "Thống kê", icon: <BarChart3Icon className="w-5 h-5 shrink-0" /> },
        { id: "header-tags", path: "/tags", title: "Quản lý Tag", icon: <TagsIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-nocodb", path: "/nocodb", title: "CRM / Contacts", icon: <DatabaseIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-n8n", path: "/n8n", title: "Tự động hóa", icon: <WorkflowIcon className="w-5 h-5 shrink-0" /> },
        { id: "header-explore", path: Routes.EXPLORE, title: t("common.explore"), icon: <EarthIcon className="w-5 h-5 shrink-0" /> },
        {
          id: "header-inbox", path: Routes.INBOX, title: t("common.inbox"),
          icon: (
            <div className="relative">
              <BellIcon className="w-5 h-5 shrink-0" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center bg-primary text-primary-foreground text-[9px] font-semibold rounded-full border-2 border-background">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          ),
        },
        { id: "header-attachments", path: Routes.ATTACHMENTS, title: t("common.attachments"), icon: <PaperclipIcon className="w-5 h-5 shrink-0" /> },
      ],
    },
  ];

  const guestLinks: NavLinkItem[] = [
    { id: "header-explore", path: Routes.EXPLORE, title: t("common.explore"), icon: <EarthIcon className="w-5 h-5 shrink-0" /> },
    { id: "header-auth", path: Routes.AUTH, title: t("common.sign-in"), icon: <UserCircleIcon className="w-5 h-5 shrink-0" /> },
  ];

  return (
    <header className={cn("w-full h-full overflow-auto flex flex-col justify-between items-start gap-2", className)}>
      <div className="w-full px-1 py-1 flex flex-col justify-start items-start space-y-1 overflow-auto overflow-x-hidden shrink">
        <NavLink className="mb-2 cursor-default" to={currentUser ? Routes.ROOT : Routes.EXPLORE}>
          <MemosLogo collapsed={collapsed} />
        </NavLink>

        {currentUser ? (
          <div className="w-full flex flex-col gap-3">
            {groups.map((group) => (
              <NavGroupSection key={group.id} group={group} collapsed={collapsed} />
            ))}
          </div>
        ) : (
          guestLinks.map((link) => (
            <NavLink
              key={link.id}
              id={link.id}
              to={link.path}
              className={({ isActive }) =>
                cn(
                  "px-2 py-2 rounded-2xl border flex flex-row items-center text-base text-sidebar-foreground transition-colors w-full px-3",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-border drop-shadow"
                    : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-accent-border opacity-70",
                )
              }
            >
              {link.icon}
              {!collapsed && <span className="ml-2.5 text-sm">{link.title}</span>}
            </NavLink>
          ))
        )}
      </div>

      {/* Theme toggle */}
      <div className={cn("w-full flex", collapsed ? "justify-center" : "px-3")}>
        <button
          onClick={cycleTheme}
          className={cn(
            "p-2 rounded-xl border border-transparent text-sidebar-foreground opacity-60 hover:opacity-100 hover:bg-sidebar-accent hover:border-sidebar-accent-border transition-all",
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
        <div className={cn("w-full flex flex-col justify-end", collapsed ? "items-center" : "items-start pl-3")}>
          <UserMenu collapsed={collapsed} />
        </div>
      )}
    </header>
  );
};

export default Navigation;
