import { useState, useEffect, useMemo } from "react";
import { XIcon, ShoppingCartIcon, SendIcon, LoaderIcon } from "lucide-react";
import toast from "react-hot-toast";

const NOCODB_DIRECT = "http://10.25.7.212:8080";
const NOCODB_TOKEN = "_TMGGkbPEWQa_hO82Kn3BjJi3DWbPiQDTnBumzPg";
const NOCODB_TABLE = "mef80lq7kymhvtc";
const NOCODB_BASE_ID = "pakf4lho7c3mxzs";

function nocoUrl(path: string) {
  return `${NOCODB_DIRECT}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${NOCODB_TABLE}${path}`;
}

interface PurchaseTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  createMemo: (content: string) => Promise<void>;
}

export default function PurchaseTemplateModal({ isOpen, onClose, createMemo }: PurchaseTemplateModalProps) {
  const [fName, setFName] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fQty, setFQty] = useState("1");
  const [fTotal, setFTotal] = useState("");
  const [fLentTo, setFLentTo] = useState("");
  const [fNotes, setFNotes] = useState("");

  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch unique device names on open
  useEffect(() => {
    if (!isOpen) return;
    const fetchNames = async () => {
      try {
        const res = await fetch(nocoUrl("?limit=1000&fields=Name"), {
          headers: { "xc-token": NOCODB_TOKEN, "Content-Type": "application/json" }
        });
        if (res.ok) {
          const data = await res.json();
          const names = new Set(data.list.map((a: any) => a.Name).filter(Boolean));
          setDeviceNames(Array.from(names) as string[]);
        }
      } catch (err) {
        console.error("Failed to fetch device names for autocomplete", err);
      }
    };
    fetchNames();
  }, [isOpen]);

  const suggestions = useMemo(() => {
    if (!fName || fName.length < 1) return [];
    const q = fName.toLowerCase();
    return deviceNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [fName, deviceNames]);

  const handleSubmit = async () => {
    if (!fName.trim()) { toast.error("Cần nhập tên tài sản"); return; }
    if (!fPrice && !fTotal) { toast.error("Cần nhập đơn giá hoặc tổng tiền"); return; }

    setIsSubmitting(true);
    try {
      const q = Number(fQty) || 1;
      const t = Number(fTotal.replace(/\D/g, "")) || (Number(fPrice.replace(/\D/g, "")) * q) || 0;
      const p = Number(fPrice.replace(/\D/g, "")) || 0;
      
      let content = `Đã mua ${q} ${fName.trim()}`;
      if (fLentTo) content = `Mua hộ ${fLentTo.trim()} ${q} ${fName.trim()}`;
      
      if (p > 0) content += `, đơn giá ${p}k`;
      if (t > 0) content += `, tổng ${t}k.`;
      else content += ".";

      if (fNotes) content += `\n${fNotes.trim()}`;
      content += `\n#asset/buy`;

      await createMemo(content);
      toast.success("✅ Đã ghi nhận mua sắm!");
      
      // Reset
      setFName(""); setFPrice(""); setFQty("1"); setFTotal(""); setFLentTo(""); setFNotes("");
      onClose();
    } catch (err) {
      toast.error("Lỗi khi tạo ghi chú");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-14 right-0 w-80 bg-card border border-border rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200" style={{ zIndex: 9999 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <ShoppingCartIcon className="w-4 h-4" />
          Khai báo mua sắm
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
            placeholder="Tên thiết bị..."
            value={fName}
            onChange={(e) => { setFName(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[9999] top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl overflow-hidden text-sm">
              {suggestions.map((s, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 cursor-pointer hover:bg-accent transition-colors truncate"
                  onMouseDown={(e) => { e.preventDefault(); setFName(s); setShowSuggestions(false); }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            placeholder="Số lượng (vd: 1)"
            value={fQty}
            onChange={e => setFQty(e.target.value)}
          />
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            placeholder="Mua hộ ai? (ko có thì bỏ trống)"
            value={fLentTo}
            onChange={e => setFLentTo(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            placeholder="Đơn giá (k)"
            value={fPrice}
            onChange={e => setFPrice(e.target.value)}
          />
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            placeholder="Tổng (k)"
            value={fTotal}
            onChange={e => setFTotal(e.target.value)}
          />
        </div>

        <textarea
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none h-16 focus:ring-2 focus:ring-emerald-500"
          placeholder="Ghi chú, link mua (bỏ trống ok)"
          value={fNotes}
          onChange={e => setFNotes(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-md disabled:opacity-50"
        >
          {isSubmitting ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
          <span>Ghi nhận</span>
        </button>
      </div>
    </div>
  );
}
