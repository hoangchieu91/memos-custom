import {
  ScrollTextIcon, PlusIcon, PrinterIcon, ChevronDownIcon,
  FileDownIcon, XIcon,
} from "lucide-react";
import { useState, useRef } from "react";

// ── Template Definitions ──────────────────────────────────────────────────────
type DocType = "handover" | "acceptance" | "violation" | "meeting" | "other";

const TEMPLATES: Record<DocType, { label: string; emoji: string; body: string }> = {
  handover: {
    label: "Biên bản bàn giao",
    emoji: "📋",
    body: `## BIÊN BẢN BÀN GIAO CÔNG TRÌNH / THIẾT BỊ

**Số biên bản:** BB-BG-[SỐ]-[NĂM]

### Thời gian, địa điểm
- Vào lúc ......... giờ, ngày ....../......./..........
- Tại: ...............................................................................

### Thành phần tham gia
**Bên giao:**
- Ông/Bà: .......................................................................................
- Chức vụ: .................................................. Đơn vị: .....................

**Bên nhận:**
- Ông/Bà: .......................................................................................
- Chức vụ: .................................................. Đơn vị: .....................

### Nội dung bàn giao
| STT | Mô tả hạng mục | Số lượng | Đơn vị | Ghi chú |
|-----|----------------|----------|--------|---------|
| 1   |                |          |        |         |
| 2   |                |          |        |         |

### Kết luận
Hai bên đồng ý ký biên bản bàn giao với nội dung như trên và cam kết thực hiện đúng các điều khoản.

---

| **BÊN GIAO** | **BÊN NHẬN** |
|:---:|:---:|
| *(Ký, ghi rõ họ tên)* | *(Ký, ghi rõ họ tên)* |
|   |   |
`,
  },
  acceptance: {
    label: "Biên bản nghiệm thu",
    emoji: "✅",
    body: `## BIÊN BẢN NGHIỆM THU

**Số biên bản:** BB-NT-[SỐ]-[NĂM]

### Căn cứ nghiệm thu
- Hợp đồng số: ............... ngày ............
- Hồ sơ thiết kế được phê duyệt.

### Thành phần nghiệm thu
**Chủ đầu tư (Bên A):**
- Chức danh: ....................................................

**Nhà thầu (Bên B):**
- Chức danh: ....................................................

### Đánh giá chất lượng
- Nội dung nghiệm thu: .......................................................................
- Khối lượng đã thực hiện: ...................................................................
- Chất lượng công tác: ☐ Đạt  ☐ Không đạt

**Ý kiến của các bên:**
...............................................................................................................

### Kết luận
☐ Đồng ý nghiệm thu, đưa vào sử dụng  
☐ Cần bổ sung, khắc phục trước khi nghiệm thu

---

| **BÊN A** | **BÊN B** |
|:---:|:---:|
| *(Ký, đóng dấu)* | *(Ký, đóng dấu)* |
|   |   |
`,
  },
  violation: {
    label: "Biên bản vi phạm",
    emoji: "⚠️",
    body: `## BIÊN BẢN GHI NHẬN SỰ VIỆC / VI PHẠM

**Số biên bản:** BB-VP-[SỐ]-[NĂM]

### Thời gian, địa điểm
- Vào hồi: ......... giờ, ngày ....../......./..........
- Địa điểm: ..........................................................................

### Thành phần lập biên bản
- Đại diện bên lập: ................................................
- Người liên quan: ..................................................

### Mô tả sự việc
...............................................................................................................
...............................................................................................................

### Hậu quả / Mức độ ảnh hưởng
...............................................................................................................

### Biện pháp xử lý
...............................................................................................................

### Cam kết của các bên
Các bên đã đọc và xác nhận nội dung biên bản là đúng sự thực.

---
| **Đại diện lập BB** | **Người liên quan** |
|:---:|:---:|
| *(Ký, ghi rõ họ tên)* | *(Ký, ghi rõ họ tên)* |
`,
  },
  meeting: {
    label: "Biên bản họp",
    emoji: "🤝",
    body: `## BIÊN BẢN CUỘC HỌP

**Thời gian:** ......... giờ, ngày ....../......./..........  
**Địa điểm:** ..........................................................................  
**Chủ trì:** ...............................................................................

### Thành phần tham dự
| STT | Họ và tên | Chức vụ | Đơn vị |
|-----|-----------|---------|--------|
| 1   |           |         |        |
| 2   |           |         |        |

### Nội dung
**Vấn đề thảo luận:**
...............................................................................................................

**Ý kiến các thành viên:**
...............................................................................................................

### Kết luận và phân công công việc
| STT | Nội dung công việc | Người thực hiện | Deadline |
|-----|-------------------|-----------------|----------|
| 1   |                   |                 |          |

---

**Chủ trì cuộc họp**  
*(Ký, ghi rõ họ tên)*
`,
  },
  other: {
    label: "Văn bản khác",
    emoji: "📄",
    body: `# TIÊU ĐỀ VĂN BẢN

**Ngày:** ${new Date().toLocaleDateString("vi-VN")}

---

*Nội dung văn bản...*

`,
  },
};

const STORAGE_KEY = "personal_os_documents";

interface SavedDoc {
  id: string;
  title: string;
  type: DocType;
  content: string;
  createdAt: string;
}

function loadDocs(): SavedDoc[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveDocs(d: SavedDoc[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }

// ── Main ──────────────────────────────────────────────────────────────────────
const DocumentEditor = () => {
  const [docs, setDocs] = useState<SavedDoc[]>(loadDocs);
  const [activeDoc, setActiveDoc] = useState<SavedDoc | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const persist = (d: SavedDoc[]) => { setDocs(d); saveDocs(d); };
  const createDoc = (type: DocType) => {
    const tmpl = TEMPLATES[type];
    const doc: SavedDoc = {
      id: Date.now().toString(),
      title: `${tmpl.label} - ${new Date().toLocaleDateString("vi-VN")}`,
      type,
      content: tmpl.body,
      createdAt: new Date().toISOString(),
    };
    persist([doc, ...docs]);
    setActiveDoc(doc);
    setShowTypeMenu(false);
  };

  const updateActive = (changes: Partial<SavedDoc>) => {
    if (!activeDoc) return;
    const updated = { ...activeDoc, ...changes };
    setActiveDoc(updated);
    persist(docs.map((d) => d.id === activeDoc.id ? updated : d));
  };

  const deleteDoc = (id: string) => {
    persist(docs.filter((d) => d.id !== id));
    if (activeDoc?.id === id) setActiveDoc(null);
  };

  const handlePrint = () => {
    if (!activeDoc) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head>
        <meta charset="utf-8">
        <title>${activeDoc.title}</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 13pt; margin: 2cm; line-height: 1.6; color: #000; }
          h1,h2,h3 { font-weight: bold; }
          h1 { font-size: 14pt; text-align: center; text-transform: uppercase; }
          h2 { font-size: 13pt; margin-top: 16pt; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 4pt 8pt; }
          @media print { body { margin: 1cm; } }
        </style>
      </head><body>
        <pre style="font-family: inherit; white-space: pre-wrap;">${activeDoc.content}</pre>
      </body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleExportMd = () => {
    if (!activeDoc) return;
    const blob = new Blob([activeDoc.content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${activeDoc.title.replace(/\s+/g, "-")}.md`;
    a.click();
  };

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex max-w-7xl mx-auto">
      {/* Sidebar – document list */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-border">
          <h1 className="text-base font-bold flex items-center gap-2">
            <ScrollTextIcon className="w-5 h-5 text-amber-500" />
            Biên bản
          </h1>
        </div>
        <div className="p-3 border-b border-border relative">
          <button
            onClick={() => setShowTypeMenu(!showTypeMenu)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
          >
            <PlusIcon className="w-4 h-4" />
            Tạo biên bản
            <ChevronDownIcon className="w-4 h-4 ml-auto" />
          </button>
          {showTypeMenu && (
            <div className="absolute left-3 right-3 mt-1 bg-background border border-border rounded-xl shadow-lg z-20 overflow-hidden">
              {(Object.entries(TEMPLATES) as [DocType, typeof TEMPLATES[DocType]][]).map(([type, tmpl]) => (
                <button key={type} onClick={() => createDoc(type)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2">
                  <span>{tmpl.emoji}</span> {tmpl.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chưa có biên bản nào</p>
          ) : (
            docs.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveDoc(d)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm group flex items-start gap-2 transition-colors ${activeDoc?.id === d.id ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-muted"}`}
              >
                <span className="shrink-0 mt-0.5">{TEMPLATES[d.type]?.emoji ?? "📄"}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">{d.title}</p>
                  <p className="text-[10px] text-muted-foreground">{TEMPLATES[d.type]?.label}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteDoc(d.id); }} className="opacity-0 group-hover:opacity-100 text-rose-500 shrink-0 mt-0.5">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        {!activeDoc ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ScrollTextIcon className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Chọn hoặc tạo biên bản mới</h3>
              <p className="text-sm text-muted-foreground">Chọn loại biên bản từ danh sách bên trái để bắt đầu soạn thảo</p>
            </div>
          </div>
        ) : (
          <>
            {/* Editor toolbar */}
            <div className="border-b border-border p-3 flex items-center gap-3 sticky top-0 bg-background z-10">
              <input
                className="flex-1 bg-transparent text-sm font-semibold focus:outline-none"
                value={activeDoc.title}
                onChange={(e) => updateActive({ title: e.target.value })}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleExportMd} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80">
                  <FileDownIcon className="w-3.5 h-3.5" /> .md
                </button>
                <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600">
                  <PrinterIcon className="w-3.5 h-3.5" /> In / PDF
                </button>
              </div>
            </div>
            <textarea
              ref={editorRef}
              className="flex-1 p-6 text-sm font-mono resize-none focus:outline-none bg-background leading-relaxed"
              value={activeDoc.content}
              onChange={(e) => updateActive({ content: e.target.value })}
              spellCheck={false}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentEditor;
