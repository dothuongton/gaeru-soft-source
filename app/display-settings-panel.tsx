"use client";

import {useEffect, useId, useRef, useState} from "react";
import type {CSSProperties, ReactNode} from "react";
import {BellRing, Check, Clock3, Image as ImageIcon, LoaderCircle, Play, RotateCcw, Save, SlidersHorizontal, Type, X} from "lucide-react";
import {money, sampleMenu} from "@/lib/menu";
import type {MenuItem} from "@/lib/menu";
import {DEFAULT_DISPLAY_SETTINGS, DISPLAY_PERCENT_MAX, DISPLAY_PERCENT_MIN, POPUP_SECONDS_MAX, POPUP_SECONDS_MIN, displayScale, isDisplaySettings, popupDurationMs} from "@/lib/display-settings";
import type {DisplaySettings} from "@/lib/display-settings";
import "./display-settings-panel.css";

export type DisplaySettingsPanelProps = {
  value: DisplaySettings;
  working?: boolean;
  onSave: (value: DisplaySettings) => Promise<boolean>;
  previewItem?: MenuItem;
};

type Draft = {[Key in keyof DisplaySettings]: string};
type FormState = {saved: DisplaySettings; draft: Draft; remoteChanged: boolean};
const percentPresets = [100, 150, 200, 250];
const toDraft = (value: DisplaySettings): Draft => ({popupSeconds: String(value.popupSeconds), fontPercent: String(value.fontPercent), foodImagePercent: String(value.foodImagePercent)});
const sameSettings = (a: DisplaySettings, b: DisplaySettings) => a.popupSeconds === b.popupSeconds && a.fontPercent === b.fontPercent && a.foodImagePercent === b.foodImagePercent;
const sameDraft = (draft: Draft, value: DisplaySettings) => draft.popupSeconds === String(value.popupSeconds) && draft.fontPercent === String(value.fontPercent) && draft.foodImagePercent === String(value.foodImagePercent);
const numericValue = (value: string) => value.trim() ? Number(value) : NaN;
const validNumber = (value: string, min: number, max: number) => Number.isInteger(numericValue(value)) && numericValue(value) >= min && numericValue(value) <= max;

function parseDraft(draft: Draft): DisplaySettings | null {
  const candidate = {popupSeconds: numericValue(draft.popupSeconds), fontPercent: numericValue(draft.fontPercent), foodImagePercent: numericValue(draft.foodImagePercent)};
  return isDisplaySettings(candidate) ? candidate : null;
}

type SettingControlProps = {
  id: string;
  title: string;
  icon: ReactNode;
  description: string;
  value: string;
  min: number;
  max: number;
  unit: string;
  presets: number[];
  step?: number;
  disabled: boolean;
  onChange: (value: string) => void;
};

function SettingControl({id, title, icon, description, value, min, max, unit, presets, step = 1, disabled, onChange}: SettingControlProps) {
  const valid = validNumber(value, min, max);
  const number = numericValue(value);
  const rangeValue = Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
  return <fieldset className="dsp-control" disabled={disabled}>
    <legend id={`${id}-label`}>{icon}<span>{title}</span></legend>
    <p className="dsp-control-description" id={`${id}-description`}>{description}</p>
    <div className="dsp-value-row">
      <label htmlFor={`${id}-number`}>Giá trị</label>
      <div className={`dsp-number${valid ? "" : " invalid"}`}>
        <input id={`${id}-number`} type="number" inputMode="numeric" min={min} max={max} step="1" value={value}
          aria-label={`${title} (${unit})`} aria-invalid={!valid} aria-describedby={`${id}-description${valid ? "" : ` ${id}-error`}`}
          onChange={event => onChange(event.target.value)}/>
        <span aria-hidden="true">{unit}</span>
      </div>
    </div>
    <input className="dsp-range" type="range" min={min} max={max} step={step} value={rangeValue}
      aria-labelledby={`${id}-label`} aria-valuetext={`${rangeValue} ${unit}`} onChange={event => onChange(event.target.value)}/>
    <div className="dsp-range-ends" aria-hidden="true"><span>{min}{unit === "%" ? "%" : ` ${unit}`}</span><span>{max}{unit === "%" ? "%" : ` ${unit}`}</span></div>
    <div className="dsp-presets" role="group" aria-label={`Chọn nhanh ${title.toLocaleLowerCase("vi-VN")}`}>
      {presets.map(preset => <button key={preset} type="button" aria-pressed={valid && number === preset} onClick={() => onChange(String(preset))}>{preset}{unit === "%" ? "%" : ` ${unit}`}</button>)}
    </div>
    {!valid && <p className="dsp-field-error" id={`${id}-error`}>Nhập số nguyên từ {min} đến {max} {unit}.</p>}
  </fieldset>;
}

export function DisplaySettingsPanel({value, working = false, onSave, previewItem}: DisplaySettingsPanelProps) {
  const id = useId();
  const [form, setForm] = useState<FormState>(() => ({saved: {...value}, draft: toDraft(value), remoteChanged: false}));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [unconfirmedSave, setUnconfirmedSave] = useState<DisplaySettings | null>(null);
  const [testPopup, setTestPopup] = useState<{id: number; seconds: number} | null>(null);
  const lastReceived = useRef({...value});
  const canonicalValue = useRef({...value});
  canonicalValue.current = {...value};
  const mounted = useRef(true);
  const saveLock = useRef(false);
  const popupSequence = useRef(0);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = parseDraft(form.draft);
  const dirty = !sameDraft(form.draft, form.saved);
  const busy = working || saving;
  const item = previewItem ?? sampleMenu[0];
  const previewSettings: DisplaySettings = {
    popupSeconds: validNumber(form.draft.popupSeconds, POPUP_SECONDS_MIN, POPUP_SECONDS_MAX) ? Number(form.draft.popupSeconds) : form.saved.popupSeconds,
    fontPercent: validNumber(form.draft.fontPercent, DISPLAY_PERCENT_MIN, DISPLAY_PERCENT_MAX) ? Number(form.draft.fontPercent) : form.saved.fontPercent,
    foodImagePercent: validNumber(form.draft.foodImagePercent, DISPLAY_PERCENT_MIN, DISPLAY_PERCENT_MAX) ? Number(form.draft.foodImagePercent) : form.saved.foodImagePercent,
  };
  const previewStyle = {"--moc-font-scale": displayScale(previewSettings.fontPercent), "--moc-food-image-scale": displayScale(previewSettings.foodImagePercent)} as CSSProperties;

  // Polling may replace props while an administrator is editing. Adopt fresh
  // server values only when the local draft is clean; otherwise retain it.
  useEffect(() => {
    if (sameSettings(lastReceived.current, value) && sameSettings(form.saved, value)) return;
    lastReceived.current = {...value};
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = null;
    setTestPopup(null);
    setForm(current => {
      const keepDraft = !sameDraft(current.draft, current.saved);
      return {saved: {...value}, draft: keepDraft ? current.draft : toDraft(value), remoteChanged: keepDraft && !sameDraft(current.draft, value)};
    });
  }, [value.popupSeconds, value.fontPercent, value.foodImagePercent, form.saved.popupSeconds, form.saved.fontPercent, form.saved.foodImagePercent]);

  // A timed-out response can still have saved successfully. Later polling is
  // authoritative and should remove the stale failure without another write.
  useEffect(() => {
    if (!unconfirmedSave || !sameSettings(unconfirmedSave, value)) return;
    setUnconfirmedSave(null);
    setError("");
    setNotice("Đã xác nhận thiết lập hiển thị đã được lưu.");
    setForm(current => {
      const currentValue = parseDraft(current.draft);
      const confirmedDraft = currentValue !== null && sameSettings(currentValue, unconfirmedSave);
      const keepDraft = !confirmedDraft && !sameDraft(current.draft, current.saved);
      return {saved: {...value}, draft: keepDraft ? current.draft : toDraft(value), remoteChanged: keepDraft && !sameDraft(current.draft, value)};
    });
  }, [unconfirmedSave, value.popupSeconds, value.fontPercent, value.foodImagePercent]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (popupTimer.current) clearTimeout(popupTimer.current);
      popupTimer.current = null;
    };
  }, []);

  function stopPopup() {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = null;
    setTestPopup(null);
  }

  function change(key: keyof DisplaySettings, next: string) {
    stopPopup();
    setForm(current => ({...current, draft: {...current.draft, [key]: next}}));
    setUnconfirmedSave(null);
    setNotice("");
    setError("");
  }

  function replaceDraft(next: DisplaySettings) {
    stopPopup();
    setForm(current => ({...current, draft: toDraft(next), remoteChanged: false}));
    setUnconfirmedSave(null);
    setNotice("");
    setError("");
  }

  function showTestPopup() {
    if (!parsed || busy) return;
    stopPopup();
    const sequence = ++popupSequence.current;
    const seconds = parsed.popupSeconds;
    setTestPopup({id: sequence, seconds});
    popupTimer.current = setTimeout(() => {
      popupTimer.current = null;
      if (mounted.current) setTestPopup(current => current?.id === sequence ? null : current);
    }, popupDurationMs(seconds));
  }

  async function save() {
    if (!parsed || !dirty || busy || saveLock.current) return;
    const submitted = {...parsed};
    saveLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    setUnconfirmedSave(null);
    stopPopup();

    function confirmSaved() {
      // onSave applies the API-confirmed settings to the parent before it
      // resolves. A subsequent poll may already hold a newer configuration.
      const canonical = {...canonicalValue.current};
      setForm({saved: canonical, draft: toDraft(canonical), remoteChanged: false});
      setUnconfirmedSave(null);
      setError("");
      setNotice(sameSettings(canonical, submitted) ? "Đã lưu thiết lập hiển thị cho quán." : "Đã cập nhật thiết lập hiển thị mới nhất của quán.");
    }

    function handleUnconfirmed(message: string) {
      if (sameSettings(canonicalValue.current, submitted)) confirmSaved();
      else {
        setUnconfirmedSave(submitted);
        setError(message);
      }
    }

    try {
      const saved = await onSave(submitted);
      if (!mounted.current) return;
      if (saved) confirmSaved();
      else handleUnconfirmed("Chưa xác nhận được thiết lập đã lưu. Các thay đổi của anh vẫn được giữ để thử lại.");
    } catch {
      if (mounted.current) handleUnconfirmed("Chưa xác nhận được thiết lập đã lưu. Kiểm tra kết nối rồi thử lại.");
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <section className="display-settings-panel" aria-labelledby={`${id}-heading`}>
    <header className="dsp-header">
      <span className="dsp-header-icon"><SlidersHorizontal size={28}/></span>
      <div><span className="dsp-eyebrow">THIẾT LẬP HIỂN THỊ</span><h2 id={`${id}-heading`}>Chữ, ảnh và thông báo</h2><p>Chọn kích thước dễ nhìn và thời gian đọc thông báo phù hợp với quán.</p></div>
    </header>
    <p className="dsp-scope">Mặc định chữ và ảnh ở mức lớn 200%, thông báo hiện 3 giây. Kích thước tự thích ứng với màn hình để chữ dễ đọc và nút dễ chạm. Bấm <strong>Lưu thiết lập</strong> để áp dụng cho quán.</p>
    {form.remoteChanged && dirty && <p className="dsp-remote" role="status">Thiết lập đã được cập nhật ở một màn hình khác. Bản đang chỉnh vẫn được giữ; chọn <strong>Bỏ thay đổi</strong> để dùng thiết lập mới nhất.</p>}
    <div className="dsp-layout">
      <div className="dsp-controls">
        <SettingControl id={`${id}-popup`} title="Thời gian hiển thị thông báo" icon={<Clock3 size={23}/>} description="Thời gian mỗi thông báo gọi món nổi trên màn hình quản trị."
          value={form.draft.popupSeconds} min={POPUP_SECONDS_MIN} max={POPUP_SECONDS_MAX} unit="giây" presets={[3, 5, 10, 15]} disabled={busy} onChange={next => change("popupSeconds", next)}/>
        <SettingControl id={`${id}-font`} title="Kích thước chữ" icon={<Type size={23}/>} description="Áp dụng cho trang khách gọi món và trang quản trị."
          value={form.draft.fontPercent} min={DISPLAY_PERCENT_MIN} max={DISPLAY_PERCENT_MAX} unit="%" presets={percentPresets} step={5} disabled={busy} onChange={next => change("fontPercent", next)}/>
        <SettingControl id={`${id}-image`} title="Kích thước ảnh món" icon={<ImageIcon size={23}/>} description="Điều chỉnh ảnh món trong thực đơn, giỏ hàng và chi tiết món."
          value={form.draft.foodImagePercent} min={DISPLAY_PERCENT_MIN} max={DISPLAY_PERCENT_MAX} unit="%" presets={percentPresets} step={5} disabled={busy} onChange={next => change("foodImagePercent", next)}/>
      </div>
      <aside className="dsp-preview">
        <div className="dsp-preview-heading"><div><span className="dsp-eyebrow">XEM TRƯỚC</span><h3>Thử ngay tại đây</h3></div><span className={`dsp-draft-tag${dirty ? " unsaved" : ""}`}>{dirty ? "Chưa lưu" : "Đang áp dụng"}</span></div>
        <p className="dsp-preview-note">Ảnh tự vừa chiều rộng màn hình. Các thay đổi đang xem chỉ được áp dụng sau khi lưu.</p>
        <div className="dsp-preview-surface" style={previewStyle}>
          <article className="dsp-food-preview">
            <div className="dsp-food-image"><img src={item.image} alt={item.name} loading="lazy"/></div>
            <div className="dsp-food-copy"><span className="dsp-food-label">{item.badge || "Món ngon của quán"}</span><h4>{item.name}</h4><p>{item.description}</p><strong>{money(item.price)}</strong></div>
          </article>
          <div className="dsp-popup-stage">
            {testPopup ? <div className="dsp-popup" key={testPopup.id} role="status" aria-live="polite" aria-atomic="true">
              <BellRing className="dsp-popup-icon" size={24}/><div><span>THÔNG BÁO MẪU</span><strong>Bàn 01 có đơn</strong><p>Tự ẩn sau {testPopup.seconds} giây</p></div>
              <button type="button" aria-label="Đóng thông báo mẫu" onClick={stopPopup}><X size={20}/></button>
              <span className="dsp-popup-progress" style={{animationDuration: `${popupDurationMs(testPopup.seconds)}ms`}} aria-hidden="true"/>
            </div> : <div className="dsp-popup-placeholder"><BellRing size={24}/><p>Thông báo mẫu sẽ xuất hiện ở đây.</p></div>}
          </div>
        </div>
        <button type="button" className="dsp-test" disabled={busy || !parsed} onClick={showTestPopup}><Play size={20}/>{testPopup ? "Thử lại thông báo" : "Thử thông báo"}<span>{previewSettings.popupSeconds} giây</span></button>
        <p className="dsp-test-note">Bản thử không tạo đơn hàng và không phát âm thanh.</p>
      </aside>
    </div>
    <footer className="dsp-footer">
      <div className="dsp-save-state" aria-live="polite">{error ? <p className="dsp-error" role="alert">{error}</p> : notice ? <p className="dsp-success"><Check size={20}/>{notice}</p> : <p>{dirty ? "Có thay đổi chưa lưu." : "Thiết lập hiện tại đã được lưu."}</p>}</div>
      <div className="dsp-actions"><button type="button" className="dsp-secondary" disabled={busy} onClick={() => replaceDraft({...DEFAULT_DISPLAY_SETTINGS})}><RotateCcw size={19}/>Về mặc định</button>
        {dirty && <button type="button" className="dsp-discard" disabled={busy} onClick={() => replaceDraft(form.saved)}>Bỏ thay đổi</button>}
        <button type="button" className="dsp-save" disabled={busy || !dirty || !parsed} onClick={() => {void save();}}>{saving ? <LoaderCircle size={21} className="spin"/> : <Save size={21}/>}<span>{saving ? "Đang lưu…" : "Lưu thiết lập"}</span></button>
      </div>
    </footer>
  </section>;
}
