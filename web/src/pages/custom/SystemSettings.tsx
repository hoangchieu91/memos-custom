import { 
  DatabaseIcon, 
  LibraryIcon, 
  RotateCwIcon, 
  ServerIcon, 
  Settings2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type SyncStatus = "idle" | "running" | "success" | "error";

const SystemSettings = () => {
  const [libSyncStatus, setLibSyncStatus] = useState<SyncStatus>("idle");
  const [memoSyncStatus, setMemoSyncStatus] = useState<SyncStatus>("idle");
  const [lastLog, setLastLog] = useState<string>("");

  const handleSyncLibrary = async () => {
    setLibSyncStatus("running");
    setLastLog("Đang kích hoạt quét ổ Z:\\Library...");
    
    try {
      const response = await fetch("https://memos.taileeaab.ts.net/n8n-hook/sync-library", {
        method: "POST",
      });
      
      if (response.ok) {
        setLibSyncStatus("success");
        setLastLog("✅ Đã kích hoạt sync thư viện thành công!");
      } else {
        throw new Error("Webhook error");
      }
    } catch (error) {
      setLibSyncStatus("error");
      setLastLog("❌ Lỗi kích hoạt sync. Hãy kiểm tra kết nối n8n.");
    }
  };

  const handleSyncMemos = async () => {
    setMemoSyncStatus("running");
    setLastLog("Đang kích hoạt sync Memos -> Gemini...");
    
    try {
      const response = await fetch("https://memos.taileeaab.ts.net/n8n-hook/sync-memos", {
        method: "POST",
      });
      
      if (response.ok) {
        setMemoSyncStatus("success");
        setLastLog("✅ Đã kích hoạt sync Memos thành công!");
      } else {
        throw new Error("Webhook error");
      }
    } catch (error) {
      setMemoSyncStatus("error");
      setLastLog("❌ Lỗi kích hoạt sync Memos. Hãy kiểm tra n8n.");
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6 font-sans">
      <div className="flex flex-row items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <Settings2Icon className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Trung tâm Điều khiển Hệ thống</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Library Sync */}
        <div className="flex flex-col rounded-2xl border border-sidebar-border/50 bg-sidebar/30 backdrop-blur-sm overflow-hidden p-6 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-primary mb-1">
              <LibraryIcon className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Storage</span>
            </div>
            <h2 className="text-lg font-semibold">Thư viện Kiến thức (4TB)</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Quét thư mục Inbox trên ổ Z:, phân loại tài liệu và tạo AI Memory.
            </p>
          </div>
          <Button 
            onClick={handleSyncLibrary} 
            disabled={libSyncStatus === "running"}
            className="w-full rounded-xl gap-2 h-11 transition-all"
          >
            {libSyncStatus === "running" ? (
              <RotateCwIcon className="w-4 h-4 animate-spin" />
            ) : libSyncStatus === "success" ? (
              <CheckCircle2Icon className="w-4 h-4" />
            ) : (
              <RotateCwIcon className="w-4 h-4" />
            )}
            {libSyncStatus === "running" ? "Đang chạy..." : "Đồng bộ Thư viện ngay"}
          </Button>
        </div>

        {/* Memos Sync */}
        <div className="flex flex-col rounded-2xl border border-sidebar-border/50 bg-sidebar/30 backdrop-blur-sm overflow-hidden p-6 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-amber-500 mb-1">
              <DatabaseIcon className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">AI Memory</span>
            </div>
            <h2 className="text-lg font-semibold">Bộ nhớ Memos {"->"} Gemini</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Chuyển đổi các ghi chú trong Memos thành Knowledge Items cho AI.
            </p>
          </div>
          <Button 
            onClick={handleSyncMemos} 
            disabled={memoSyncStatus === "running"}
            variant="outline"
            className="w-full rounded-xl gap-2 h-11 border-sidebar-border hover:bg-sidebar-accent transition-all"
          >
            {memoSyncStatus === "running" ? (
              <RotateCwIcon className="w-4 h-4 animate-spin" />
            ) : memoSyncStatus === "success" ? (
              <CheckCircle2Icon className="w-4 h-4 text-green-500" />
            ) : (
              <RotateCwIcon className="w-4 h-4" />
            )}
            {memoSyncStatus === "running" ? "Đang chuẩn bị..." : "Chạy Sync Memos"}
          </Button>
        </div>
      </div>

      {/* Status & Log Console */}
      <div className="flex flex-col rounded-2xl border border-sidebar-border/50 bg-black/5 dark:bg-white/5 backdrop-blur-sm p-4 gap-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ServerIcon className="w-4 h-4 text-muted-foreground" />
          Nhật ký hoạt động
        </h3>
        <div className="font-mono text-[11px] h-[100px] leading-relaxed p-3 rounded-lg bg-black/40 text-green-400 border border-white/5 overflow-y-auto whitespace-pre-wrap">
          {lastLog ? (
            <div className="animate-in fade-in duration-300">
              {"> "} {lastLog}
            </div>
          ) : (
            <div className="text-muted-foreground/30 italic">Sẵn sàng thực hiện lệnh...</div>
          )}
        </div>
      </div>

      {/* Info Alert */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
        <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <p className="font-bold mb-1">Hướng dẫn Cấu hình:</p>
          <p>Hệ thống sử dụng n8n để kích hoạt các script Python trên Windows/Server. Hãy đảm bảo bạn đã tạo Workflow n8n với Webhook tương ứng và lệnh SSH: 
          <code className="mx-1 px-1 bg-black/10 rounded">python D:\00_Code\Adguard\memory-bridge\library_manager.py</code></p>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
