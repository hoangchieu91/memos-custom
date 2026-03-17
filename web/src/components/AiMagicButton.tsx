import { useState, useCallback } from "react";
import { SparklesIcon, XIcon, LoaderIcon, FileTextIcon, CheckCircleIcon, LanguagesIcon, CopyIcon } from "lucide-react";

const OLLAMA_URL = "http://10.25.7.111:11434";
const CHAT_MODEL = "qwen2.5:7b";

interface AiMagicButtonProps {
  content: string;
  memoName: string;
}

type ActionType = "summarize" | "fix" | "translate";

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
];

export const AiMagicButton = ({ content, memoName }: AiMagicButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAction = useCallback(
    async (action: (typeof ACTIONS)[0]) => {
      setActiveAction(action.type);
      setIsLoading(true);
      setResult(null);

      try {
        const res = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CHAT_MODEL,
            messages: [{ role: "user", content: action.prompt + content }],
            stream: true,
          }),
        });

        if (!res.ok || !res.body) {
          setResult("🏖️ Nhân viên AI đang nghỉ phép! (Máy local chưa bật Ollama)");
          setIsLoading(false);
          return;
        }

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
        setResult("🏖️ Nhân viên AI đang nghỉ phép! (Không thể kết nối Ollama)");
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
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-gray-200 dark:border-gray-700"
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
        <div className="relative bg-white dark:bg-gray-900 rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap border border-gray-100 dark:border-gray-800">
          {result}
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
            title="Copy"
          >
            {copied ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default AiMagicButton;
