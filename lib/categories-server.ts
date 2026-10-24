import { database } from "./server";
import { OrderError } from "./menu";
import { currentStoreId } from "./store-database";

export type StoreCategory = {
  id: string;
  name: string;
  short: string;
  sort?: number;
};

export const defaultMainCategories: StoreCategory[] = [
  { id: "all", name: "Tất cả món", short: "Tất cả", sort: 0 },
  { id: "main", name: "Món chính", short: "Món chính", sort: 1 },
  { id: "light", name: "Ăn nhẹ", short: "Ăn nhẹ", sort: 2 },
  { id: "drink", name: "Đồ uống", short: "Đồ uống", sort: 3 },
  { id: "dessert", name: "Tráng miệng", short: "Tráng miệng", sort: 4 }
];

export const defaultOlaCategories: StoreCategory[] = [
  { id: "all", name: "Tất cả món", short: "Tất cả", sort: 0 },
  { id: "tra-sua", name: "Trà sữa", short: "Trà sữa", sort: 1 },
  { id: "tra-trai-cay", name: "Trà trái cây", short: "Trà trái cây", sort: 2 },
  { id: "da-xay", name: "Đá xay", short: "Đá xay", sort: 3 },
  { id: "sinh-to", name: "Sinh tố", short: "Sinh tố", sort: 4 },
  { id: "sua-tuoi", name: "Sữa tươi", short: "Sữa tươi", sort: 5 },
  { id: "nuoc-ep", name: "Nước ép", short: "Nước ép", sort: 6 },
  { id: "kem", name: "Kem", short: "Kem", sort: 7 },
  { id: "ca-phe", name: "Cà phê", short: "Cà phê", sort: 8 },
  { id: "soda", name: "Soda", short: "Soda", sort: 9 },
  { id: "sua-chua", name: "Sữa chua", short: "Sữa chua", sort: 10 },
  { id: "latte", name: "Latte", short: "Latte", sort: 11 },
  { id: "do-uong-nong", name: "Đồ uống nóng", short: "Đồ nóng", sort: 12 },
  { id: "do-an-vat", name: "Đồ ăn vặt", short: "Ăn vặt", sort: 13 }
];

export function normalizeCategories(raw: unknown, storeId = "main"): StoreCategory[] {
  if (!Array.isArray(raw)) {
    return storeId === "ola" ? [...defaultOlaCategories] : [...defaultMainCategories];
  }
  const clean: StoreCategory[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const short = typeof rec.short === "string" ? rec.short.trim() : name;
    if (!id || !name) continue;
    clean.push({
      id: id.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
      name,
      short: short || name,
      sort: typeof rec.sort === "number" ? rec.sort : i
    });
  }
  if (!clean.some(c => c.id === "all")) {
    clean.unshift({ id: "all", name: "Tất cả món", short: "Tất cả", sort: -1 });
  }
  return clean.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

export async function getCategories(store = currentStoreId()): Promise<StoreCategory[]> {
  try {
    const saved = await database().prepare("SELECT value FROM settings WHERE key = ?")
      .bind("categories").first<{ value: string }>();
    if (!saved?.value) {
      return store === "ola" ? [...defaultOlaCategories] : [...defaultMainCategories];
    }
    return normalizeCategories(JSON.parse(saved.value), store);
  } catch {
    return store === "ola" ? [...defaultOlaCategories] : [...defaultMainCategories];
  }
}

export async function saveCategories(raw: unknown): Promise<{ ok: true; categories: StoreCategory[] }> {
  const store = currentStoreId();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new OrderError("Danh sách danh mục không hợp lệ.");
  }
  const categories = normalizeCategories(raw, store);
  await database().prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind("categories", JSON.stringify(categories)).run();
  return { ok: true, categories };
}
