"use client";

import {useEffect, useId, useRef, useState} from "react";
import type {CSSProperties} from "react";
import {ArrowRight, Check, CheckCircle2, LoaderCircle, Palette, Plus, RotateCcw, Save, Type} from "lucide-react";
import {DEFAULT_THEME_SETTINGS, THEME_PRESETS, contrastRatio, isHexColor, isThemeSettings, normalizeThemeSettings, readableForeground} from "@/lib/theme-settings";
import type {ThemeSettings} from "@/lib/theme-settings";
import "./theme-settings-panel.css";

export type ThemeSettingsPanelProps = {
  value: ThemeSettings;
  shopName?: string;
  working?: boolean;
  onSave: (value: ThemeSettings) => Promise<boolean>;
};

type FormState = {saved: ThemeSettings; draft: ThemeSettings; remoteChanged: boolean};
const sameSettings = (a: ThemeSettings, b: ThemeSettings) => a.accentColor.toLowerCase() === b.accentColor.toLowerCase() && a.textColor.toLowerCase() === b.textColor.toLowerCase();

function ColorControl({id, title, description, value, fallback, disabled, onChange}: {
  id: string; title: string; description: string; value: string; fallback: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const valid = isHexColor(value);
  return <fieldset className="tsp-color-control" disabled={disabled}>
    <legend>{title}</legend>
    <p id={`${id}-description`}>{description}</p>
    <div className="tsp-color-inputs">
      <label className="tsp-picker-label" htmlFor={`${id}-picker`}>
        <input id={`${id}-picker`} type="color" value={valid ? value.toLowerCase() : fallback} onChange={event => onChange(event.target.value)} aria-label={`Chọn ${title.toLocaleLowerCase("vi-VN")}`}/>
        <span>Chọn màu</span>
      </label>
      <div className="tsp-hex-field">
        <label htmlFor={`${id}-hex`}>Mã màu</label>
        <input id={`${id}-hex`} type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={7}
          placeholder={fallback} value={value} aria-invalid={!valid} aria-describedby={`${id}-description${valid ? "" : ` ${id}-error`}`}
          onChange={event => onChange(event.target.value)}/>
      </div>
    </div>
    {!valid && <p className="tsp-field-error" id={`${id}-error`}>Nhập dấu # và 6 ký tự từ 0–9, a–f. Ví dụ: {fallback}.</p>}
  </fieldset>;
}

export function ThemeSettingsPanel({value, shopName = "Cửa hàng", working = false, onSave}: ThemeSettingsPanelProps) {
  const id = useId();
  const [form, setForm] = useState<FormState>(() => ({saved: {...value}, draft: {...value}, remoteChanged: false}));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [unconfirmedSave, setUnconfirmedSave] = useState<ThemeSettings | null>(null);
  const lastReceived = useRef({...value});
  const canonicalValue = useRef({...value});
  canonicalValue.current = {...value};
  const mounted = useRef(true);
  const saveLock = useRef(false);
  const dirty = !sameSettings(form.draft, form.saved);
  const valid = isThemeSettings(form.draft);
  const busy = working || saving;
  const preview: ThemeSettings = {
    accentColor: isHexColor(form.draft.accentColor) ? form.draft.accentColor : form.saved.accentColor,
    textColor: isHexColor(form.draft.textColor) ? form.draft.textColor : form.saved.textColor,
  };
  const textContrast = contrastRatio(preview.textColor, "#ffffff");
  const previewStyle = {"--tsp-accent": preview.accentColor, "--tsp-text": preview.textColor, "--tsp-on-accent": readableForeground(preview.accentColor)} as CSSProperties;

  // Polling refreshes the saved baseline while preserving any unsaved choices.
  useEffect(() => {
    if (sameSettings(lastReceived.current, value) && sameSettings(form.saved, value)) return;
    lastReceived.current = {...value};
    setForm(current => {
      const keepDraft = !sameSettings(current.draft, current.saved);
      return {saved: {...value}, draft: keepDraft ? current.draft : {...value}, remoteChanged: keepDraft && !sameSettings(current.draft, value)};
    });
  }, [value.accentColor, value.textColor, form.saved.accentColor, form.saved.textColor]);

  // A write may succeed despite its response timing out. Later canonical data
  // confirms it, without dropping any different edits made in the meantime.
  useEffect(() => {
    if (!unconfirmedSave || !sameSettings(unconfirmedSave, value)) return;
    setUnconfirmedSave(null);
    setError("");
    setNotice("Đã xác nhận màu giao diện đã được lưu.");
    setForm(current => {
      const confirmedDraft = sameSettings(current.draft, unconfirmedSave);
      const keepDraft = !confirmedDraft && !sameSettings(current.draft, current.saved);
      return {saved: {...value}, draft: keepDraft ? current.draft : {...value}, remoteChanged: keepDraft && !sameSettings(current.draft, value)};
    });
  }, [unconfirmedSave, value.accentColor, value.textColor]);

  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false;};
  }, []);

  function change(key: keyof ThemeSettings, next: string) {
    setForm(current => ({...current, draft: {...current.draft, [key]: next}}));
    setUnconfirmedSave(null); setNotice(""); setError("");
  }

  function replaceDraft(next: ThemeSettings) {
    setForm(current => ({...current, draft: {...next}, remoteChanged: false}));
    setUnconfirmedSave(null); setNotice(""); setError("");
  }

  async function save() {
    if (!valid || !dirty || busy || saveLock.current) return;
    const submitted = normalizeThemeSettings(form.draft);
    saveLock.current = true;
    setSaving(true); setError(""); setNotice(""); setUnconfirmedSave(null);

    function confirmSaved() {
      // Parent applies the API-confirmed values before resolving onSave.
      // A newer poll must win over the submitted values after a slow response.
      const canonical = normalizeThemeSettings(canonicalValue.current);
      setForm({saved: canonical, draft: {...canonical}, remoteChanged: false});
      setUnconfirmedSave(null); setError("");
      setNotice(sameSettings(canonical, submitted) ? "Đã lưu màu giao diện và màu chữ cho quán." : "Đã cập nhật màu mới nhất của quán.");
    }

    function handleUnconfirmed(message: string) {
      if (sameSettings(canonicalValue.current, submitted)) confirmSaved();
      else {setUnconfirmedSave(submitted); setError(message);}
    }

    try {
      const saved = await onSave(submitted);
      if (!mounted.current) return;
      if (saved) confirmSaved();
      else handleUnconfirmed("Chưa xác nhận được màu đã lưu. Các thay đổi của anh vẫn được giữ để thử lại.");
    } catch {
      if (mounted.current) handleUnconfirmed("Chưa xác nhận được màu đã lưu. Kiểm tra kết nối rồi thử lại.");
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <section className="theme-settings-panel" aria-labelledby={`${id}-heading`}>
    <header className="tsp-header"><span className="tsp-header-icon"><Palette size={28}/></span><div><span className="tsp-eyebrow">DIỆN MẠO CỦA QUÁN</span><h2 id={`${id}-heading`}>Màu giao diện & màu chữ</h2><p>Chọn sắc màu riêng cho trang gọi món và trang quản trị.</p></div></header>
    <p className="tsp-scope">Màu giao diện áp dụng cho nút chính và các điểm nhấn. Màu chữ áp dụng cho nội dung trên nền sáng. Bấm <strong>Lưu màu sắc</strong> để áp dụng cho quán.</p>
    {form.remoteChanged && dirty && <p className="tsp-remote" role="status">Màu đã được cập nhật ở một màn hình khác. Bản đang chỉnh vẫn được giữ; chọn <strong>Bỏ thay đổi</strong> để dùng màu mới nhất.</p>}
    <div className="tsp-layout">
      <div className="tsp-controls">
        <ColorControl id={`${id}-accent`} title="Màu giao diện" description="Màu của nút gọi món, nút thao tác chính và điểm nhấn." value={form.draft.accentColor} fallback={form.saved.accentColor} disabled={busy} onChange={next => change("accentColor", next)}/>
        <ColorControl id={`${id}-text`} title="Màu chữ" description="Màu chữ chính cho thông tin món, đơn hàng và nội dung." value={form.draft.textColor} fallback={form.saved.textColor} disabled={busy} onChange={next => change("textColor", next)}/>
        <fieldset className="tsp-palette" disabled={busy}><legend>Bảng màu có sẵn</legend><div className="tsp-presets">
          {THEME_PRESETS.map(preset => <button type="button" key={preset.name} aria-pressed={valid && sameSettings(form.draft, preset.settings)} onClick={() => replaceDraft(preset.settings)}>
            <span className="tsp-preset-swatch" style={{background: preset.settings.accentColor, color: readableForeground(preset.settings.accentColor)}} aria-hidden="true">{valid && sameSettings(form.draft, preset.settings) && <Check size={19}/>}</span><span>{preset.name}</span>
          </button>)}
        </div></fieldset>
      </div>
      <aside className="tsp-preview">
        <div className="tsp-preview-heading"><div><span className="tsp-eyebrow">XEM TRƯỚC</span><h3>Màu anh đang chọn</h3></div><span className={`tsp-draft-tag${dirty ? " unsaved" : ""}`}>{dirty ? "Chưa lưu" : "Đang áp dụng"}</span></div>
        <div className="tsp-preview-surface" style={previewStyle}>
          <div className="tsp-preview-top"><span className="tsp-preview-logo">{shopName}</span><span className="tsp-preview-table">Bàn 01</span></div>
          <p className="tsp-preview-kicker">MÓN NGON HÔM NAY</p>
          <h4>Bữa ngon, trọn vị.</h4><p className="tsp-preview-description">Món được chuẩn bị ngay khi anh gọi. Chọn món yêu thích và cùng thưởng thức.</p>
          <div className="tsp-preview-item"><div><strong>Cơm gà đặc biệt</strong><span>Gà mềm, cơm thơm, rau tươi</span></div><strong>65.000 ₫</strong></div>
          <div className="tsp-preview-buttons"><span className="tsp-sample-primary"><Plus size={21}/>Thêm món</span><span className="tsp-sample-secondary">Xem đơn<ArrowRight size={20}/></span></div>
          <div className="tsp-preview-status"><CheckCircle2 size={19}/><span>Các nút bo tròn, nổi bật và dễ chạm.</span></div>
        </div>
        <div className={`tsp-contrast${textContrast < 4.5 ? " needs-attention" : ""}`} role="status"><Type size={20}/><div><strong>{textContrast >= 4.5 ? "Màu chữ dễ đọc trên nền trắng" : "Màu chữ khá nhạt trên nền trắng"}</strong><p>Độ tương phản {textContrast.toFixed(1)}:1.{textContrast < 4.5 ? " Anh có thể chọn màu chữ đậm hơn để đọc dễ hơn." : ""}</p></div></div>
        <p className="tsp-preview-note">Chữ trên nút chính tự chuyển trắng hoặc đen theo màu nền. Màu trạng thái đơn hàng vẫn giúp nhận biết công việc cần xử lý.</p>
      </aside>
    </div>
    <footer className="tsp-footer"><div className="tsp-save-state" aria-live="polite">{error ? <p className="tsp-error" role="alert">{error}</p> : notice ? <p className="tsp-success"><Check size={20}/>{notice}</p> : <p>{dirty ? "Có thay đổi màu chưa lưu." : "Màu hiện tại đã được lưu."}</p>}</div>
      <div className="tsp-actions"><button type="button" className="tsp-secondary" disabled={busy} onClick={() => replaceDraft({...DEFAULT_THEME_SETTINGS})}><RotateCcw size={19}/>Về mặc định</button>
        {dirty && <button type="button" className="tsp-discard" disabled={busy} onClick={() => replaceDraft(form.saved)}>Bỏ thay đổi</button>}
        <button type="button" className="tsp-save" disabled={busy || !dirty || !valid} onClick={() => {void save();}}>{saving ? <LoaderCircle size={21} className="spin"/> : <Save size={21}/>}<span>{saving ? "Đang lưu…" : "Lưu màu sắc"}</span></button>
      </div>
    </footer>
  </section>;
}
