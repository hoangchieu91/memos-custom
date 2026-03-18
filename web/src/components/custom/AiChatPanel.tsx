import { BrainCircuitIcon, LoaderIcon, SendIcon, XIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface QdrantHit {
  score: number;
  payload: {
    name: string;
    content: string;
    snippet?: string;
    tags?: string[];
  };
}

const OLLAMA_URL = "http://10.25.7.111:11434";
const QDRANT_URL = "http://10.25.7.111:6333";
const EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL = "qwen2.5:1.5b";  // updated: server has 1.5b not 7b
const COLLECTION = "memos";

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    const data = await res.json();
    return data.embeddings?.[0] || null;
  } catch {
    return null;
  }
}

async function searchQdrant(vector: number[], topK = 5): Promise<QdrantHit[]> {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector, limit: topK, with_payload: true }),
    });
    const data = await res.json();
    return data.result || [];
  } catch {
    return [];
  }
}

export const AiChatPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);
    scrollToBottom();

    try {
      // Step 1: Embed query
      const vector = await embedText(userMsg);
      if (!vector) {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ Không kết nối được Ollama tại ${OLLAMA_URL}\n\nKiểm tra:\n• Server 10.25.7.111 có đang chạy không?\n• Model \`${EMBED_MODEL}\` đã được pull chưa?` }]);
        setIsLoading(false);
        return;
      }

      // Step 2: Search Qdrant RAG
      const hits = await searchQdrant(vector, 5);
      const contextParts = hits
        .filter((h) => h.score > 0.3)
        .map((h, i) => `[Ghi chú ${i + 1} - Score: ${h.score.toFixed(2)}]\n${h.payload.content?.substring(0, 500)}`)
        .join("\n\n---\n\n");

      // Step 3: Build system prompt with context
      const systemPrompt = contextParts
        ? `Bạn là trợ lý AI cá nhân. Dưới đây là các ghi chú liên quan từ bộ nhớ dài hạn của người dùng:\n\n${contextParts}\n\nDựa vào các ghi chú trên để trả lời câu hỏi. Nếu không tìm thấy thông tin liên quan, hãy nói rõ. Trả lời bằng tiếng Việt, ngắn gọn và hữu ích.`
        : "Bạn là trợ lý AI cá nhân. Không tìm thấy ghi chú liên quan trong bộ nhớ. Hãy trả lời dựa trên kiến thức chung. Trả lời bằng tiếng Việt.";

      // Step 4: Stream response from Ollama
      const ollamaMessages = [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system").slice(-6), // Keep last 6 messages for context
        { role: "user", content: userMsg },
      ];

      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: ollamaMessages,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "assistant", content: "❌ Lỗi kết nối Ollama Chat." }]);
        setIsLoading(false);
        return;
      }

      // Stream reading
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.trim());

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
          } catch {
            // Skip non-JSON lines
          }
        }
      }

      // Append source info
      if (hits.length > 0 && hits[0].score > 0.3) {
        const sourceInfo = `\n\n---\n📚 Nguồn: ${hits.filter((h) => h.score > 0.3).length} ghi chú liên quan (Score cao nhất: ${hits[0].score.toFixed(2)})`;
        assistantText += sourceInfo;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantText };
          return updated;
        });
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ Lỗi: ${e}` }]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }, [input, isLoading, messages, scrollToBottom]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center"
        title="Hỏi AI (Bộ nhớ dài hạn)"
      >
        <BrainCircuitIcon className="w-7 h-7" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <BrainCircuitIcon className="w-5 h-5" />
          <span className="font-bold text-sm">AI Memory Assistant</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center px-4">
            <BrainCircuitIcon className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Hỏi bất cứ điều gì</p>
            <p className="text-xs mt-1 opacity-70">AI sẽ tìm kiếm trong toàn bộ ghi chú của bạn (Qdrant RAG) và trả lời bằng Ollama local.</p>
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
              {msg.content || (isLoading ? "..." : "")}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Hỏi về ghi chú của bạn..."
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={isLoading}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3"
        >
          {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default AiChatPanel;
