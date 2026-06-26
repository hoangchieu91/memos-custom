import { useInstance } from "@/contexts/InstanceContext";
import { MenuIcon } from "lucide-react";
import UserAvatar from "./UserAvatar";

const NavigationDrawer = () => {
  const { generalSetting } = useInstance();
  const title = generalSetting.customProfile?.title || "Memos";
  const avatarUrl = generalSetting.customProfile?.logoUrl || "/full-logo.webp";

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("toggle-mobile-sidebar"));
  };

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-accent/40 active:scale-95 transition-all text-left border border-transparent hover:border-border/30 shadow-sm bg-background/50 backdrop-blur-md"
    >
      <MenuIcon className="w-4 h-4 text-muted-foreground" />
      <UserAvatar className="shrink-0 w-6 h-6 rounded-md border border-border/50" avatarUrl={avatarUrl} />
      <span className="font-bold text-sm leading-none text-ellipsis overflow-hidden text-foreground">
        {title}
      </span>
    </button>
  );
};

export default NavigationDrawer;
