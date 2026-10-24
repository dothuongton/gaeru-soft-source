import { database } from "./server";
import { OrderError } from "./menu";
import { currentStoreId } from "./store-database";

export type StoreBannerItem = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl: string;
  badge?: string;
  link?: string;
  active?: boolean;
};

export type StoreBannerConfig = {
  enabled: boolean;
  mode: "slide" | "stacked";
  items: StoreBannerItem[];
};

export const defaultMainBanner: StoreBannerConfig = {
  enabled: true,
  mode: "slide",
  items: [
    {
      id: "main-hero-1",
      title: "Mộc — Hương vị tự nhiên",
      subtitle: "Gọi món dễ dàng tại bàn",
      description: "Thưởng thức cà phê rang xay thủ công và bữa ăn ngon lành ngay tại chỗ.",
      imageUrl: "/images/hero.webp",
      badge: "Nổi bật",
      active: true
    }
  ]
};

export const defaultOlaBanner: StoreBannerConfig = {
  enabled: true,
  mode: "slide",
  items: [
    {
      id: "ola-hero-1",
      title: "Ola Quán — Ngon ngọt từng khoảnh khắc",
      subtitle: "Hơn 130 món trà sữa, kem dừa & đồ ăn vặt",
      description: "Gọi món tiện lợi, phục vụ tận bàn, thanh toán nhanh chóng.",
      imageUrl: "/images/ola/banner-matcha.jpg",
      badge: "Món mới",
      active: true
    },
    {
      id: "ola-hero-2",
      title: "Bộ Sưu Tập Thức Uống Đậm Vị",
      subtitle: "Trà sữa, Sinh tố, Đá xay & Nước ép tươi mát",
      description: "Được pha chế từ nguyên liệu tuyển chọn mỗi ngày.",
      imageUrl: "/images/ola/banner-collection.jpg",
      badge: "Yêu thích",
      active: true
    }
  ]
};

export function normalizeBannerConfig(raw: unknown, storeId = "main"): StoreBannerConfig {
  if (!raw || typeof raw !== "object") {
    return storeId === "ola" ? { ...defaultOlaBanner } : { ...defaultMainBanner };
  }
  const rec = raw as Record<string, unknown>;
  const enabled = rec.enabled !== false;
  const mode = rec.mode === "stacked" ? "stacked" : "slide";
  const rawItems = Array.isArray(rec.items) ? rec.items : [];
  const items: StoreBannerItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    if (!it || typeof it !== "object") continue;
    const itemRec = it as Record<string, unknown>;
    const title = typeof itemRec.title === "string" ? itemRec.title.trim() : "";
    const imageUrl = typeof itemRec.imageUrl === "string" ? itemRec.imageUrl.trim() : "";
    if (!title || !imageUrl) continue;
    items.push({
      id: typeof itemRec.id === "string" && itemRec.id ? itemRec.id : `banner-${i + 1}`,
      title,
      subtitle: typeof itemRec.subtitle === "string" ? itemRec.subtitle.trim() : "",
      description: typeof itemRec.description === "string" ? itemRec.description.trim() : "",
      imageUrl,
      badge: typeof itemRec.badge === "string" ? itemRec.badge.trim() : "",
      link: typeof itemRec.link === "string" ? itemRec.link.trim() : "",
      active: itemRec.active !== false
    });
  }
  if (items.length === 0) {
    return storeId === "ola" ? { ...defaultOlaBanner, enabled, mode } : { ...defaultMainBanner, enabled, mode };
  }
  return { enabled, mode, items };
}

export async function getBannerConfig(store = currentStoreId()): Promise<StoreBannerConfig> {
  try {
    const saved = await database().prepare("SELECT value FROM settings WHERE key = ?")
      .bind("banner").first<{ value: string }>();
    if (!saved?.value) {
      return store === "ola" ? { ...defaultOlaBanner } : { ...defaultMainBanner };
    }
    return normalizeBannerConfig(JSON.parse(saved.value), store);
  } catch {
    return store === "ola" ? { ...defaultOlaBanner } : { ...defaultMainBanner };
  }
}

export async function saveBannerConfig(raw: unknown): Promise<{ ok: true; banner: StoreBannerConfig }> {
  const store = currentStoreId();
  if (!raw || typeof raw !== "object") {
    throw new OrderError("Cấu hình banner không hợp lệ.");
  }
  const banner = normalizeBannerConfig(raw, store);
  await database().prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind("banner", JSON.stringify(banner)).run();
  return { ok: true, banner };
}
