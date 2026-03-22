import { useEffect, useState, useCallback } from "react";
import { FocusIcon, XIcon, MoonStarIcon, SendIcon } from "lucide-react";
import { useCreateMemo } from "@/hooks/useMemoQueries";
import toast from "react-hot-toast";

const GRADIENTS = [
  "from-indigo-900 via-purple-900 to-slate-900",
  "from-emerald-900 via-teal-900 to-cyan-900",
  "from-rose-900 via-pink-900 to-fuchsia-900",
  "from-amber-900 via-orange-900 to-red-900",
  "from-blue-900 via-indigo-900 to-violet-900",
];

const QUOTES = [
  { text: "Tập trung là nghệ thuật loại bỏ.", author: "Warren Buffett" },
  { text: "Hãy viết. Và đừng nghĩ quá nhiều.", author: "Ernest Hemingway" },
  { text: "Mỗi ngày là một trang giấy mới.", author: "Personal OS" },
  { text: "Sự tĩnh lặng là nguồn sức mạnh vĩ đại.", author: "Lão Tử" },
  { text: "Viết là cách suy nghĩ rõ ràng nhất.", author: "Paul Graham" },
];

export const FocusZenMode = ({
  externalOpen,
  onExternalClose,
}: {
  externalOpen?: boolean;
  onExternalClose?: () => void;
} = {}) => {
  const [internalActive, setInternalActive] = useState(false);
  const isExternallyControlled = externalOpen !== undefined;
  const isActive = isExternallyControlled ? externalOpen : internalActive;
  const setIsActive = isExternallyControlled
    ? (v: boolean) => {
        if (v) setInternalActive(true);
        else { setInternalActive(false); if (onExternalClose) onExternalClose(); }
      }
    : setInternalActive;
  const [content, setContent] = useState("");
  const [gradientIndex, setGradientIndex] = useState(0);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  const [wordCount, setWordCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const createMemo = useCreateMemo();

  // Rotate gradient slowly
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setGradientIndex((prev) => (prev + 1) % GRADIENTS.length);
    }, 15000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Timer
  useEffect(() => {
    if (!isActive || !startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, startTime]);

  // Word count
  useEffect(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [content]);

  // ESC to exit
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsActive(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, setIsActive]);

  // External open trigger
  useEffect(() => {
    if (isExternallyControlled && externalOpen && !internalActive) {
      setInternalActive(true);
      setStartTime(Date.now());
      setContent("");
      setElapsed(0);
    }
  }, [externalOpen, isExternallyControlled, internalActive]);

  const handleActivate = useCallback(() => {
    setIsActive(true);
    setStartTime(Date.now());
    setContent("");
    setElapsed(0);
  }, [setIsActive]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      toast.error("Nội dung trống!");
      return;
    }
    try {
      await createMemo.mutateAsync({ content: content + "\n#focus #zen" } as any);
      toast.success("Đã lưu ghi chú Focus! 🧘");
      setIsActive(false);
    } catch {
      toast.error("Lỗi lưu ghi chú");
    }
  }, [content, createMemo, setIsActive]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  if (!isActive) {
    // When externally controlled, don't render standalone FAB
    if (isExternallyControlled) return null;
    return (
      <button
        onClick={handleActivate}
        className="fixed bottom-24 left-4 z-40 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md opacity-30 hover:opacity-100 hover:w-12 hover:h-12 hover:shadow-xl transition-all duration-200 flex items-center justify-center"
        title="Focus / Zen Mode 🧘"
      >
        <FocusIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-gradient-to-br ${GRADIENTS[gradientIndex]} transition-all duration-[3000ms] flex flex-col items-center justify-center`}
    >
      {/* Close button */}
      <button
        onClick={() => setIsActive(false)}
        className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
        title="Thoát (ESC)"
      >
        <XIcon className="w-5 h-5" />
      </button>

      {/* Header with stats */}
      <div className="absolute top-6 left-6 flex items-center gap-4 text-white/50 text-sm font-mono">
        <span>⏱ {formatTime(elapsed)}</span>
        <span>📝 {wordCount} từ</span>
      </div>

      {/* Zen icon */}
      <div className="mb-6 animate-pulse">
        <MoonStarIcon className="w-10 h-10 text-white/20" />
      </div>

      {/* Quote */}
      <div className="mb-8 text-center px-4">
        <p className="text-white/40 text-lg italic font-light">"{quote.text}"</p>
        <p className="text-white/25 text-sm mt-2">— {quote.author}</p>
      </div>

      {/* Writing area */}
      <div className="w-full max-w-2xl px-6">
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Bắt đầu viết..."
          className="w-full h-64 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-white text-lg leading-relaxed placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all resize-none font-light"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              handleSave();
            }
          }}
        />

        {/* Save button */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-white/30 text-xs">Ctrl+Enter để lưu · ESC để thoát</span>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-xl font-medium transition-all backdrop-blur-sm border border-white/10"
          >
            <SendIcon className="w-4 h-4" />
            Lưu ghi chú
          </button>
        </div>
      </div>
    </div>
  );
};

export default FocusZenMode;
