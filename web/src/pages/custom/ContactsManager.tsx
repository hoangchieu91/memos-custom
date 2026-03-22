import {
  LoaderIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  PhoneIcon,
  TagIcon,
  Trash2Icon,
  PencilIcon,
  XIcon,
  CheckIcon,
  UsersIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

// ============================================================================
// NocoDB Config
// ============================================================================

const NOCODB_DIRECT = "http://10.25.7.212:8080";
const NOCODB_TOKEN = "_TMGGkbPEWQa_hO82Kn3BjJi3DWbPiQDTnBumzPg";
const NOCODB_TABLE = "mprxxigwz2vbbiv";
const NOCODB_BASE_ID = "pakf4lho7c3mxzs";

function nocoUrl(path: string) {
  return `${NOCODB_DIRECT}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${NOCODB_TABLE}${path}`;
}

const headers = {
  "xc-token": NOCODB_TOKEN,
  "Content-Type": "application/json",
};

// ============================================================================
// Types
// ============================================================================

interface Contact {
  Id: number;
  Name: string;
  Phone: string;
  Notes: string;
  Tags: string;
  Source: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

// ============================================================================
// NocoDB API Helpers
// ============================================================================

async function fetchContacts(search?: string): Promise<Contact[]> {
  let url = nocoUrl("?limit=200&sort=-CreatedAt");
  if (search) {
    url += `&where=(Name,like,%25${encodeURIComponent(search)}%25)~or(Phone,like,%25${encodeURIComponent(search)}%25)~or(Notes,like,%25${encodeURIComponent(search)}%25)`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Lỗi ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.list || [];
}

async function createContact(contact: Partial<Contact>): Promise<Contact> {
  const res = await fetch(nocoUrl(""), {
    method: "POST",
    headers,
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
  return res.json();
}

async function updateContact(id: number, contact: Partial<Contact>): Promise<Contact> {
  const res = await fetch(nocoUrl(`/${id}`), {
    method: "PATCH",
    headers,
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
  return res.json();
}

async function deleteContact(id: number): Promise<void> {
  const res = await fetch(nocoUrl(`/${id}`), {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Lỗi ${res.status}`);
}

// ============================================================================
// Component
// ============================================================================

const ContactsManager = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTags, setFormTags] = useState("");

  // Load contacts
  const loadContacts = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      const list = await fetchContacts(q);
      setContacts(list);
    } catch (err: unknown) {
      toast.error(`Không tải được danh bạ: ${err instanceof Error ? err.message : "Lỗi"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => loadContacts(search || undefined), 300);
    return () => clearTimeout(timer);
  }, [search, loadContacts]);

  // Submit form
  const handleSubmit = async () => {
    if (!formName.trim()) {
      toast.error("Tên không được để trống");
      return;
    }
    try {
      const payload = {
        Name: formName.trim(),
        Phone: formPhone.trim(),
        Notes: formNotes.trim(),
        Tags: formTags.trim(),
        Source: editingId ? undefined : "personal-os",
      };
      if (editingId) {
        await updateContact(editingId, payload);
        toast.success("Đã cập nhật liên hệ");
      } else {
        await createContact(payload);
        toast.success("Đã thêm liên hệ mới");
      }
      resetForm();
      loadContacts(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : "Không rõ"}`);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Xóa liên hệ "${name}"?`)) return;
    try {
      await deleteContact(id);
      toast.success("Đã xóa");
      loadContacts(search || undefined);
    } catch (err: unknown) {
      toast.error(`Lỗi xóa: ${err instanceof Error ? err.message : "Không rõ"}`);
    }
  };

  const startEdit = (c: Contact) => {
    setEditingId(c.Id);
    setFormName(c.Name || "");
    setFormPhone(c.Phone || "");
    setFormNotes(c.Notes || "");
    setFormTags(c.Tags || "");
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormPhone("");
    setFormNotes("");
    setFormTags("");
  };

  // Stats
  const stats = useMemo(() => {
    const uniqueTags = new Set<string>();
    contacts.forEach(c => {
      (c.Tags || "").split(",").map(t => t.trim()).filter(Boolean).forEach(t => uniqueTags.add(t));
    });
    return { total: contacts.length, withPhone: contacts.filter(c => c.Phone).length, tags: uniqueTags.size };
  }, [contacts]);

  if (loading && contacts.length === 0) {
    return (
      <div className="w-full h-[80vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UsersIcon className="w-6 h-6 text-blue-500" />
          Danh bạ
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quản lý liên hệ · đồng bộ với NocoDB CRM
        </p>
      </div>

      {/* ========================= SUMMARY ========================= */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <UserIcon className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-blue-500">{stats.total}</p>
          <p className="text-[10px] text-blue-600 uppercase tracking-wider">Liên hệ</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <PhoneIcon className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-emerald-500">{stats.withPhone}</p>
          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Có SĐT</p>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-center">
          <TagIcon className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-purple-500">{stats.tags}</p>
          <p className="text-[10px] text-purple-600 uppercase tracking-wider">Nhãn</p>
        </div>
      </div>

      {/* ========================= SEARCH & ADD ========================= */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm tên, SĐT, ghi chú..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Thêm
        </button>
      </div>

      {/* ========================= ADD/EDIT FORM ========================= */}
      {showForm && (
        <div className="bg-card border border-blue-500/30 rounded-xl p-4 mb-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              {editingId ? <PencilIcon className="w-4 h-4 text-blue-500" /> : <PlusIcon className="w-4 h-4 text-blue-500" />}
              {editingId ? "Chỉnh sửa liên hệ" : "Thêm liên hệ mới"}
            </h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Tên *"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <input
              placeholder="Số điện thoại"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              placeholder="Tags (vd: khách hàng, đối tác)"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 sm:col-span-2"
            />
            <textarea
              placeholder="Ghi chú..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 sm:col-span-2 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={resetForm} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-1 px-4 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              <CheckIcon className="w-3 h-3" /> {editingId ? "Cập nhật" : "Lưu"}
            </button>
          </div>
        </div>
      )}

      {/* ========================= CONTACT LIST ========================= */}
      <div className="space-y-2">
        {contacts.map((c) => (
          <div
            key={c.Id}
            className="bg-card border border-border rounded-xl px-4 py-3 hover:border-blue-500/20 transition-colors group"
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {(c.Name || "?").charAt(0).toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.Name}</span>
                    {c.Phone && (
                      <a
                        href={`tel:${c.Phone}`}
                        className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PhoneIcon className="w-3 h-3" /> {c.Phone}
                      </a>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(c)}
                      className="p-1 text-muted-foreground hover:text-blue-500 transition-colors"
                      title="Sửa"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.Id, c.Name)}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Xóa"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {c.Notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.Notes}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {c.Tags && c.Tags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                    <span key={tag} className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {c.Source && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <ExternalLinkIcon className="w-2.5 h-2.5" /> {c.Source}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {contacts.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-1">Chưa có liên hệ nào</p>
          <p className="text-xs">Bấm "Thêm" để tạo liên hệ đầu tiên, hoặc ghi memo với tag <code className="bg-muted px-1 rounded">#crm</code> để n8n tự đồng bộ.</p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && contacts.length > 0 && (
        <div className="flex justify-center py-4">
          <LoaderIcon className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      )}
    </div>
  );
};

export default ContactsManager;
