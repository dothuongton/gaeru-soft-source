"use client";
import {withStore} from "@/lib/store-links";

import {useEffect, useId, useMemo, useState} from "react";
import type {FormEvent, PointerEvent, ReactNode} from "react";
import {ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CreditCard, Download, Eye, Info, RefreshCw, ShoppingBag, Table2, TrendingUp, Wallet} from "lucide-react";
import {money, statuses} from "../lib/menu";
import type {DiningTable, Order} from "../lib/menu";
import {paymentLabels} from "../lib/revenue-types";
import type {PaymentMethod, RevenueDaily, RevenueOrderBasis, RevenueOrderPage, RevenueOrderStatus, RevenueReport} from "../lib/revenue-types";
import {makeRevenueCsv} from "../lib/revenue-csv";
import "./revenue-panel.css";
import {SettlementHistory} from "./settlement-history";

type Range = {from: string; to: string; table: string};
type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";
type OrderFilters = {basis: RevenueOrderBasis; status: RevenueOrderStatus; payment: PaymentMethod | "all"; page: number};
type RevenuePanelProps = {tables: DiningTable[]; refreshKey: number; canCollect?: boolean; onCollect: (order: Order) => void; onViewOrder: (order: Order) => void; notify: (message: string) => void};

const dayMs = 86_400_000;
const presets: {id: Preset; label: string}[] = [{id: "today", label: "Hôm nay"}, {id: "yesterday", label: "Hôm qua"}, {id: "week", label: "7 ngày"}, {id: "month", label: "Tháng này"}, {id: "lastMonth", label: "Tháng trước"}, {id: "custom", label: "Tùy chọn"}];
const number = (value: number) => new Intl.NumberFormat("vi-VN", {maximumFractionDigits: 1}).format(value);
const todayVN = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const shiftDate = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * dayMs).toISOString().slice(0, 10);
const displayDay = (value: string, year = true) => year ? value.split("-").reverse().join("/") : value.slice(5).split("-").reverse().join("/");
const displayMoment = (value: number) => new Intl.DateTimeFormat("vi-VN", {timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}).format(new Date(value));
const displayClock = (value: number) => new Intl.DateTimeFormat("vi-VN", {timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit"}).format(new Date(value));

function presetRange(preset: Exclude<Preset, "custom">, table = "all"): Range {
  const today = todayVN();
  const first = today.slice(0, 7) + "-01";
  if (preset === "yesterday") return {from: shiftDate(today, -1), to: shiftDate(today, -1), table};
  if (preset === "week") return {from: shiftDate(today, -6), to: today, table};
  if (preset === "month") return {from: first, to: today, table};
  if (preset === "lastMonth") {
    const last = shiftDate(first, -1);
    return {from: last.slice(0, 7) + "-01", to: last, table};
  }
  return {from: today, to: today, table};
}

function validateRange(range: Range): string {
  for (const date of [range.from, range.to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) return "Vui lòng nhập đầy đủ ngày bắt đầu và ngày kết thúc hợp lệ.";
  }
  if (range.from > range.to) return "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.";
  if ((Date.parse(range.to) - Date.parse(range.from)) / dayMs + 1 > 366) return "Mỗi báo cáo hỗ trợ tối đa 366 ngày. Vui lòng chọn khoảng ngắn hơn.";
  return "";
}

function useReportResource<T>(path: string, revision: string) {
  const key = path + "|" + revision;
  const [stored, setStored] = useState<{key: string; path: string; data: T} | null>(null);
  const [state, setState] = useState<{key: string; loading: boolean; error: string}>({key: "", loading: true, error: ""});
  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {timedOut = true; controller.abort();}, 15_000);
    setState({key, loading: true, error: ""});
    void (async () => {
      try {
        const response = await fetch(withStore(path), {credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: {Accept: "application/json"}});
        const data: unknown = await response.json();
        if (!response.ok) {
          const details = data && typeof data === "object" ? data as {error?: unknown; message?: unknown} : {};
          throw new Error(typeof details.error === "string" ? details.error : typeof details.message === "string" ? details.message : "Chưa tải được dữ liệu. Vui lòng thử lại.");
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Dữ liệu trả về chưa hợp lệ. Vui lòng tải lại báo cáo.");
        if (!cancelled) {
          setStored({key, path, data: data as T});
          setState({key, loading: false, error: ""});
        }
      } catch (error) {
        if (!cancelled) {
          setStored(null);
          setState({key, loading: false, error: timedOut ? "Kết nối quá thời gian chờ. Vui lòng thử tải lại." : error instanceof Error ? error.message : "Chưa tải được dữ liệu. Vui lòng thử lại."});
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {cancelled = true; window.clearTimeout(timeout); controller.abort();};
  }, [key, path]);
  return {
    data: stored?.path === path ? stored.data : null,
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : "",
    fresh: stored?.key === key && state.key === key && !state.loading && !state.error,
  };
}

function SectionHeading({icon, title, text, aside}: {icon: ReactNode; title: string; text: string; aside?: ReactNode}) {
  return <div className="rev-section-heading"><div><h3>{icon}{title}</h3><p>{text}</p></div>{aside}</div>;
}

function Trend({current, previous, reverse = false}: {current: number; previous: number; reverse?: boolean}) {
  if (!previous) return <span className="rev-trend neutral">{current ? "Phát sinh trong kỳ" : "Không thay đổi"}</span>;
  const change = (current - previous) / previous * 100;
  if (!change) return <span className="rev-trend neutral">Không thay đổi</span>;
  const rising = change > 0;
  return <span className={"rev-trend " + (rising !== reverse ? "positive" : "negative")} title={"Kỳ trước: " + money(previous)}>{rising ? <ArrowUpRight size={13}/> : <ArrowDownLeft size={13}/>}<b>{rising ? "+" : "−"}{number(Math.abs(change))}%</b><span>so với kỳ trước</span></span>;
}

function Metric({title, value, note, icon, previous, primary = false, reverse = false}: {title: string; value: number; note: string; icon: ReactNode; previous: number; primary?: boolean; reverse?: boolean}) {
  return <article className={"rev-metric" + (primary ? " primary-metric" : "")}><div className="rev-metric-title"><span>{title}</span>{icon}</div><strong>{money(value)}</strong><p>{note}</p><Trend current={value} previous={previous} reverse={reverse}/></article>;
}

function EmptyReport({text}: {text: string}) {
  return <div className="rev-empty"><ShoppingBag size={25}/><p>{text}</p></div>;
}

function LoadError({message, onRetry}: {message: string; onRetry: () => void}) {
  return <div className="rev-error" role="alert"><CircleAlert size={20}/><div><strong>Chưa tải được báo cáo</strong><p>{message}</p></div><button type="button" className="secondary" onClick={onRetry}><RefreshCw size={14}/>Thử lại</button></div>;
}

function RevenueChart({daily}: {daily: RevenueDaily[]}) {
  const [series, setSeries] = useState<"both" | "collected" | "orderRevenue">("both");
  const [selected, setSelected] = useState<number | null>(null);
  const gradientId = "rev-gradient-" + useId().replace(/:/g, "");
  const W = 900, H = 276, left = 67, right = 20, top = 22, bottom = 42;
  const plotWidth = W - left - right, plotHeight = H - top - bottom;
  const activeIndex = Math.max(0, Math.min(selected ?? daily.length - 1, daily.length - 1));
  const activeDay = daily[activeIndex];
  const showCollected = series !== "orderRevenue";
  const showOrders = series !== "collected";
  const highest = Math.max(0, ...daily.flatMap(day => [showCollected ? day.collected : 0, showOrders ? day.orderRevenue : 0]));
  const magnitude = highest ? 10 ** Math.floor(Math.log10(highest)) : 100_000;
  const ceiling = highest ? Math.ceil(highest / magnitude * 2) / 2 * magnitude : magnitude;
  const x = (index: number) => left + (daily.length > 1 ? index / (daily.length - 1) * plotWidth : plotWidth / 2);
  const y = (value: number) => top + plotHeight - value / ceiling * plotHeight;
  const line = (field: "collected" | "orderRevenue") => daily.map((day, index) => `${index ? "L" : "M"}${x(index)},${y(day[field])}`).join(" ");
  const axisAmount = (value: number) => value >= 1_000_000_000 ? number(value / 1_000_000_000) + " tỷ" : value >= 1_000_000 ? number(value / 1_000_000) + " tr" : value >= 1_000 ? number(value / 1_000) + " nghìn" : number(value);
  const tickIndices = Array.from(new Set(Array.from({length: Math.min(6, daily.length)}, (_, i) => Math.round(i * (daily.length - 1) / Math.max(1, Math.min(6, daily.length) - 1)))));
  function selectDay(event: PointerEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    setSelected(Math.max(0, Math.min(daily.length - 1, Math.round((point.x - left) / plotWidth * (daily.length - 1)))));
  }
  return <section className="rev-card rev-chart-card">
    <SectionHeading icon={<TrendingUp size={19}/>} title="Diễn biến theo ngày" text="Tiền thu theo ngày xác nhận thanh toán; giá trị đơn theo ngày khách gọi." aside={<div className="rev-segment" role="group" aria-label="Chỉ số trên biểu đồ">{[{id: "both", label: "Cả hai"}, {id: "collected", label: "Tiền thu"}, {id: "orderRevenue", label: "Giá trị đơn"}].map(item => <button key={item.id} type="button" className={series === item.id ? "selected" : ""} aria-pressed={series === item.id} onClick={() => setSeries(item.id as typeof series)}>{item.label}</button>)}</div>}/>
    <div className="rev-chart-legend"><span><i className="cash"/>Tiền thu</span><span><i className="orders"/>Giá trị đơn hàng</span><small>Đơn vị: VND</small></div>
    {daily.length ? <>
      <div className="rev-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Biểu đồ ${daily.length} ngày từ ${displayDay(daily[0].date)} đến ${displayDay(daily[daily.length - 1].date)}. Dùng thanh chọn bên dưới để đọc chính xác từng ngày.`} onPointerMove={selectDay} onPointerDown={selectDay}>
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4d7c51" stopOpacity=".18"/><stop offset="100%" stopColor="#4d7c51" stopOpacity=".015"/></linearGradient></defs>
          {[0, 1, 2, 3, 4].map(tick => {const value = ceiling * tick / 4; return <g key={tick}><line x1={left} y1={y(value)} x2={W - right} y2={y(value)} stroke="#e7ece3" strokeDasharray={tick ? "3 5" : undefined}/><text x={left - 12} y={y(value) + 4} textAnchor="end" className="rev-axis">{axisAmount(value)}</text></g>;})}
          {showCollected && daily.length > 1 && <path d={`${line("collected")} L${x(daily.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradientId})`}/>}
          {showOrders && daily.length > 1 && <path d={line("orderRevenue")} fill="none" stroke="#bc9859" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round"/>}
          {showCollected && daily.length > 1 && <path d={line("collected")} fill="none" stroke="#2d6243" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>}
          {activeDay && <><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={y(0)} stroke="#becbb4" strokeDasharray="4 4"/>{showOrders && <circle cx={x(activeIndex)} cy={y(activeDay.orderRevenue)} r="5" fill="#bc9859" stroke="white" strokeWidth="2"/>}{showCollected && <circle cx={x(activeIndex)} cy={y(activeDay.collected)} r="5" fill="#2d6243" stroke="white" strokeWidth="2"/>}</>}
          {tickIndices.map(index => <text key={index} x={x(index)} y={H - 14} textAnchor="middle" className="rev-axis">{displayDay(daily[index].date, false)}</text>)}
        </svg>
        {!highest && <span className="rev-chart-zero">Chưa có giá trị phát sinh cho chỉ số đang chọn</span>}
      </div>
      {activeDay && <div className="rev-chart-detail"><strong>{displayDay(activeDay.date)}</strong><span><i className="cash"/>Tiền thu <b>{money(activeDay.collected)}</b><small>{number(activeDay.collectedOrders)} đơn</small></span><span><i className="orders"/>Giá trị đơn <b>{money(activeDay.orderRevenue)}</b><small>{number(activeDay.validOrders)} đơn</small></span></div>}
      {daily.length > 1 && <label className="rev-chart-slider"><span>Chọn ngày để xem số liệu</span><input type="range" min="0" max={daily.length - 1} step="1" value={activeIndex} aria-label="Ngày xem chi tiết trên biểu đồ" aria-valuetext={activeDay ? `${displayDay(activeDay.date)}, tiền thu ${money(activeDay.collected)}, giá trị đơn ${money(activeDay.orderRevenue)}` : ""} onChange={event => setSelected(Number(event.target.value))}/><small>{displayDay(daily[0].date, false)} — {displayDay(daily[daily.length - 1].date, false)}</small></label>}
    </> : <EmptyReport text="Chưa có dữ liệu theo ngày trong khoảng đã chọn."/>}
  </section>;
}

function TopItems({report}: {report: RevenueReport}) {
  const [showAll, setShowAll] = useState(false);
  const max = report.topItems[0]?.quantity || 1;
  const visible = showAll ? report.topItems : report.topItems.slice(0, 6);
  return <section className="rev-card rev-items-card"><SectionHeading icon={<ShoppingBag size={19}/>} title="Món được gọi nhiều" text="Theo số phần trong đơn hợp lệ tạo trong kỳ. Giá trị gồm tùy chọn món." aside={<span className="rev-count">Tối đa 20 món</span>}/>{visible.length ? <><div className="rev-ranking-head"><span>Món / số phần</span><span>Giá trị đơn</span></div><div className="rev-ranking">{visible.map((item, index) => <div className="rev-ranking-row" key={item.itemId}><span className="rev-rank-number">{String(index + 1).padStart(2, "0")}</span><div className="rev-rank-main"><div><strong>{item.name}</strong><span>{number(item.quantity)} phần</span></div><div className="rev-rank-track"><span style={{width: `${item.quantity / max * 100}%`}}/></div></div><b>{money(item.orderRevenue)}</b></div>)}</div>{report.topItems.length > 6 && <button type="button" className="rev-show-more" onClick={() => setShowAll(value => !value)}>{showAll ? "Thu gọn" : `Xem ${report.topItems.length} món trong báo cáo`}<ChevronRight size={14}/></button>}</> : <EmptyReport text="Chưa có món trong đơn hợp lệ của kỳ này."/>}</section>;
}

function PaymentBreakdown({report}: {report: RevenueReport}) {
  const total = report.summary.collected;
  return <section className="rev-card rev-payment-card"><SectionHeading icon={<CreditCard size={19}/>} title="Phương thức thu tiền" text="Theo thời điểm xác nhận đã thu trong kỳ."/><div className="rev-payment-total"><span>Tổng đã thu</span><strong>{money(total)}</strong></div><div className="rev-payment-bar" role="img" aria-label={report.payments.map(payment => `${paymentLabels[payment.method]}: ${money(payment.total)}`).join(". ") || "Chưa có tiền thu trong kỳ"}>{total ? report.payments.filter(payment => payment.total > 0).map(payment => <span key={payment.method} className={payment.method} style={{width: `${payment.total / total * 100}%`}}/>) : <span className="empty"/>}</div><div className="rev-payment-list">{(["cash", "bank", "other", "unknown"] as PaymentMethod[]).map(method => {const item = report.payments.find(payment => payment.method === method); return <div key={method}><i className={method}/><span>{paymentLabels[method]}<small>{number(item?.count ?? 0)} đơn · {total ? number((item?.total ?? 0) / total * 100) : "0"}%</small></span><strong>{money(item?.total ?? 0)}</strong></div>;})}</div>{!total && <p className="rev-card-footnote">Chưa ghi nhận khoản thu có thời điểm thanh toán trong kỳ này.</p>}</section>;
}

function ByTable({report}: {report: RevenueReport}) {
  return <section className="rev-card rev-tables-card"><SectionHeading icon={<Table2 size={19}/>} title="Doanh thu theo bàn" text="Giá trị đơn theo ngày tạo; tiền thu theo ngày xác nhận thanh toán."/>{report.byTable.length ? <div className="rev-table-scroll"><table className="rev-simple-table"><thead><tr><th scope="col">Bàn</th><th scope="col" className="numeric">Đơn hợp lệ</th><th scope="col" className="numeric">Giá trị đơn</th><th scope="col" className="numeric">Tiền thu</th><th scope="col" className="numeric">Chưa thanh toán*</th></tr></thead><tbody>{report.byTable.map(table => <tr key={table.tableId}><th scope="row">{table.tableName}</th><td className="numeric">{number(table.validOrders)}</td><td className="numeric">{money(table.orderRevenue)}</td><td className="numeric rev-cell-collected">{money(table.collected)}</td><td className={"numeric" + (table.unpaidForOrders ? " rev-cell-pending" : "")}>{money(table.unpaidForOrders)}</td></tr>)}</tbody></table></div> : <EmptyReport text="Chưa có đơn hoặc khoản thu của các bàn trong kỳ này."/>}<p className="rev-card-footnote">* Của đơn được tạo trong khoảng ngày đang chọn, theo trạng thái hiện tại.</p></section>;
}

export function RevenuePanel({tables, refreshKey, canCollect = false, onCollect, onViewOrder, notify}: RevenuePanelProps) {
  const [range, setRange] = useState<Range>(() => presetRange("today"));
  const [draft, setDraft] = useState<Range>(range);
  const [preset, setPreset] = useState<Preset>("today");
  const [filterError, setFilterError] = useState("");
  const [tick, setTick] = useState(0);
  const [filters, setFilters] = useState<OrderFilters>({basis: "created", status: "all", payment: "all", page: 1});
  const rangeQuery = useMemo(() => new URLSearchParams(range).toString(), [range]);
  const orderQuery = useMemo(() => new URLSearchParams({...range, basis: filters.basis, status: filters.status, payment: filters.payment, page: String(filters.page)}).toString(), [range, filters]);
  const revision = `${refreshKey}:${tick}`;
  const reportResource = useReportResource<RevenueReport>("/api/admin/revenue?" + rangeQuery, revision);
  const ordersResource = useReportResource<RevenueOrderPage>("/api/admin/revenue/orders?" + orderQuery, revision);
  const report = reportResource.data;
  const orderPage = ordersResource.data;
  const dirty = draft.from !== range.from || draft.to !== range.to || draft.table !== range.table;
  const tableLabel = range.table === "all" ? "Tất cả bàn" : tables.find(table => table.id === range.table)?.name || `Bàn ${range.table}`;
  const reload = () => setTick(value => value + 1);
  const currentDay = todayVN();

  useEffect(() => {
    const interval = window.setInterval(() => {if (document.visibilityState === "visible") setTick(value => value + 1);}, 30_000);
    const onVisible = () => {if (document.visibilityState === "visible") setTick(value => value + 1);};
    document.addEventListener("visibilitychange", onVisible);
    return () => {window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible);};
  }, []);

  useEffect(() => {
    if (orderPage && orderPage.pages > 0 && filters.page > orderPage.pages) setFilters(previous => ({...previous, page: orderPage.pages}));
  }, [orderPage, filters.page]);

  useEffect(() => {
    if (preset === "custom") return;
    const expected = presetRange(preset, range.table);
    if (expected.from === range.from && expected.to === range.to) return;
    // Keep quick ranges honest after midnight in Vietnam. Preserve an unfinished
    // custom edit instead of silently replacing what the administrator typed.
    if (dirty) {setPreset("custom"); return;}
    setRange(expected);
    setDraft(expected);
    setFilters(previous => ({...previous, page: 1}));
  }, [currentDay, preset, dirty, range.from, range.to, range.table]);

  function applyRange(next: Range) {
    const error = validateRange(next);
    setFilterError(error);
    if (error) return;
    setRange({...next});
    setFilters(previous => ({...previous, page: 1}));
  }

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next === "custom") return;
    const nextRange = presetRange(next, draft.table);
    setDraft(nextRange);
    applyRange(nextRange);
  }

  function submitRange(event: FormEvent) {
    event.preventDefault();
    applyRange(draft);
  }

  function exportReport() {
    if (!report || !reportResource.fresh) return;
    const url = URL.createObjectURL(new Blob([makeRevenueCsv(report)], {type: "text/csv;charset=utf-8;"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `moc-doanh-thu-${range.from}_${range.to}${range.table === "all" ? "" : "-ban-" + range.table.replace(/[^a-zA-Z0-9_-]/g, "")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    notify("Đã xuất CSV tổng hợp cho toàn bộ khoảng ngày và bàn đang áp dụng.");
  }

  function changeStatus(status: RevenueOrderStatus) {
    setFilters(previous => ({...previous, status, payment: status === "unpaid" || status === "cancelled" ? "all" : previous.payment, page: 1}));
  }

  function changeBasis(basis: RevenueOrderBasis) {
    setFilters(previous => ({...previous, basis, status: basis === "paid" && (previous.status === "unpaid" || previous.status === "cancelled") ? "all" : previous.status, page: 1}));
  }

  return <div className="revenue-panel">
    <div className="rev-heading"><div><p className="eyebrow">THEO DÕI HOẠT ĐỘNG CỬA HÀNG</p><h2>Doanh thu và thu tiền</h2><p>Xem đơn hàng, khoản đã thu và số tiền còn chờ thanh toán. <a className="rev-settlement-jump" href="#quyet-toan-ban">Xem quyết toán bàn<ChevronRight size={13}/></a></p></div><div className="rev-heading-actions"><button type="button" className="secondary rev-refresh" onClick={reload} disabled={reportResource.loading && ordersResource.loading} aria-label="Làm mới báo cáo" title="Làm mới báo cáo"><RefreshCw size={16} className={reportResource.loading ? "rev-spinning" : ""}/><span>Làm mới</span></button><button type="button" className="primary" onClick={exportReport} disabled={!reportResource.fresh || dirty}><Download size={16}/>Xuất tổng hợp CSV</button></div></div>

    <section className="rev-filters" aria-label="Lọc báo cáo doanh thu"><div className="rev-presets" role="group" aria-label="Khoảng ngày nhanh">{presets.slice(0,3).map(item => <button key={item.id} type="button" className={preset === item.id ? "selected" : ""} aria-pressed={preset === item.id} onClick={() => choosePreset(item.id)}>{item.label}</button>)}</div><details className="rev-range-options" open={preset==="custom"||!!filterError?true:undefined}><summary><CalendarDays size={16}/>Khoảng ngày & phạm vi bàn</summary><div className="rev-presets">{presets.slice(3).map(item=><button key={item.id} type="button" className={preset===item.id?"selected":""} aria-pressed={preset===item.id} onClick={()=>choosePreset(item.id)}>{item.label}</button>)}</div><form className="rev-range-form" onSubmit={submitRange}><label><span>Từ ngày</span><input type="date" value={draft.from} aria-label="Ngày bắt đầu báo cáo" onChange={event => {setDraft(previous => ({...previous, from: event.target.value})); setPreset("custom"); setFilterError("");}} required/></label><label><span>Đến ngày</span><input type="date" value={draft.to} aria-label="Ngày kết thúc báo cáo" onChange={event => {setDraft(previous => ({...previous, to: event.target.value})); setPreset("custom"); setFilterError("");}} required/></label><label className="rev-table-select"><span>Phạm vi bàn</span><select value={draft.table} onChange={event => {setDraft(previous => ({...previous, table: event.target.value})); setFilterError("");}}><option value="all">Tất cả bàn</option>{tables.map(table => <option key={table.id} value={table.id}>{table.name} · {table.zone}</option>)}</select></label><button type="submit" className="primary">Áp dụng</button></form></details>{filterError && <p className="rev-filter-error" role="alert">{filterError}</p>}<div className="rev-active-range"><span><CalendarDays size={14}/><strong>Đang xem: {displayDay(range.from)}{range.from !== range.to ? " — " + displayDay(range.to) : ""}</strong><i/> {tableLabel}</span><small>{dirty ? "Có thay đổi chưa áp dụng" : "Giờ Việt Nam · UTC+7"}</small></div></section>

    <div className="rev-report-status" aria-live="polite"><span>{report ? `So sánh với ${displayDay(report.range.previousFrom)}${report.range.previousFrom !== report.range.previousTo ? " — " + displayDay(report.range.previousTo) : ""} · cùng ${report.range.days} ngày` : "Khoảng so sánh là kỳ liền trước có cùng số ngày."}</span><span>{reportResource.loading ? <><RefreshCw size={12} className="rev-spinning"/>Đang cập nhật số liệu…</> : report ? <><span className="rev-live-dot"/>Cập nhật {displayClock(report.generatedAt)}</> : ""}</span></div>
    {reportResource.error ? <LoadError message={reportResource.error} onRetry={reload}/> : !report ? <div className="rev-loading" role="status"><RefreshCw size={24} className="rev-spinning"/><strong>Đang tổng hợp doanh thu</strong><p>Dữ liệu được tính từ các đơn hàng của cửa hàng.</p></div> : <>
      <section className="rev-metrics" aria-label="Chỉ số doanh thu"><Metric primary title="Tiền thu trong kỳ" value={report.summary.collected} note={`${number(report.summary.collectedOrders)} đơn · theo thời điểm xác nhận thu tiền`} previous={report.previous.collected} icon={<Wallet size={20}/>}/><Metric title="Giá trị đơn hàng" value={report.summary.orderRevenue} note="Đơn tạo trong kỳ, đã loại trừ đơn hủy" previous={report.previous.orderRevenue} icon={<ShoppingBag size={19}/>}/><Metric title="Đã thanh toán" value={report.summary.paidForOrders} note="Của đơn tạo trong kỳ · trạng thái hiện tại" previous={report.previous.paidForOrders} icon={<CreditCard size={19}/>}/><Metric title="Chưa thanh toán" value={report.summary.unpaidForOrders} note={`${number(report.summary.unpaidOrders)} đơn tạo trong kỳ còn chờ thu`} previous={report.previous.unpaidForOrders} reverse icon={<Banknote size={19}/>}/></section>
      <p className="rev-metric-note"><Info size={14}/><span>Tiền thu trong kỳ có thể gồm đơn tạo ở kỳ trước. “Đã thanh toán” và “Chưa thanh toán” phản ánh trạng thái hiện tại của các đơn tạo trong kỳ đang xem.</span></p>
      <div className="rev-small-stats"><div><span>Đơn hợp lệ</span><strong>{number(report.summary.validOrders)}<small>đơn</small></strong></div><div><span>Trung bình mỗi đơn</span><strong>{money(report.summary.averageOrder)}</strong></div><div><span>Số phần đã gọi</span><strong>{number(report.summary.unitsSold)}<small>phần</small></strong></div><div><span>Đơn đã hủy</span><strong>{number(report.summary.cancelledOrders)}<small>đơn · {money(report.summary.cancelledAmount)}</small></strong></div></div>
      {report.undatedPaid.count > 0 && <aside className="rev-legacy-notice"><Info size={19}/><div><strong>{number(report.undatedPaid.count)} đơn đã thanh toán chưa có thời điểm thu · {money(report.undatedPaid.total)}</strong><p>Phạm vi: toàn bộ lịch sử {range.table === "all" ? "của tất cả bàn" : "của " + tableLabel}, không giới hạn khoảng ngày đang chọn. Các khoản này không cộng vào “Tiền thu trong kỳ”; vẫn được tính là đã thanh toán khi xem theo ngày tạo đơn.</p></div></aside>}
      <RevenueChart daily={report.daily}/>
      <div className="rev-breakdown-grid"><TopItems report={report}/><PaymentBreakdown report={report}/></div>
      <ByTable report={report}/>
    </>}

    <SettlementHistory from={range.from} to={range.to} table={range.table} refreshKey={refreshKey+tick} onViewOrder={onViewOrder}/>

    <section className="rev-card rev-orders-card" aria-label="Đối soát đơn hàng"><SectionHeading icon={<Eye size={19}/>} title="Đối soát đơn hàng" text={canCollect ? "Xem chi tiết từng đơn và xác nhận khoản thu còn chờ." : "Xem chi tiết từng đơn và đối soát các khoản đã thu, chưa thu."} aside={orderPage ? <span className="rev-count">{number(orderPage.total)} đơn phù hợp</span> : undefined}/><div className="rev-order-filters"><label><span>Ngày áp dụng</span><select value={filters.basis} onChange={event => changeBasis(event.target.value as RevenueOrderBasis)}><option value="created">Ngày tạo đơn</option><option value="paid">Ngày thu tiền</option></select></label><label><span>Trạng thái thanh toán</span><select value={filters.status} onChange={event => changeStatus(event.target.value as RevenueOrderStatus)}><option value="all">Tất cả trạng thái</option><option value="paid">Đã thanh toán</option><option value="unpaid" disabled={filters.basis === "paid"}>Chưa thanh toán</option><option value="cancelled" disabled={filters.basis === "paid"}>Đã hủy</option></select></label><label><span>Phương thức đã thu</span><select value={filters.payment} disabled={filters.status === "unpaid" || filters.status === "cancelled"} onChange={event => setFilters(previous => ({...previous, payment: event.target.value as OrderFilters["payment"], page: 1}))}><option value="all">Tất cả phương thức</option>{(["cash", "bank", "other", "unknown"] as PaymentMethod[]).map(method => <option key={method} value={method}>{paymentLabels[method]}</option>)}</select></label></div><p className="rev-ledger-scope">{filters.basis === "paid" ? "Đang lọc theo ngày xác nhận thu tiền; không gồm đơn chưa biết thời điểm thu." : "Đang lọc theo ngày tạo đơn; trạng thái thanh toán được cập nhật đến hiện tại."}{filters.payment !== "all" ? " Chỉ hiện đơn đã thanh toán bằng phương thức đang chọn." : ""}</p>
      {ordersResource.error ? <LoadError message={ordersResource.error} onRetry={reload}/> : !orderPage ? <div className="rev-ledger-loading" role="status"><RefreshCw size={18} className="rev-spinning"/>Đang tải đơn hàng…</div> : <><div className="rev-ledger-update" aria-live="polite">{ordersResource.loading && <><RefreshCw size={12} className="rev-spinning"/>Đang cập nhật danh sách…</>}</div>{orderPage.orders.length ? <div className="rev-table-scroll rev-ledger-scroll"><table className="rev-order-table"><thead><tr><th scope="col">Đơn / khách</th><th scope="col">Bàn</th><th scope="col">Ngày tạo</th><th scope="col" className="numeric">Giá trị</th><th scope="col">Phục vụ</th><th scope="col">Thanh toán</th><th scope="col" className="rev-actions-heading">Thao tác</th></tr></thead><tbody>{orderPage.orders.map(order => <tr key={order.id}><td data-label="Đơn / khách" className="rev-ledger-order"><strong>#{order.code}</strong><small>{order.customer_name || "Khách tại bàn"}</small></td><td data-label="Bàn"><span className="rev-table-chip">{order.table_name}</span></td><td data-label="Ngày tạo"><time dateTime={new Date(order.created_at).toISOString()}>{displayMoment(order.created_at)}</time></td><td data-label="Giá trị" className="numeric rev-order-amount"><strong>{money(order.total)}</strong></td><td data-label="Phục vụ"><span className={"status-badge " + order.status}>{statuses[order.status]?.label || order.status}</span></td><td data-label="Thanh toán" className="rev-order-payment">{order.status === "cancelled" ? <span className="rev-payment-state cancelled">Không thu tiền</span> : order.paid ? <><span className="rev-payment-state paid">Đã thanh toán</span><small>{paymentLabels[order.payment_method || "unknown"]}</small>{order.paid_at ? <time dateTime={new Date(order.paid_at).toISOString()}>Thu {displayMoment(order.paid_at)}</time> : <small className="rev-date-unknown">Chưa ghi nhận thời điểm thu</small>}</> : <span className="rev-payment-state unpaid">Chưa thanh toán</span>}</td><td data-label="Thao tác" className="rev-order-actions"><button type="button" className="secondary" onClick={() => onViewOrder(order)}><Eye size={14}/>Chi tiết</button>{canCollect && !order.paid && order.status !== "cancelled" && <button type="button" className="primary" onClick={() => onCollect(order)}><Banknote size={14}/>Thu tiền</button>}</td></tr>)}</tbody></table></div> : <EmptyReport text="Không có đơn hàng phù hợp với khoảng ngày, bàn và bộ lọc đang chọn."/>}<div className="rev-pagination"><p>{orderPage.total ? `${number((orderPage.page - 1) * orderPage.pageSize + 1)}–${number(Math.min(orderPage.page * orderPage.pageSize, orderPage.total))} / ${number(orderPage.total)} đơn` : "0 đơn"}<small>{orderPage.pageSize} đơn mỗi trang</small></p><div><button type="button" className="secondary" disabled={ordersResource.loading || orderPage.page <= 1} onClick={() => setFilters(previous => ({...previous, page: Math.max(1, orderPage.page - 1)}))}><ChevronLeft size={15}/><span>Trước</span></button><span>Trang {orderPage.total ? orderPage.page : 1} / {Math.max(1, orderPage.pages)}</span><button type="button" className="secondary" disabled={ordersResource.loading || orderPage.page >= orderPage.pages} onClick={() => setFilters(previous => ({...previous, page: orderPage.page + 1}))}><span>Sau</span><ChevronRight size={15}/></button></div></div></>}
    </section>
    <p className="rev-footer-note"><RefreshCw size={12}/>Tự cập nhật mỗi 30 giây khi mở trang. CSV tổng hợp bao gồm toàn bộ kỳ đang áp dụng, không phụ thuộc trang hoặc bộ lọc trong danh sách đối soát; không bao gồm chi tiết từng phiếu quyết toán bàn.</p>
  </div>;
}

export default RevenuePanel;
