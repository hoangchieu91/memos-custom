import { useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface DrawioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (file: File) => void;
}

export const DrawioDialog = ({ open, onOpenChange, onSave }: DrawioDialogProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      // Only handle draw.io events if we are open and data is string
      if (!open || !e.data || typeof e.data !== "string") return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "init") {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ action: "load", autosave: 1, xml: "" }),
            "*"
          );
        } else if (msg.event === "save") {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({
              action: "export",
              format: "png",
              spin: "Updating attachment...",
              xml: msg.xml,
            }),
            "*"
          );
        } else if (msg.event === "export") {
          if (msg.data) {
            const res = await fetch(msg.data);
            const blob = await res.blob();
            const file = new File([blob], `diagram-${Date.now()}.png`, { type: "image/png" });
            onSave(file);
            onOpenChange(false);
          }
        } else if (msg.event === "exit") {
          onOpenChange(false);
        }
      } catch (err) {
        // Not a JSON message or not for us
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-full h-[90vh] flex flex-col p-0 border-0 bg-transparent">
        {open && (
          <iframe
            ref={iframeRef}
            src="https://embed.diagrams.net/?embed=1&ui=min&spin=1&saveAndExit=1&keepmodified=1"
            className="w-full h-full border-0 rounded-lg bg-background"
            title="Draw.io Diagram Editor"
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
