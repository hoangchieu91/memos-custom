import { BrainCircuitIcon, LoaderIcon, SendIcon, XIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface QdrantHit {
  score: number;
  payload: { name: string; content: string; snippet?: string; tags?: string[] };
}

// Candidate Ollama servers (tried in order)
const OLLAMA_CANDIDATES = [
  "http://10.25.7.111:11434",  // Local Windows machine — RTX 3050 GPU
  "http://localhost:11434",
];
const QDRANT_CANDIDATES = [
  "http://localhost:6333",
  "http://10.25.7.111:6333",
];

const EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL = "qwen2.5:7b";
const COLLECTION = "memos";

async function pingOllama(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

async function pingQdrant(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

async function detectServers(): Promise<{ ollama: string | null; qdrant: string | null }> {
  let ollama: string | null = null;
  for (const url of OLLAMA_CANDIDATES) {
    if (await pingOllama(url)) { ollama = url; break; }
  }
  let qdrant: string | null = null;
  for (const url of QDRANT_CANDIDATES) {
    if (await pingQdrant(url)) { qdrant = url; break; }
  }
  return { ollama, qdrant };
}

async function embedText(ollamaUrl: string, text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    const data = await res.json();
    return data.embeddings?.[0] || null;
  } catch { return null; }
}

async function searchQdrant(qdrantUrl: string, vector: number[], topK = 5): Promise<QdrantHit[]> {
  try {
    const res = await fetch(`${qdrantUrl}/collections/${COLLECTION}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector, limit: topK, with_payload: true }),
    });
    const data = await res.json();
    return data.result || [];
  } catch { return []; }
}

export const AiChatPanel = ({
  externalOpen,
  onExternalClose,
}: {
  externalOpen?: boolean;
  onExternalClose?: () => void;
} = {}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isExternallyControlled = externalOpen !== undefined;
  const isOpen = isExternallyControlled ? externalOpen : internalOpen;
  const setIsOpen = isExternallyControlled
    ? (v: boolean) => { if (!v && onExternalClose) onExternalClose(); }
    : setInternalOpen;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState<string | null>(null);
  const [qdrantUrl, setQdrantUrl] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 50);
  }, []);

  // Auto-detect when panel opens
  useEffect(() => {
    if (!isOpen) return;
    if (ollamaUrl) return; // already detected
    setDetecting(true);
    detectServers().then(({ ollama, qdrant }) => {
      setOllamaUrl(ollama || "gemini"); // Fallback to 'gemini' if no local Ollama
      setQdrantUrl(qdrant);
      setDetecting(false);
      if (ollama) {
        const src = ollama.includes("localhost") ? "localhost" : ollama;
        setMessages([{
          role: "assistant",
          content: `✅ Đã kết nối Ollama tại **${src}**${qdrant ? " + Qdrant RAG" : " (không có Qdrant — trả lời không có ngữ cảnh ghi chú)"}.\n\nHỏi bất cứ điều gì về ghi chú của bạn!`,
        }]);
      } else {
        setMessages([{
          role: "assistant",
          content: `✨ Đã tự động kết nối dự phòng tới **Google Gemini 2.0 Flash API** (Ollama offline hoặc chưa mở).\n\nHỏi bất cứ điều gì!`,
        }]);
      }
    });
  }, [isOpen, ollamaUrl]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || !ollamaUrl) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);
    scrollToBottom();

    const GEMINI_API_KEY = "AIzaSyBn6rfEosMgL24j88rJ2aEAsOdzvSqlqUo";

    try {
      // Step 1: Embed + RAG search (optional, requires Qdrant and local Ollama)
      let contextParts = "";
      if (qdrantUrl && ollamaUrl !== "gemini") {
        const vector = await embedText(ollamaUrl, userMsg);
        if (vector) {
          const hits = await searchQdrant(qdrantUrl, vector, 5);
          contextParts = hits
            .filter((h) => h.score > 0.3)
            .map((h, i) => `[Ghi chú ${i + 1} - Score: ${h.score.toFixed(2)}]\n${h.payload.content?.substring(0, 400)}`)
            .join("\n\n---\n\n");
        }
      }

      // Step 2: Fallback to Gemini if ollamaUrl is "gemini"
      if (ollamaUrl === "gemini") {
        const systemPrompt = "Bạn là trợ lý AI cá nhân. Trả lời bằng tiếng Việt, ngắn gọn, tự nhiên.";
        const geminiMessages = [
          {
            role: "user",
            parts: [{ text: systemPrompt }]
          },
          ...messages.filter((m) => m.role !== "system").slice(-6).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          })),
          {
            role: "user",
            parts: [{ text: userMsg }]
          }
        ];

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: geminiMessages }),
        });

        if (!res.ok) {
          setMessages((prev) => [...prev, { role: "assistant", content: `❌ Lỗi kết nối Gemini API (${res.status})` }]);
          return;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Không có câu trả lời từ Gemini.";
        setMessages((prev) => [...prev, { role: "assistant", content: text }]);
        return;
      }

      // Step 3: Build system prompt for Ollama
      const systemPrompt = contextParts
        ? `Bạn là trợ lý AI cá nhân. Ghi chú liên quan:\n\n${contextParts}\n\nDựa vào ghi chú trên để trả lời. Nếu không có thông tin liên quan hãy nói rõ. Trả lời tiếng Việt, ngắn gọn.`
        : "Bạn là trợ lý AI cá nhân. Không có ghi chú liên quan. Trả lời dựa trên kiến thức chung bằng tiếng Việt.";

      // Step 4: Chat with Ollama
      const ollamaMessages = [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system").slice(-6),
        { role: "user", content: userMsg },
      ];

      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: CHAT_MODEL, messages: ollamaMessages, stream: true }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ Lỗi Ollama (${res.status}). Model \`${CHAT_MODEL}\` đã được pull chưa?\n\`ollama pull ${CHAT_MODEL}\`` }]);
        return;
      }

      // Step 5: Stream from Ollama
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              assistantText += json.message.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
              scrollToBottom();
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ Lỗi: ${e}` }]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }, [input, isLoading, messages, ollamaUrl, qdrantUrl, scrollToBottom]);

  const statusDot = ollamaUrl && ollamaUrl !== "gemini"
    ? <WifiIcon className="w-3 h-3 text-green-400" />
    : <WifiIcon className="w-3 h-3 text-purple-400 animate-pulse" />;

  if (!isOpen) {
    // When externally controlled, don't render standalone FAB
    if (isExternallyControlled) return null;
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-50 w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md opacity-30 hover:opacity-100 hover:w-14 hover:h-14 hover:shadow-xl transition-all duration-200 flex items-center justify-center"
        title="Hỏi AI (Bộ nhớ dài hạn)"
      >
        <BrainCircuitIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuitIcon className="w-5 h-5" />
          <span className="font-bold text-sm">AI Memory Assistant</span>
          {!detecting && <span className="ml-1">{statusDot}</span>}
          {detecting && <LoaderIcon className="w-3 h-3 animate-spin ml-1" />}
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.length === 0 && !detecting && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center px-4">
            <BrainCircuitIcon className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Đang kiểm tra kết nối...</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}
            >
              {msg.content || (isLoading ? "▌" : "")}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={ollamaUrl ? "Hỏi về ghi chú của bạn..." : "Chờ kết nối Ollama..."}
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={isLoading || !ollamaUrl}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={isLoading || !input.trim() || !ollamaUrl}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3"
        >
          {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default AiChatPanel;
