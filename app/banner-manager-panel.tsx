"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Check, RefreshCw, Eye, EyeOff, Image as ImageIcon, Sliders } from "lucide-react";
import { api } from "@/lib/api-client";
import type { StoreBannerConfig, StoreBannerItem } from "@/lib/banner-server";

export function BannerManagerPanel({
  working = false,
  notify,
  onRefresh
}: {
  working?: boolean;
  notify: (msg: string, kind?: "success" | "error" | "info") => void;
  onRefresh?: () => void;
}) {
  const [config, setConfig] = useState<StoreBannerConfig>({
    enabled: true,
    mode: "slide",
    items: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit / Add state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [badge, setBadge] = useState("");
  const [active, setActive] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const fetchBanner = async () => {
    setLoading(true);
    try {
      const data = await api<StoreBannerConfig>("admin/banner");
      setConfig(data);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBanner();
  }, []);

  const handleSave = async (updated: StoreBannerConfig) => {
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; banner: StoreBannerConfig }>("admin/banner", {
        method: "POST",
        body: JSON.stringify({ banner: updated })
      });
      setConfig(res.banner);
      notify("Đã lưu cấu hình banner thành công.", "success");
      onRefresh?.();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = (val: boolean) => {
    const next: StoreBannerConfig = { ...config, enabled: val };
    setConfig(next);
    void handleSave(next);
  };

  const handleChangeMode = (mode: "slide" | "stacked") => {
    const next: StoreBannerConfig = { ...config, mode };
    setConfig(next);
    void handleSave(next);
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setTitle("");
    setSubtitle("");
    setDescription("");
    setImageUrl("/images/hero.webp");
    setBadge("Món mới");
    setActive(true);
  };

  const handleStartEdit = (item: StoreBannerItem) => {
    setIsAdding(false);
    setEditingId(item.id);
    setTitle(item.title);
    setSubtitle(item.subtitle || "");
    setDescription(item.description || "");
    setImageUrl(item.imageUrl);
    setBadge(item.badge || "");
    setActive(item.active !== false);
  };

  const handleCancelItemForm = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSaveItemForm = () => {
    const cleanTitle = title.trim();
    const cleanImg = imageUrl.trim();
    if (!cleanTitle || !cleanImg) {
      notify("Vui lòng nhập tiêu đề và đường dẫn ảnh.", "error");
      return;
    }

    let nextItems: StoreBannerItem[];
    if (isAdding) {
      const newItem: StoreBannerItem = {
        id: "banner-" + Date.now(),
        title: cleanTitle,
        subtitle: subtitle.trim(),
        description: description.trim(),
        imageUrl: cleanImg,
        badge: badge.trim(),
        active
      };
      nextItems = [...config.items, newItem];
    } else {
      nextItems = config.items.map(it =>
        it.id === editingId
          ? {
              ...it,
              title: cleanTitle,
              subtitle: subtitle.trim(),
              description: description.trim(),
              imageUrl: cleanImg,
              badge: badge.trim(),
              active
            }
          : it
      );
    }

    const nextConfig: StoreBannerConfig = { ...config, items: nextItems };
    handleCancelItemForm();
    void handleSave(nextConfig);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!window.confirm("Bạn có chắc muốn xóa banner này?")) return;
    const nextItems = config.items.filter(it => it.id !== itemId);
    const nextConfig = { ...config, items: nextItems };
    void handleSave(nextConfig);
  };

  const handleToggleItemActive = (itemId: string) => {
    const nextItems = config.items.map(it => (it.id === itemId ? { ...it, active: !it.active } : it));
    const nextConfig = { ...config, items: nextItems };
    void handleSave(nextConfig);
  };

  return (
    <div className="settings-layout" style={{ marginTop: 24 }}>
      <div className="settings-form" style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Cấu hình Banner trang khách</h2>
            <p>Bật/tắt banner, chọn kiểu hiển thị slide trượt hoặc xếp chồng, và thay đổi các banner giới thiệu.</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={fetchBanner}
            disabled={loading || saving || working}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            Làm mới
          </button>
        </div>

        {/* Global Banner Switch & Mode */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            background: "#ffffff",
            padding: 16,
            borderRadius: 14,
            border: "1px solid #e4e7e4",
            marginTop: 16
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => handleToggleEnabled(e.target.checked)}
              disabled={saving || working}
              style={{ width: 20, height: 20, accentColor: "var(--moc-accent, #244f3c)" }}
            />
            <div>
              <strong style={{ fontSize: 15, display: "block" }}>Hiển thị Banner trên trang khách</strong>
              <small style={{ color: "#71717a" }}>Bật để hiện banner nổi bật, tắt để ẩn hoàn toàn banner.</small>
            </div>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Kiểu hiển thị banner</span>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="bannerMode"
                  value="slide"
                  checked={config.mode === "slide"}
                  onChange={() => handleChangeMode("slide")}
                  disabled={saving || working || !config.enabled}
                />
                Trượt (Slide Carousel)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="bannerMode"
                  value="stacked"
                  checked={config.mode === "stacked"}
                  onChange={() => handleChangeMode("stacked")}
                  disabled={saving || working || !config.enabled}
                />
                Xếp chồng (Stacked)
              </label>
            </div>
          </div>
        </div>

        {/* Item Edit/Add Form Modal or Box */}
        {(isAdding || editingId) && (
          <div
            style={{
              background: "#f8faf7",
              border: "1px solid var(--moc-accent, #244f3c)",
              borderRadius: 14,
              padding: 16,
              marginTop: 18
            }}
          >
            <strong style={{ display: "block", fontSize: 16, marginBottom: 12 }}>
              {isAdding ? "Thêm Banner mới" : "Chỉnh sửa Banner"}
            </strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: 13 }}>Tiêu đề banner *</span>
                <input
                  type="text"
                  placeholder="Ví dụ: Ola Quán — Ngon ngọt từng khoảnh khắc"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: 13 }}>Huy hiệu (Badge)</span>
                <input
                  type="text"
                  placeholder="Ví dụ: Món mới, Nổi bật, Giảm giá"
                  value={badge}
                  onChange={e => setBadge(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: 13 }}>Đường dẫn ảnh (URL hoặc /images/...) *</span>
                <input
                  type="text"
                  placeholder="/images/ola/banner-matcha.jpg"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: 13 }}>Dòng phụ (Subtitle)</span>
                <input
                  type="text"
                  placeholder="Hơn 130 món trà sữa, kem & đồ ăn vặt"
                  value={subtitle}
                  onChange={e => setSubtitle(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
            <label className="field" style={{ margin: "12px 0 0" }}>
              <span style={{ fontSize: 13 }}>Mô tả chi tiết</span>
              <textarea
                rows={2}
                placeholder="Mô tả ngắn hiển thị trên banner..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={saving}
              />
            </label>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  disabled={saving}
                />
                Kích hoạt banner này
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="secondary" onClick={handleCancelItemForm} disabled={saving}>
                  Hủy
                </button>
                <button type="button" className="primary" onClick={handleSaveItemForm} disabled={saving || !title.trim() || !imageUrl.trim()}>
                  <Check size={16} /> Lưu banner
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Banner Items List */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <strong style={{ fontSize: 15 }}>Danh sách Banner ({config.items.length})</strong>
            {!isAdding && !editingId && (
              <button
                type="button"
                className="secondary"
                onClick={handleStartAdd}
                disabled={saving || working}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13 }}
              >
                <Plus size={15} /> Thêm slide banner
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {config.items.map(item => {
              const isActive = item.active !== false;

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "#ffffff",
                    border: "1px solid #e4e7e4",
                    borderRadius: 12,
                    opacity: isActive ? 1 : 0.6,
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 72,
                        height: 48,
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "#f0f2f0",
                        flexShrink: 0
                      }}
                    >
                      <img
                        src={item.imageUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => {
                          if (!e.currentTarget.src.endsWith("/images/hero.webp")) e.currentTarget.src = "/images/hero.webp";
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </strong>
                        {item.badge && (
                          <span
                            style={{
                              background: "#edf2e7",
                              color: "var(--moc-accent, #244f3c)",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <small style={{ color: "#71717a", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {item.description || item.subtitle || item.imageUrl}
                      </small>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleToggleItemActive(item.id)}
                      disabled={saving}
                      title={isActive ? "Tạm ẩn" : "Kích hoạt"}
                      style={{ padding: "6px 8px" }}
                    >
                      {isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleStartEdit(item)}
                      disabled={saving}
                      title="Chỉnh sửa"
                      style={{ padding: "6px 8px" }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={saving}
                      title="Xóa banner"
                      style={{ padding: "6px 8px" }}
                    >
                      <Trash2 size={14} />
                    </button>
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
