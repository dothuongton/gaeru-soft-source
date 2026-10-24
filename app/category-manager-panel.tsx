"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Edit2, Check, RefreshCw, Layers } from "lucide-react";
import { api } from "@/lib/api-client";
import type { StoreCategory } from "@/lib/categories-server";

export function CategoryManagerPanel({
  working = false,
  notify,
  onRefresh
}: {
  working?: boolean;
  notify: (msg: string, kind?: "success" | "error" | "info") => void;
  onRefresh?: () => void;
}) {
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatShort, setNewCatShort] = useState("");
  const [newCatId, setNewCatId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editShort, setEditShort] = useState("");

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await api<StoreCategory[]>("admin/categories");
      setCategories(data);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCategories();
  }, []);

  const handleSave = async (updated: StoreCategory[]) => {
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; categories: StoreCategory[] }>("admin/categories", {
        method: "POST",
        body: JSON.stringify({ categories: updated })
      });
      setCategories(res.categories);
      notify("Đã cập nhật danh mục món ăn thành công.", "success");
      onRefresh?.();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const name = newCatName.trim();
    if (!name) return;
    const short = newCatShort.trim() || name;
    let id = newCatId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!id) {
      id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, "-");
    }
    if (!id) id = "cat-" + Date.now();
    if (categories.some(c => c.id === id)) {
      notify("Mã danh mục '" + id + "' đã tồn tại.", "error");
      return;
    }
    const maxSort = categories.reduce((m, c) => Math.max(m, c.sort ?? 0), 0);
    const nextList: StoreCategory[] = [...categories, { id, name, short, sort: maxSort + 1 }];
    setNewCatName("");
    setNewCatShort("");
    setNewCatId("");
    void handleSave(nextList);
  };

  const handleStartEdit = (cat: StoreCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditShort(cat.short);
  };

  const handleSaveEdit = (catId: string) => {
    const name = editName.trim();
    if (!name) return;
    const short = editShort.trim() || name;
    const nextList = categories.map(c => (c.id === catId ? { ...c, name, short } : c));
    setEditingId(null);
    void handleSave(nextList);
  };

  const handleDelete = (catId: string) => {
    if (catId === "all") {
      notify("Không thể xóa nhóm 'Tất cả món'.", "error");
      return;
    }
    if (!window.confirm("Bạn có chắc chắn muốn xóa danh mục này?")) return;
    const nextList = categories.filter(c => c.id !== catId);
    void handleSave(nextList);
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    const nextList = [...categories];
    const temp = nextList[index];
    nextList[index] = nextList[targetIdx];
    nextList[targetIdx] = temp;
    nextList.forEach((c, idx) => {
      c.sort = idx;
    });
    void handleSave(nextList);
  };

  return (
    <div className="settings-layout" style={{ marginTop: 24 }}>
      <div className="settings-form" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Quản lý danh mục món</h2>
            <p>Thêm, sửa, xóa và sắp xếp thứ tự hiển thị của các nhóm món ăn trên menu khách.</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={fetchCategories}
            disabled={loading || saving || working}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            Làm mới
          </button>
        </div>

        {/* Add new category */}
        <div
          style={{
            background: "#f8faf7",
            border: "1px dashed var(--moc-accent, #244f3c)",
            borderRadius: 14,
            padding: 16,
            marginTop: 16
          }}
        >
          <strong style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, marginBottom: 12 }}>
            <Plus size={18} /> Thêm danh mục mới
          </strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: 13 }}>Tên danh mục *</span>
              <input
                type="text"
                placeholder="Ví dụ: Trà trái cây"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                disabled={saving || working}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: 13 }}>Tên rút gọn (tab menu)</span>
              <input
                type="text"
                placeholder="Ví dụ: Trà quả"
                value={newCatShort}
                onChange={e => setNewCatShort(e.target.value)}
                disabled={saving || working}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: 13 }}>Mã nhận diện (slug)</span>
              <input
                type="text"
                placeholder="Để trống để tự tạo"
                value={newCatId}
                onChange={e => setNewCatId(e.target.value)}
                disabled={saving || working}
              />
            </label>
          </div>
          <button
            type="button"
            className="primary"
            onClick={handleAdd}
            disabled={saving || working || !newCatName.trim()}
            style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={16} /> Thêm danh mục
          </button>
        </div>

        {/* Category list */}
        <div style={{ marginTop: 20 }}>
          <strong style={{ fontSize: 15, display: "block", marginBottom: 10 }}>
            Danh sách danh mục hiện tại ({categories.length})
          </strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map((cat, idx) => {
              const isEditing = editingId === cat.id;
              const isFirst = idx === 0;
              const isLast = idx === categories.length - 1;

              return (
                <div
                  key={cat.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "#ffffff",
                    border: "1px solid #e4e7e4",
                    borderRadius: 12,
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: "#edf2e7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--moc-accent, #244f3c)"
                      }}
                    >
                      {idx + 1}
                    </span>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 8, flex: 1 }}>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Tên danh mục"
                          style={{ padding: "4px 8px", fontSize: 14, flex: 2, borderRadius: 6, border: "1px solid #ccc" }}
                        />
                        <input
                          type="text"
                          value={editShort}
                          onChange={e => setEditShort(e.target.value)}
                          placeholder="Tên ngắn"
                          style={{ padding: "4px 8px", fontSize: 14, flex: 1, borderRadius: 6, border: "1px solid #ccc" }}
                        />
                      </div>
                    ) : (
                      <div style={{ minWidth: 0, overflow: "hidden" }}>
                        <strong style={{ fontSize: 15, display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {cat.name}
                        </strong>
                        <span style={{ fontSize: 12, color: "#71717a" }}>
                          Mã: <code style={{ background: "#f0f2f0", padding: "1px 4px", borderRadius: 4 }}>{cat.id}</code> · Tên tab: {cat.short}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {isEditing ? (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => handleSaveEdit(cat.id)}
                        disabled={saving}
                        style={{ padding: "6px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Check size={14} /> Lưu
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleStartEdit(cat)}
                        title="Chỉnh sửa"
                        style={{ padding: "6px 8px" }}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}

                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleMove(idx, "up")}
                      disabled={isFirst || saving}
                      title="Chuyển lên"
                      style={{ padding: "6px 8px" }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleMove(idx, "down")}
                      disabled={isLast || saving}
                      title="Chuyển xuống"
                      style={{ padding: "6px 8px" }}
                    >
                      <ArrowDown size={14} />
                    </button>

                    {cat.id !== "all" && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDelete(cat.id)}
                        disabled={saving}
                        title="Xóa nhóm"
                        style={{ padding: "6px 8px" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
