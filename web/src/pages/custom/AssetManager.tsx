import {
  BoxIcon,
  CheckIcon,
  DollarSignIcon,
  ExternalLinkIcon,
  HandshakeIcon,
  KeyIcon,
  LayoutGridIcon,
  ListIcon,
  LoaderIcon,
  PackageIcon,
  PencilIcon,
  PieChartIcon,
  SearchIcon,
  ShoppingCartIcon,
  Trash2Icon,
  XIcon,
  MapPinIcon,
  HashIcon,
  WifiIcon,
  ImageIcon,
  BookIcon,
  BookOpenIcon,
  FileTextIcon,
  SplitSquareHorizontalIcon,
  CombineIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

// ============================================================================
// NocoDB Config
// ============================================================================

const NOCODB_DIRECT = `http://${window.location.hostname}:8088`;
const NOCODB_TOKEN = "_TMGGkbPEWQa_hO82Kn3BjJi3DWbPiQDTnBumzPg";
const NOCODB_TABLE = "mef80lq7kymhvtc";
const NOCODB_BASE_ID = "pakf4lho7c3mxzs";

function nocoUrl(path: string) {
  return `${NOCODB_DIRECT}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${NOCODB_TABLE}${path}`;
}
const headers = { "xc-token": NOCODB_TOKEN, "Content-Type": "application/json" };

// ============================================================================
// Types
// ============================================================================

interface Asset {
  Id: number;
  Name: string;
  Serial: string;
  MAC: string;
  Category: string;
  Status: string;       // active | lent | sold | broken | returned
  Price: number;
  PurchaseDate: string;
  Owner: string;
  LentTo: string;
  Location: string;
  Notes: string;
  MemoRef: string;
  CreatedAt?: string;
  Images: string;
  Catalogs: string;
  Manuals: string;
  Specs: string;
  Unit: string;
  Quantity: number;
}

type QuickAction = "buy" | "lend" | "return" | "license" | null;
type FilterTab = "all" | "active" | "stored" | "lent" | "sold" | "broken";

// ============================================================================
// Helpers
// ============================================================================

function formatVND(amount: number): string {
  if (!amount) return "—";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} tr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return `${amount.toLocaleString("vi-VN")}đ`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: "Đang dùng",   color: "text-emerald-500", bg: "bg-emerald-500/10" },
  stored:    { label: "Lưu kho",     color: "text-blue-500",    bg: "bg-blue-500/10" },
  lent:      { label: "Cho mượn",    color: "text-amber-500",   bg: "bg-amber-500/10" },
  warranty:  { label: "Bảo hành",    color: "text-violet-500",  bg: "bg-violet-500/10" },
  sold:      { label: "Đã bán",      color: "text-slate-500",   bg: "bg-slate-500/10" },
  gifted:    { label: "Đã tặng",     color: "text-pink-500",    bg: "bg-pink-500/10" },
  broken:    { label: "Hỏng",        color: "text-red-500",     bg: "bg-red-500/10" },
  lost:      { label: "Thất lạc",    color: "text-orange-500",  bg: "bg-orange-500/10" },
  returned:  { label: "Đã thu hồi",  color: "text-sky-500",     bg: "bg-sky-500/10" },
};

const CATEGORY_COLORS: Record<string, string> = {
  "Điện tử": "bg-blue-500",
  "Nội thất": "bg-amber-500",
  "Phần mềm": "bg-violet-500",
  "Xe cộ": "bg-red-500",
  "Dụng cụ": "bg-cyan-500",
  "Văn phòng": "bg-green-500",
  "Khác": "bg-gray-400",
};

const CATEGORIES = ["Điện tử", "Nội thất", "Phần mềm", "Dụng cụ", "Xe cộ", "Văn phòng", "Khác"];

// ============================================================================
// NocoDB API
// ============================================================================

async function fetchAssets(search?: string): Promise<Asset[]> {
  let url = nocoUrl("?limit=500&sort=-CreatedAt");
  if (search) {
    url += `&where=(Name,like,%25${encodeURIComponent(search)}%25)~or(Serial,like,%25${encodeURIComponent(search)}%25)~or(MAC,like,%25${encodeURIComponent(search)}%25)`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
  const data = await res.json();
  return data.list || [];
}

async function createAsset(asset: Partial<Asset>): Promise<Asset> {
  const res = await fetch(nocoUrl(""), { method: "POST", headers, body: JSON.stringify(asset) });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
  return res.json();
}

async function updateAsset(id: number, asset: Partial<Asset>): Promise<Asset> {
  const res = await fetch(nocoUrl(`/${id}`), { method: "PATCH", headers, body: JSON.stringify(asset) });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
  return res.json();
}

async function deleteAsset(id: number): Promise<void> {
  const res = await fetch(nocoUrl(""), { method: "DELETE", headers, body: JSON.stringify([{ Id: id }]) });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
}

// ============================================================================
// Component
// ============================================================================

const AssetManager = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    return (localStorage.getItem("asset_view_mode") as "card" | "table") || "card";
  });

  // Quick action modal
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form fields
  const [fName, setFName] = useState("");
  const [fSerial, setFSerial] = useState("");
  const [fMAC, setFMAC] = useState("");
  const [fCategory, setFCategory] = useState("Điện tử");
  const [fStatus, setFStatus] = useState("active");
  const [fPrice, setFPrice] = useState("");
  const [fOwner, setFOwner] = useState("nxchieu");
  const [fLentTo, setFLentTo] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fImages, setFImages] = useState("");
  const [fCatalogs, setFCatalogs] = useState("");
  const [fManuals, setFManuals] = useState("");
  const [fSpecs, setFSpecs] = useState("");
  const [fUnit, setFUnit] = useState("Cái");
  const [fQuantity, setFQuantity] = useState("1");

  // Autocomplete
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Split Logic
  const [splitAsset, setSplitAsset] = useState<Asset | null>(null);
  const [splitQty, setSplitQty] = useState("1");
  const [splitStatus, setSplitStatus] = useState("active");
  const [splitLentTo, setSplitLentTo] = useState("");

  // Merge Logic
  const [mergeAsset, setMergeAsset] = useState<Asset | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | "">("");

  // Load
  const loadAssets = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      const list = await fetchAssets(q);
      setAssets(list);
    } catch (err: unknown) {
      toast.error(`Không tải được: ${err instanceof Error ? err.message : "Lỗi"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  useEffect(() => {
    const t = setTimeout(() => loadAssets(search || undefined), 300);
    return () => clearTimeout(t);
  }, [search, loadAssets]);

  // Smart Paste Handler
  useEffect(() => {
    if (!quickAction) return;

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text");
      if (!text) return;

      // Check if it's a filepath or URL
      const isPath = /^[a-zA-Z]:\\/i.test(text) || text.startsWith("/") || text.startsWith("http://") || text.startsWith("https://") || text.startsWith("file://") || text.includes("\\") || text.includes("/");
      if (!isPath) return;

      const lowerText = text.toLowerCase();
      let matched = false;

      if (/\.(png|jpe?g|gif|webp|bmp|tiff)$/i.test(lowerText) || lowerText.includes("image") || lowerText.includes("/images/")) {
        setFImages(text);
        toast.success("Đã tự động gán đường dẫn vào Ảnh 🖼️");
        matched = true;
      } else if (lowerText.includes("manual") || lowerText.includes("guide") || lowerText.includes("hdsd") || lowerText.includes("/manuals/")) {
        setFManuals(text);
        toast.success("Đã tự động gán đường dẫn vào Manual 📖");
        matched = true;
      } else if (lowerText.includes("catalog") || lowerText.includes("brochure") || lowerText.includes("/catalogs/")) {
        setFCatalogs(text);
        toast.success("Đã tự động gán đường dẫn vào Catalog 📚");
        matched = true;
      } else if (lowerText.includes("spec") || lowerText.includes("datasheet") || lowerText.includes("drawing") || lowerText.includes("banve") || lowerText.includes("/specs/")) {
        setFSpecs(text);
        toast.success("Đã tự động gán đường dẫn vào Specs ⚙️");
        matched = true;
      } else if (lowerText.endsWith(".pdf") || lowerText.endsWith(".doc") || lowerText.endsWith(".docx")) {
        setFManuals(text);
        toast.success("Đã gán tài liệu vào mục Hướng dẫn (Manual) 📄");
        matched = true;
      }

      if (matched) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [quickAction]);

  // Unique device names for autocomplete
  const deviceNames = useMemo(() => {
    const names = new Set(assets.map(a => a.Name).filter(Boolean));
    return Array.from(names);
  }, [assets]);

  const suggestions = useMemo(() => {
    if (!fName || fName.length < 1) return [];
    const q = fName.toLowerCase();
    return deviceNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [fName, deviceNames]);

  // Auto-fill category based on name
  const autoCategory = useCallback((name: string) => {
    const n = name.toLowerCase();
    if (/esp32|arduino|raspberry|heltec|board|sensor|mcu|relay|oled/.test(n)) return "Điện tử";
    if (/macbook|laptop|pc|monitor|keyboard|mouse|usb|ssd|ram/.test(n)) return "Điện tử";
    if (/bàn|ghế|tủ|kệ|giá|đèn/.test(n)) return "Nội thất";
    if (/license|key|subscription|jetbrains|office|adobe|figma/.test(n)) return "Phần mềm";
    if (/xe|ô tô|motor|car/.test(n)) return "Xe cộ";
    if (/multimeter|fluke|scope|kìm|tua vít|drill|khoan/.test(n)) return "Dụng cụ";
    return "Khác";
  }, []);

  // Stats
  const stats = useMemo(() => {
    const active = assets.filter(a => a.Status === "active").length;
    const stored = assets.filter(a => a.Status === "stored").length;
    const lent = assets.filter(a => a.Status === "lent").length;
    const sold = assets.filter(a => a.Status === "sold").length;
    const broken = assets.filter(a => a.Status === "broken").length;
    const totalValue = assets.filter(a => ["active", "stored", "lent"].includes(a.Status)).reduce((s, a) => s + (a.Price || 0), 0);

    const byCategory: Record<string, { count: number; value: number }> = {};
    for (const a of assets) {
      if (a.Status === "sold" || a.Status === "broken" || a.Status === "gifted") continue;
      const cat = a.Category || "Khác";
      byCategory[cat] = byCategory[cat] || { count: 0, value: 0 };
      byCategory[cat].count++;
      byCategory[cat].value += a.Price || 0;
    }

    return { total: assets.length, active, stored, lent, sold, broken, totalValue, byCategory: Object.entries(byCategory).sort((a, b) => b[1].value - a[1].value) };
  }, [assets]);

  const filtered = useMemo(() => {
    if (tab === "all") return assets;
    return assets.filter(a => a.Status === tab);
  }, [assets, tab]);

  // Reset form
  const resetForm = () => {
    setQuickAction(null);
    setEditingId(null);
    setFName(""); setFSerial(""); setFMAC(""); setFCategory("Điện tử");
    setFStatus("active"); setFPrice(""); setFOwner("nxchieu");
    setFLentTo(""); setFLocation(""); setFNotes("");
    setShowSuggestions(false);
  };

  // Open quick action with template
  const openQuickAction = (action: QuickAction) => {
    resetForm();
    setQuickAction(action);
    if (action === "buy") { setFStatus("active"); }
    if (action === "lend") { setFStatus("lent"); }
    if (action === "return") { setFStatus("active"); }
    if (action === "license") { setFCategory("Phần mềm"); setFStatus("active"); }
  };

  const startEdit = (a: Asset) => {
    setEditingId(a.Id);
    setQuickAction("buy"); // reuse form
    setFName(a.Name || ""); setFSerial(a.Serial || ""); setFMAC(a.MAC || "");
    setFCategory(a.Category || "Khác"); setFStatus(a.Status || "active");
    setFPrice(a.Price ? String(a.Price) : ""); setFOwner(a.Owner || "nxchieu");
    setFLentTo(a.LentTo || ""); setFLocation(a.Location || ""); setFNotes(a.Notes || "");
    setFImages(a.Images || ""); setFCatalogs(a.Catalogs || ""); setFManuals(a.Manuals || "");
    setFSpecs(a.Specs || ""); setFUnit(a.Unit || "Cái"); setFQuantity(String(a.Quantity || 1));
  };

  const quickLend = (a: Asset) => {
    setEditingId(a.Id);
    setQuickAction("lend");
    setFName(a.Name); setFSerial(a.Serial || ""); setFMAC(a.MAC || "");
    setFCategory(a.Category || "Khác"); setFStatus("lent");
    setFPrice(a.Price ? String(a.Price) : ""); setFOwner(a.Owner || "nxchieu");
    setFLentTo(""); setFLocation(a.Location || ""); setFNotes(a.Notes || "");
    setFImages(a.Images || ""); setFCatalogs(a.Catalogs || ""); setFManuals(a.Manuals || "");
    setFSpecs(a.Specs || ""); setFUnit(a.Unit || "Cái"); setFQuantity(String(a.Quantity || 1));
  };

  // Quick return — pick a lent asset to return
  const quickReturn = async (a: Asset) => {
    try {
      await updateAsset(a.Id, { Status: "active", LentTo: "" });
      toast.success(`Thu hồi "${a.Name}" thành công!`);
      loadAssets(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : "?"}`);
    }
  };

  // Submit form
  const handleSubmit = async () => {
    if (!fName.trim()) { toast.error("Tên thiết bị không được để trống"); return; }
    try {
      const payload: Partial<Asset> = {
        Name: fName.trim(), Serial: fSerial.trim(), MAC: fMAC.trim(),
        Category: fCategory, Status: fStatus,
        Price: parseInt(fPrice.replace(/\D/g, "")) || 0,
        Owner: fOwner.trim(), LentTo: fLentTo.trim(),
        Location: fLocation.trim(), Notes: fNotes.trim(),
        Images: fImages, Catalogs: fCatalogs, Manuals: fManuals, Specs: fSpecs,
        Unit: fUnit, Quantity: Number(fQuantity) || 1,
      };
      if (editingId) {
        await updateAsset(editingId, payload);
        toast.success("Đã cập nhật thiết bị");
      } else {
        await createAsset(payload);
        toast.success("Đã thêm thiết bị mới!");
      }
      resetForm();
      loadAssets(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : "?"}`);
    }
  };

  const handleDelete = async (a: Asset) => {
    if (!confirm(`Xóa "${a.Name}" (${a.Serial || "no serial"})?`)) return;
    try {
      await deleteAsset(a.Id);
      toast.success("Đã xóa");
      loadAssets(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi xóa: ${err instanceof Error ? err.message : "?"}`);
    }
  };

  const submitSplit = async () => {
    if (!splitAsset) return;
    const sq = Number(splitQty);
    if (isNaN(sq) || sq < 1 || sq >= splitAsset.Quantity) {
      toast.error("Số lượng không hợp lệ");
      return;
    }

    try {
      // Giảm Qty cũ
      const newOldQty = splitAsset.Quantity - sq;
      await updateAsset(splitAsset.Id, { Quantity: newOldQty });

      // Tạo mới
      const newAsset: Partial<Asset> = {
        Name: splitAsset.Name, Serial: splitAsset.Serial, MAC: splitAsset.MAC,
        Category: splitAsset.Category, Status: splitStatus,
        Price: splitAsset.Price, Owner: splitAsset.Owner, LentTo: splitLentTo,
        Location: splitAsset.Location, Notes: splitAsset.Notes,
        Images: splitAsset.Images, Catalogs: splitAsset.Catalogs, Manuals: splitAsset.Manuals,
        Specs: splitAsset.Specs, Unit: splitAsset.Unit, Quantity: sq, MemoRef: splitAsset.MemoRef
      };
      await createAsset(newAsset);
      
      toast.success(`Đã tách ${sq} và chuyển trạng thái "${STATUS_CONFIG[splitStatus]?.label}"`);
      setSplitAsset(null);
      loadAssets(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi tách: ${err instanceof Error ? err.message : "?"}`);
    }
  };

  const submitMerge = async () => {
    if (!mergeAsset || !mergeTargetId) return;
    const targetAsset = assets.find(a => a.Id === Number(mergeTargetId));
    if (!targetAsset) return;

    try {
      // 1. Delete source asset
      await deleteAsset(mergeAsset.Id);

      // 2. Update target asset
      const newQty = targetAsset.Quantity + (mergeAsset.Quantity || 1);
      
      const serials = [targetAsset.Serial, mergeAsset.Serial].filter(s => s && s.trim());
      const newSerial = Array.from(new Set(serials)).join(", "); // Remove duplicate exact matches

      const macs = [targetAsset.MAC, mergeAsset.MAC].filter(s => s && s.trim());
      const newMAC = Array.from(new Set(macs)).join(", "); 
      
      await updateAsset(targetAsset.Id, {
        Quantity: newQty,
        Serial: newSerial || "",
        MAC: newMAC || ""
      });

      toast.success(`Đã gộp thành công vào "${targetAsset.Name}"`);
      setMergeAsset(null);
      setMergeTargetId("");
      loadAssets(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi gộp: ${err instanceof Error ? err.message : "?"}`);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading && assets.length === 0) {
    return <div className="w-full h-[80vh] flex items-center justify-center"><LoaderIcon className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  }

  const actionTitle = quickAction === "buy" ? (editingId ? "Chỉnh sửa thiết bị" : "🛒 Mua đồ mới") :
                      quickAction === "lend" ? "🤝 Cho mượn thiết bị" :
                      quickAction === "return" ? "📥 Thu hồi thiết bị" :
                      quickAction === "license" ? "🔑 Thêm License/Tool" : "";

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-full mx-auto">
      
      {/* ========================= SPLIT ASSET MODAL ========================= */}
      {splitAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 overflow-hidden animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold mb-1">Tách lô tài sản</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tách một phần của <span className="font-semibold text-foreground">{splitAsset.Name}</span> sang trạng thái mới.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Vui lòng nhập số lượng tách (Tối đa {splitAsset.Quantity - 1})</label>
                <input type="number" min="1" max={splitAsset.Quantity - 1} value={splitQty} onChange={e => setSplitQty(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Trạng thái mới</label>
                <select value={splitStatus} onChange={e => setSplitStatus(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500">
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option value={k} key={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              {(splitStatus === "lent" || splitStatus === "gifted") && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">{splitStatus === "lent" ? "Cho ai mượn?" : "Tặng cho ai?"}</label>
                  <input value={splitLentTo} onChange={e => setSplitLentTo(e.target.value)} placeholder="Tên người nhận..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 border-t border-border pt-4">
              <button onClick={() => setSplitAsset(null)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted font-medium transition-colors">Hủy bỏ</button>
              <button onClick={submitSplit} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors shadow-md">Tách ngay ({splitQty})</button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= MERGE ASSET MODAL ========================= */}
      {mergeAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 overflow-hidden animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold mb-1">Gộp lô tài sản</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Gộp lô <span className="font-semibold text-foreground">{mergeAsset.Name} ({mergeAsset.Quantity > 1 ? mergeAsset.Quantity : 1})</span> vào một thiết bị khác.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Chọn thiết bị đích để gộp vào</label>
                <select value={mergeTargetId} onChange={e => setMergeTargetId(Number(e.target.value) || "")} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500">
                  <option value="" disabled>--- Chọn thiết bị ---</option>
                  {assets.filter(a => a.Id !== mergeAsset.Id && a.Name === mergeAsset.Name).map(a => (
                    <option value={a.Id} key={a.Id}>{a.Name} ({a.Quantity > 1 ? a.Quantity : 1} {a.Unit}) - {STATUS_CONFIG[a.Status]?.label}</option>
                  ))}
                  <option value="" disabled>--- Cùng danh mục ---</option>
                  {assets.filter(a => a.Id !== mergeAsset.Id && a.Name !== mergeAsset.Name && a.Category === mergeAsset.Category).map(a => (
                    <option value={a.Id} key={a.Id}>{a.Name} ({a.Quantity > 1 ? a.Quantity : 1} {a.Unit}) - {STATUS_CONFIG[a.Status]?.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  <span className="font-semibold text-amber-500">Lưu ý:</span> Thiết bị hiện tại <span className="line-through text-red-500">{mergeAsset.Name}</span> sẽ bị xóa. Số lượng, mã Serial và MAC của nó sẽ <span className="font-medium text-amber-500">được cộng dồn vào</span> thiết bị đích đã chọn.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 border-t border-border pt-4">
              <button onClick={() => { setMergeAsset(null); setMergeTargetId(""); }} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted font-medium transition-colors">Hủy bỏ</button>
              <button onClick={submitMerge} disabled={!mergeTargetId} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors shadow-md disabled:opacity-50">
                <CombineIcon className="w-4 h-4" /> Gộp ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageIcon className="w-6 h-6 text-emerald-500" />
          Asset Manager v2
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quản lý tài sản, thiết bị, Serial/MAC · NocoDB Backend
        </p>
      </div>

      {/* ========================= SUMMARY ========================= */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl p-5 mb-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-emerald-100 text-xs uppercase tracking-wider">Tổng giá trị tồn kho</p>
            <p className="text-3xl font-bold mt-1">{formatVND(stats.totalValue)}</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <DollarSignIcon className="w-6 h-6" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <span className="bg-white/10 rounded-lg px-3 py-1.5 text-center">📦 {stats.total} tổng</span>
          <span className="bg-white/10 rounded-lg px-3 py-1.5 text-center">✅ {stats.active} sử dụng</span>
          <span className="bg-white/10 rounded-lg px-3 py-1.5 text-center">🤝 {stats.lent} cho mượn</span>
          <span className="bg-white/10 rounded-lg px-3 py-1.5 text-center">💰 {stats.sold} đã bán</span>
          <span className="bg-white/10 rounded-lg px-3 py-1.5 text-center">🔧 {stats.broken} hỏng</span>
        </div>
      </div>

      {/* ========================= QUICK ACTIONS ========================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button onClick={() => openQuickAction("buy")} className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors">
          <ShoppingCartIcon className="w-4 h-4" /> Mua đồ
        </button>
        <button onClick={() => openQuickAction("lend")} className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm font-medium text-amber-600 hover:bg-amber-500/20 transition-colors">
          <HandshakeIcon className="w-4 h-4" /> Cho mượn
        </button>
        <button onClick={() => openQuickAction("return")} className="flex items-center gap-2 px-4 py-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sm font-medium text-sky-600 hover:bg-sky-500/20 transition-colors">
          <BoxIcon className="w-4 h-4" /> Thu hồi
        </button>
        <button onClick={() => openQuickAction("license")} className="flex items-center gap-2 px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm font-medium text-violet-600 hover:bg-violet-500/20 transition-colors">
          <KeyIcon className="w-4 h-4" /> License
        </button>
      </div>

      {/* ========================= ACTION FORM (Modal-style) ========================= */}
      {quickAction && (
        <div className="bg-card border border-blue-500/30 rounded-xl p-5 mb-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">{actionTitle}</h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><XIcon className="w-4 h-4" /></button>
          </div>

          {/* For "return", show lent assets as clickable list */}
          {quickAction === "return" && !editingId && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Chọn thiết bị đang cho mượn để thu hồi:</p>
              {assets.filter(a => a.Status === "lent").map(a => (
                <button key={a.Id} onClick={() => quickReturn(a)} className="w-full text-left bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 hover:bg-amber-500/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{a.Name}</span>
                      {a.Serial && <span className="text-xs text-muted-foreground ml-2">SN: {a.Serial}</span>}
                    </div>
                    <span className="text-xs text-amber-500">→ {a.LentTo || "?"}</span>
                  </div>
                </button>
              ))}
              {assets.filter(a => a.Status === "lent").length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Không có thiết bị nào đang cho mượn</p>
              )}
            </div>
          )}

          {/* For "lend" without editingId, show active assets to pick */}
          {quickAction === "lend" && !editingId && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Chọn thiết bị để cho mượn:</p>
              {assets.filter(a => a.Status === "active").map(a => (
                <button key={a.Id} onClick={() => quickLend(a)} className="w-full text-left bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3 hover:bg-emerald-500/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{a.Name}</span>
                    {a.Serial && <span className="text-xs text-muted-foreground">SN: {a.Serial}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Full form for buy/license OR when editing */}
          {(quickAction === "buy" || quickAction === "license" || editingId) && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Name with autocomplete */}
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <input placeholder="Tên thiết bị *" value={fName}
                    onChange={(e) => { setFName(e.target.value); setShowSuggestions(true); setFCategory(autoCategory(e.target.value)); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" autoFocus
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-auto">
                      {suggestions.map(s => (
                        <button key={s} onClick={() => { setFName(s); setFCategory(autoCategory(s)); setShowSuggestions(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b border-border last:border-0">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input placeholder="Serial Number" value={fSerial} onChange={(e) => setFSerial(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                <input placeholder="MAC Address" value={fMAC} onChange={(e) => setFMAC(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                
                <div className="flex gap-2">
                  <input placeholder="SL" type="number" min="1" value={fQuantity} onChange={(e) => setFQuantity(e.target.value)} className="w-16 bg-muted/30 border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                  <input placeholder="Đơn vị (cái, bộ)" value={fUnit} onChange={(e) => setFUnit(e.target.value)} className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                
                <input placeholder="Đơn giá (VND)" value={fPrice} onChange={(e) => {
                  const num = e.target.value.replace(/\D/g, "");
                  setFPrice(num ? Number(num).toLocaleString("vi-VN") : "");
                }} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                <input placeholder="Chủ sở hữu" value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                {(fStatus === "lent" || quickAction === "lend") && (
                  <input placeholder="Cho ai mượn?" value={fLentTo} onChange={(e) => setFLentTo(e.target.value)} className="bg-muted/30 border border-amber-500/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" autoFocus={quickAction === "lend"} />
                )}
                <input placeholder="Vị trí (Văn phòng, Nhà, Kho...)" value={fLocation} onChange={(e) => setFLocation(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="mt-3 p-3 bg-muted/20 border border-border rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-2">
                <h4 className="sm:col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Thư viện 4TB (Z:\Library)</h4>
                <input placeholder="Z:\Library\Images\a.png" value={fImages} onChange={(e) => setFImages(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500" />
                <input placeholder="Catalog path" value={fCatalogs} onChange={(e) => setFCatalogs(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500" />
                <input placeholder="Manual path" value={fManuals} onChange={(e) => setFManuals(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500" />
                <input placeholder="Specs path" value={fSpecs} onChange={(e) => setFSpecs(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500" />
              </div>
              <textarea placeholder="Ghi chú..." value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2}
                className="w-full mt-3 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 resize-none" />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={resetForm} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">Hủy</button>
                <button onClick={handleSubmit} className="flex items-center gap-1 px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors">
                  <CheckIcon className="w-3 h-3" /> {editingId ? "Cập nhật" : "Lưu"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================= CHARTS ========================= */}
      {stats.byCategory.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
            <PieChartIcon className="w-4 h-4 text-emerald-500" /> Phân loại tồn kho
          </h3>
          <div className="space-y-2">
            {stats.byCategory.map(([cat, data]) => {
              const pct = stats.totalValue > 0 ? Math.round((data.value / stats.totalValue) * 100) : 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{cat} ({data.count})</span>
                    <span className="text-muted-foreground">{formatVND(data.value)} · {pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${CATEGORY_COLORS[cat] || "bg-gray-400"} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================= TABS + SEARCH ========================= */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-3 pt-1 -mx-4 px-4 border-b border-border/50">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar flex-nowrap shrink-0">
          {([
            { key: "all" as FilterTab, label: "Tất cả", count: stats.total },
            { key: "active" as FilterTab, label: "Đang dùng", count: stats.active },
            { key: "stored" as FilterTab, label: "Lưu kho", count: stats.stored },
            { key: "lent" as FilterTab, label: "Cho mượn", count: stats.lent },
            { key: "sold" as FilterTab, label: "Đã bán", count: stats.sold },
            { key: "broken" as FilterTab, label: "Hỏng", count: stats.broken },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all shrink-0 ${tab === t.key ? "bg-emerald-500 text-white border-emerald-500 font-semibold" : "bg-card text-muted-foreground border-border hover:border-emerald-500/50"}`}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Tìm tên, serial, MAC..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          <div className="flex items-center bg-card border border-border rounded-lg p-0.5">
            <button
              onClick={() => { setViewMode("card"); localStorage.setItem("asset_view_mode", "card"); }}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "card" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Card view"
            >
              <LayoutGridIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setViewMode("table"); localStorage.setItem("asset_view_mode", "table"); }}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Table view"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================= ASSET LIST ========================= */}
      {viewMode === "table" ? (
        /* ===== TABLE VIEW ===== */
        <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Tên thiết bị</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Serial</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Loại</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Trạng thái</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Địa điểm</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">SL</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Giá trị</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Ghi chú</th>
                  <th className="text-center px-3 py-2.5 font-medium text-xs w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const st = STATUS_CONFIG[a.Status] || STATUS_CONFIG.active;
                  return (
                    <tr key={a.Id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded ${st.bg} ${st.color} flex items-center justify-center flex-shrink-0`}>
                            <PackageIcon className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-medium truncate max-w-[200px]" title={a.Name}>{a.Name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs font-mono">{a.Serial || "—"}</td>
                      <td className="px-3 py-2">
                        {a.Category && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[a.Category] ? `${CATEGORY_COLORS[a.Category]}/10 ${CATEGORY_COLORS[a.Category].replace("bg-", "text-")}` : "bg-muted text-muted-foreground"}`}>
                            {a.Category}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.color} font-medium`}>{st.label}</span>
                        {a.LentTo && <span className="text-[10px] text-amber-500 ml-1">→ {a.LentTo}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{a.Location || "—"}</td>
                      <td className="px-3 py-2 text-xs text-right text-muted-foreground">{a.Quantity > 1 ? `${a.Quantity} ${a.Unit || ""}` : "1"}</td>
                      <td className="px-3 py-2 text-xs text-right font-semibold text-emerald-500">{a.Price > 0 ? formatVND(a.Price * (a.Quantity || 1)) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={a.Notes}>{a.Notes || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setMergeAsset(a); setMergeTargetId(""); }} className="p-1 text-amber-500 hover:text-amber-600 rounded" title="Gộp lô">
                            <CombineIcon className="w-3.5 h-3.5" />
                          </button>
                          {a.Quantity > 1 && (
                            <button onClick={() => { setSplitAsset(a); setSplitQty("1"); setSplitStatus("active"); setSplitLentTo(""); }} className="p-1 text-emerald-500 hover:text-emerald-600 rounded" title="Tách lô">
                              <SplitSquareHorizontalIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => startEdit(a)} className="p-1 text-blue-500 hover:text-blue-600 rounded" title="Sửa">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(a)} className="p-1 text-red-500 hover:text-red-600 rounded" title="Xóa">
                            <Trash2Icon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={6} className="px-3 py-2 text-xs text-muted-foreground font-medium">
                      Tổng: {filtered.length} thiết bị
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-bold text-emerald-500">
                      {formatVND(filtered.reduce((s, a) => s + (a.Price || 0) * (a.Quantity || 1), 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* ===== CARD VIEW ===== */
        <div className="mt-4 space-y-2">
          {filtered.map(a => {
            const st = STATUS_CONFIG[a.Status] || STATUS_CONFIG.active;
            return (
              <div key={a.Id} className="bg-card border border-border rounded-xl px-4 py-3 hover:border-emerald-500/20 transition-colors group">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-lg ${st.bg} ${st.color} flex items-center justify-center flex-shrink-0`}>
                    <PackageIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Name + Status + Price */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold truncate">{a.Name} {a.Quantity > 1 ? `(x${a.Quantity} ${a.Unit || ''})` : ""}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.color} font-medium`}>{st.label}</span>
                      </div>
                      {a.Price > 0 && <span className="text-xs font-bold text-emerald-500 flex-shrink-0" title={`Đơn giá: ${formatVND(a.Price)}`}>{formatVND(a.Price * (a.Quantity || 1))}</span>}
                    </div>
                    {/* Row 2: Serial, MAC, Location */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {a.Serial && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded flex items-center gap-0.5 text-muted-foreground">
                          <HashIcon className="w-2.5 h-2.5" /> {a.Serial}
                        </span>
                      )}
                      {a.MAC && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded flex items-center gap-0.5 text-muted-foreground">
                          <WifiIcon className="w-2.5 h-2.5" /> {a.MAC}
                        </span>
                      )}
                      {a.Location && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded flex items-center gap-0.5 text-muted-foreground">
                          <MapPinIcon className="w-2.5 h-2.5" /> {a.Location}
                        </span>
                      )}
                      {a.Category && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[a.Category] ? `${CATEGORY_COLORS[a.Category].replace("bg-", "bg-")}/10 ${CATEGORY_COLORS[a.Category].replace("bg-", "text-")}` : "bg-muted text-muted-foreground"}`}>
                          {a.Category}
                        </span>
                      )}
                      {a.LentTo && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-medium">
                          → {a.LentTo}
                        </span>
                      )}
                    </div>
                    {a.Notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{a.Notes}</p>}
                    
                    {/* Library Links */}
                    {(a.Images || a.Catalogs || a.Manuals || a.Specs) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {a.Images && <a href={a.Images.startsWith("http") ? a.Images : `file:///${a.Images.replace(/\\/g, "/")}`} target="_blank" className="text-[10px] flex items-center gap-1 text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded font-medium hover:bg-violet-500/20"><ImageIcon className="w-3 h-3" /> Ảnh</a>}
                        {a.Catalogs && <a href={a.Catalogs.startsWith("http") ? a.Catalogs : `file:///${a.Catalogs.replace(/\\/g, "/")}`} target="_blank" className="text-[10px] flex items-center gap-1 text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium hover:bg-blue-500/20"><BookIcon className="w-3 h-3" /> Catalog</a>}
                        {a.Manuals && <a href={a.Manuals.startsWith("http") ? a.Manuals : `file:///${a.Manuals.replace(/\\/g, "/")}`} target="_blank" className="text-[10px] flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium hover:bg-emerald-500/20"><BookOpenIcon className="w-3 h-3" /> Manual</a>}
                        {a.Specs && <a href={a.Specs.startsWith("http") ? a.Specs : `file:///${a.Specs.replace(/\\/g, "/")}`} target="_blank" className="text-[10px] flex items-center gap-1 text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium hover:bg-amber-500/20"><FileTextIcon className="w-3 h-3" /> Specs</a>}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-wrap">
                      <button onClick={() => { setMergeAsset(a); setMergeTargetId(""); }} className="text-xs flex items-center gap-1 text-amber-500 hover:text-amber-600 font-medium whitespace-nowrap" title="Gộp vào lô khác">
                        <CombineIcon className="w-3.5 h-3.5" /> Gộp lô
                      </button>
                      {a.Quantity > 1 && (
                        <button onClick={() => { setSplitAsset(a); setSplitQty("1"); setSplitStatus("active"); setSplitLentTo(""); }} className="text-xs flex items-center gap-1 text-emerald-500 hover:text-emerald-600 font-medium whitespace-nowrap">
                          <SplitSquareHorizontalIcon className="w-3.5 h-3.5" /> Tách lô
                        </button>
                      )}
                      <button onClick={() => startEdit(a)} className="text-xs flex items-center gap-1 text-blue-500 hover:text-blue-600 font-medium whitespace-nowrap">
                        <PencilIcon className="w-3.5 h-3.5" /> Sửa
                      </button>
                      {a.Status === "active" && (
                        <button onClick={() => quickLend(a)} className="text-xs flex items-center gap-1 text-amber-500 hover:text-amber-600 font-medium whitespace-nowrap">
                          <HandshakeIcon className="w-3.5 h-3.5" /> Cho mượn
                        </button>
                      )}
                      {a.Status === "lent" && (
                        <button onClick={() => quickReturn(a)} className="text-xs flex items-center gap-1 text-sky-500 hover:text-sky-600 font-medium whitespace-nowrap">
                          <BoxIcon className="w-3.5 h-3.5" /> Thu hồi
                        </button>
                      )}
                      {a.MemoRef && (
                        <a href={`/memos/${a.MemoRef.replace("memos/", "")}`} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground whitespace-nowrap">
                          <ExternalLinkIcon className="w-3.5 h-3.5" /> Memo
                        </a>
                      )}
                      <button onClick={() => handleDelete(a)} className="text-xs flex items-center gap-1 text-red-500 hover:text-red-600 font-medium ml-auto whitespace-nowrap">
                        <Trash2Icon className="w-3.5 h-3.5" /> Xóa
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty */}
      {filtered.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <PackageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-1">Chưa có thiết bị nào</p>
          <p className="text-xs">Bấm "Mua đồ" để thêm thiết bị đầu tiên</p>
        </div>
      )}

      {loading && assets.length > 0 && (
        <div className="flex justify-center py-4"><LoaderIcon className="w-5 h-5 animate-spin text-emerald-500" /></div>
      )}
    </div>
  );
};

export default AssetManager;
