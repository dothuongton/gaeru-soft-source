import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";

const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const dbFile = readdirSync(d1Dir).find(f => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (!dbFile) {
  console.error("No D1 sqlite file found!");
  process.exit(1);
}

const db = new DatabaseSync(`${d1Dir}/${dbFile}`);
console.log("Connected to live D1 database:", dbFile);

const now = Date.now();

// 1. Ensure Table 1 has active session for "Nguyễn Văn Hùng"
db.prepare(`UPDATE table_sessions SET status = 'active' WHERE table_id = '1'`).run();

// 2. Ensure Table 2 has active session for "Trần Thị Mai"
db.prepare(`UPDATE table_sessions SET status = 'active' WHERE table_id = '2'`).run();

// 3. Ensure Table 3 has active session for "Vũ Đình Phong"
db.prepare(`UPDATE table_sessions SET status = 'active' WHERE table_id = '3'`).run();

// 4. Ensure Table 4 is pending opening for "Lê Minh Tuấn"
db.prepare(`UPDATE table_sessions SET status = 'pending' WHERE table_id = '4'`).run();

const s1 = db.prepare(`SELECT * FROM table_sessions WHERE table_id = '1'`).get();
const s2 = db.prepare(`SELECT * FROM table_sessions WHERE table_id = '2'`).get();
const s3 = db.prepare(`SELECT * FROM table_sessions WHERE table_id = '3'`).get();

// Clear old orders for clean fixture
db.prepare(`DELETE FROM orders`).run();

// Insert orders for Table 1:
// Round 1 (ord_1): 2x Cơm gà sốt Mộc (1 đã phục vụ, 1 đang làm), 1x Trà đào sả (đã phục vụ)
const items1 = [
  {
    orderLineId: "line_1",
    itemId: "chicken",
    name: "Cơm gà sốt Mộc",
    quantity: 2,
    unitPrice: 65000,
    total: 130000,
    extras: ["Thêm trứng"],
    taste: "",
    note: "1 đùi 1 ức, không hành",
    image: "/images/chicken-rice.webp",
    newCount: 0,
    preparingCount: 1,
    readyCount: 0,
    servedCount: 1,
  },
  {
    orderLineId: "line_2",
    itemId: "tea",
    name: "Trà đào sả",
    quantity: 1,
    unitPrice: 39000,
    total: 39000,
    extras: [],
    taste: "Vừa vị",
    note: "",
    image: "/images/peach-tea.webp",
    newCount: 0,
    preparingCount: 0,
    readyCount: 0,
    servedCount: 1,
  },
];
db.prepare(`
  INSERT INTO orders (id, code, table_id, table_name, dining_session_id, customer_name, client_token, request_key, request_hash, items, total, note, status, paid, cancel_reason, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "ord_101",
  "101",
  "1",
  "Bàn 01",
  s1.id,
  s1.customer_name,
  "client_1",
  "key_1",
  "hash_1",
  JSON.stringify(items1),
  169000,
  "Đợt 1 cho 2 người",
  "preparing",
  0,
  "",
  now - 25 * 60000,
  now - 15 * 60000
);

// Round 2 (ord_102) on Table 1: 1x Khoai tây chiên (sẵn sàng phục vụ)
const items2 = [
  {
    orderLineId: "line_1",
    itemId: "fries",
    name: "Khoai tây chiên",
    quantity: 1,
    unitPrice: 35000,
    total: 35000,
    extras: [],
    taste: "",
    note: "Ít muối giòn rụm",
    image: "/images/fries.webp",
    newCount: 0,
    preparingCount: 0,
    readyCount: 1,
    servedCount: 0,
  },
];
db.prepare(`
  INSERT INTO orders (id, code, table_id, table_name, dining_session_id, customer_name, client_token, request_key, request_hash, items, total, note, status, paid, cancel_reason, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "ord_102",
  "102",
  "1",
  "Bàn 01",
  s1.id,
  s1.customer_name,
  "client_1",
  "key_2",
  "hash_2",
  JSON.stringify(items2),
  35000,
  "Kêu ăn vặt thêm",
  "ready",
  0,
  "",
  now - 12 * 60000,
  now - 5 * 60000
);

// Round 3 (ord_103) on Table 1: 1x Phở bò (đang làm)
const items3 = [
  {
    orderLineId: "line_1",
    itemId: "pho",
    name: "Phở bò",
    quantity: 1,
    unitPrice: 69000,
    total: 69000,
    extras: [],
    taste: "",
    note: "Nhiều hành, không ớt",
    image: "/images/pho-beef.webp",
    newCount: 0,
    preparingCount: 1,
    readyCount: 0,
    servedCount: 0,
  },
];
db.prepare(`
  INSERT INTO orders (id, code, table_id, table_name, dining_session_id, customer_name, client_token, request_key, request_hash, items, total, note, status, paid, cancel_reason, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "ord_103",
  "103",
  "1",
  "Bàn 01",
  s1.id,
  s1.customer_name,
  "client_1",
  "key_3",
  "hash_3",
  JSON.stringify(items3),
  69000,
  "Người thứ 3 mới tới",
  "preparing",
  0,
  "",
  now - 4 * 60000,
  now - 2 * 60000
);

// Order on Table 2 (ord_201): NEW order waiting for confirmation
const itemsTable2 = [
  {
    orderLineId: "line_1",
    itemId: "tiramisu",
    name: "Bánh tiramisu",
    quantity: 2,
    unitPrice: 45000,
    total: 90000,
    extras: [],
    taste: "",
    note: "Tráng miệng",
    image: "/images/tiramisu.webp",
    newCount: 2,
    preparingCount: 0,
    readyCount: 0,
    servedCount: 0,
  },
  {
    orderLineId: "line_2",
    itemId: "coffee",
    name: "Cà phê sữa đá",
    quantity: 2,
    unitPrice: 35000,
    total: 70000,
    extras: [],
    taste: "Ít ngọt",
    note: "Nhiều đá",
    image: "/images/iced-coffee.webp",
    newCount: 2,
    preparingCount: 0,
    readyCount: 0,
    servedCount: 0,
  },
];
db.prepare(`
  INSERT INTO orders (id, code, table_id, table_name, dining_session_id, customer_name, client_token, request_key, request_hash, items, total, note, status, paid, cancel_reason, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "ord_201",
  "201",
  "2",
  "Bàn 02",
  s2.id,
  s2.customer_name,
  "client_2",
  "key_201",
  "hash_201",
  JSON.stringify(itemsTable2),
  160000,
  "Bàn có trẻ nhỏ, mang nước trước bánh sau",
  "new",
  0,
  "",
  now - 1 * 60000,
  now - 1 * 60000
);

// Service requests:
db.prepare(`DELETE FROM service_requests`).run();
db.prepare(`
  INSERT INTO service_requests (id, table_id, table_name, session_id, kind, status, note, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run("call_1", "3", "Bàn 03", s3.id, "bill", "open", "Khách xin thanh toán chuyển khoản và hóa đơn", now - 3 * 60000);

console.log("Live DB populated with active sessions, 4 realistic orders, line status counts, and service call!");
