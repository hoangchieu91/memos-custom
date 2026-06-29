import { useState, useCallback } from "react";
import {
  SparklesIcon,
  XIcon,
  LoaderIcon,
  FileTextIcon,
  CheckCircleIcon,
  LanguagesIcon,
  CopyIcon,
  TagIcon,
  ArrowUpRightIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useUpdateMemo } from "@/hooks/useMemoQueries";

const OLLAMA_URL = "http://10.25.7.111:11434";
const CHAT_MODEL = "qwen2.5:7b";

interface AiMagicButtonProps {
  content: string;
  memoName: string;
}

type ActionType = "summarize" | "fix" | "translate" | "autotag";

const ACTIONS: { type: ActionType; label: string; icon: React.ReactNode; prompt: string }[] = [
  {
    type: "summarize",
    label: "Tóm tắt",
    icon: <FileTextIcon className="w-4 h-4" />,
    prompt: "Tóm tắt nội dung sau bằng tiếng Việt, ngắn gọn trong 2-3 câu:\n\n",
  },
  {
    type: "fix",
    label: "Sửa lỗi",
    icon: <CheckCircleIcon className="w-4 h-4" />,
    prompt: "Sửa lỗi chính tả, ngữ pháp trong nội dung sau. Giữ nguyên ý nghĩa, chỉ sửa lỗi. Trả về nội dung đã sửa:\n\n",
  },
  {
    type: "translate",
    label: "Dịch EN↔VI",
    icon: <LanguagesIcon className="w-4 h-4" />,
    prompt: "Dịch nội dung sau. Nếu là tiếng Việt thì dịch sang tiếng Anh, nếu là tiếng Anh thì dịch sang tiếng Việt. Chỉ trả về bản dịch:\n\n",
  },
  {
    type: "autotag",
    label: "Gắn tag",
    icon: <TagIcon className="w-4 h-4" />,
    prompt:
      `Phân tích nội dung sau và gợi ý các hashtag phù hợp (dùng format #tag). Chỉ trả về danh sách tag, mỗi tag trên 1 dòng. Các tag nên ngắn gọn, tiếng Việt không dấu hoặc tiếng Anh. Ví dụ: #expense, #checkin, #task, #idea, #meeting, #finance, #personal, #tech, #review, #ai/idea. Nội dung:\n\n`,
  },
];

export const AiMagicButton = ({ content, memoName }: AiMagicButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [copied, setCopied] = useState(false);
  const { mutateAsync: updateMemo } = useUpdateMemo();

  const handleAction = useCallback(
    async (action: (typeof ACTIONS)[0]) => {
      setActiveAction(action.type);
      setIsLoading(true);
      setResult(null);

      const GEMINI_API_KEY = "AIzaSyBn6rfEosMgL24j88rJ2aEAsOdzvSqlqUo";
      let res: Response | null = null;
      let isOllama = false;

      try {
        res = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CHAT_MODEL,
            messages: [{ role: "user", content: action.prompt + content }],
            stream: true,
          }),
          signal: AbortSignal.timeout(2000), // Quick timeout to fallback fast
        });

        if (res.ok && res.body) {
          isOllama = true;
        }
      } catch (e) {
        // Ollama connection failed or timed out, fallback to Gemini
      }

      if (!isOllama) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: action.prompt + content }] }]
            })
          });

          if (!geminiRes.ok) {
            setResult("🏖️ Nhân viên AI đang nghỉ phép! (Không kết nối được cả Ollama & Gemini)");
            setIsLoading(false);
            return;
          }

          const data = await geminiRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) {
            setResult(text);
          } else {
            setResult("🏖️ Nhân viên AI đang nghỉ phép! (Gemini trả về nội dung rỗng)");
          }
        } catch (geminiError) {
          setResult("🏖️ Nhân viên AI đang nghỉ phép! (Lỗi gọi Gemini)");
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // If Ollama is working, stream from it as usual
      try {
        if (!res || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n").filter((l) => l.trim())) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                fullText += json.message.content;
                setResult(fullText);
              }
            } catch {
              // skip
            }
          }
        }
      } catch {
        setResult("🏖️ Nhân viên AI đang nghỉ phép! (Lỗi luồng stream Ollama)");
      } finally {
        setIsLoading(false);
      }
    },
    [content],
  );

  const handleCopy = useCallback(() => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  // Apply AI result to memo (replace or append)
  const handleApply = useCallback(async () => {
    if (!result || !memoName) return;

    try {
      let newContent = content;

      if (activeAction === "autotag") {
        // For auto-tag: append tags to existing content
        const tags = result
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("#"))
          .join(" ");
        if (tags) {
          // Remove any existing duplicate tags
          const existingTags = new Set(content.match(/#\w[\w/]*/g) || []);
          const newTags = tags
            .split(" ")
            .filter((t) => !existingTags.has(t))
            .join(" ");
          if (newTags) {
            newContent = content.trimEnd() + "\n" + newTags;
          } else {
            toast.success("Tất cả tag đã có sẵn!");
            return;
          }
        }
      } else if (activeAction === "fix" || activeAction === "translate") {
        // For fix/translate: replace entire content
        newContent = result;
      } else {
        // For summarize: append summary below
        newContent = content.trimEnd() + "\n\n---\n📝 **Tóm tắt:** " + result;
      }

      await updateMemo({
        update: { name: memoName, content: newContent },
        updateMask: ["content"],
      });
      toast.success("✅ Đã cập nhật memo!");
      handleClose();
    } catch {
      toast.error("Lỗi cập nhật memo");
    }
  }, [result, content, memoName, activeAction, updateMemo]);

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
    setActiveAction(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-500 hover:text-violet-600"
        title="AI Magic ✨"
      >
        <SparklesIcon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="mt-2 border border-violet-200 dark:border-violet-800 rounded-xl bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2">
      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ACTIONS.map((action) => (
          <button
            key={action.type}
            onClick={() => handleAction(action)}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeAction === action.type
                ? "bg-violet-600 text-white"
                : "bg-white dark:bg-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-gray-200 dark:border-gray-600"
            }`}
          >
            {isLoading && activeAction === action.type ? <LoaderIcon className="w-3 h-3 animate-spin" /> : action.icon}
            {action.label}
          </button>
        ))}

        <button onClick={handleClose} className="ml-auto p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="relative rounded-lg p-3 text-sm whitespace-pre-wrap bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-100 border border-violet-200 dark:border-violet-700 shadow-sm">
          {result}

          {/* Action buttons row */}
          <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            {/* Apply button */}
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm"
              title="Áp dụng kết quả vào memo"
            >
              <ArrowUpRightIcon className="w-3.5 h-3.5" />
              Áp dụng
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-600 dark:text-gray-300 transition-colors"
              title="Sao chép"
            >
              {copied ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
              {copied ? "Đã chép" : "Sao chép"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiMagicButton;
