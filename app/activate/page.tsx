"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CircleAlert, CheckCircle2, KeyRound, LoaderCircle, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import "./activate.css";

export default function ActivatePage() {
  const [token, setToken] = useState<string | null>(null);
  const [canBootstrap, setCanBootstrap] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Token activation fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Bootstrap fields
  const [setupToken, setSetupToken] = useState("gaeru_sec_8f3a9b2e7c1d4a6e8b0d5f2a7e4c1b9d");
  const [ownerEmail, setOwnerEmail] = useState("dothuongton@gmail.com");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawToken = params.get("token");

    if (rawToken) {
      setToken(rawToken);
      setChecking(false);
    } else {
      // Check if bootstrap is available
      api<{ canBootstrap: boolean }>("auth/bootstrap-status")
        .then((res) => {
          setCanBootstrap(res.canBootstrap);
        })
        .catch(() => {
          setCanBootstrap(false);
        })
        .finally(() => {
          setChecking(false);
        });
    }
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !token) return;
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (password.length < 12) {
      setError("Mật khẩu phải có tối thiểu 12 ký tự.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      await api<{ ok: boolean }>("auth/set-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
          displayName: displayName.trim(),
        }),
      });
      setSuccess("Kích hoạt tài khoản thành công! Đang chuyển hướng vào ứng dụng…");
      setTimeout(() => {
        window.location.href = "/?view=admin";
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kích hoạt tài khoản thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (password.length < 12) {
      setError("Mật khẩu phải có tối thiểu 12 ký tự.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      await api<{ ok: boolean }>("auth/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          setupToken: setupToken.trim(),
          email: ownerEmail.trim(),
          displayName: displayName.trim(),
          password,
        }),
      });
      setSuccess("Khởi tạo hệ thống thành công! Đang chuyển hướng vào trang quản trị…");
      setTimeout(() => {
        window.location.href = "/gaeru";
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khởi tạo hệ thống thất bại.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="activate-container">
        <div className="activate-card" style={{ textAlign: "center" }}>
          <LoaderCircle className="spin" size={32} style={{ margin: "2rem auto", color: "#38bdf8" }} />
          <p>Đang kiểm tra trạng thái kích hoạt…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="activate-container">
      <div className="activate-card">
        <div className="activate-header">
          <div className="activate-logo">
            {token ? <UserCheck size={28} /> : canBootstrap ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
          </div>
          <h1 className="activate-title">
            {token
              ? "Kích hoạt tài khoản"
              : canBootstrap
              ? "Khởi tạo quản trị viên"
              : "Kích hoạt tài khoản GAERU"}
          </h1>
          <p className="activate-subtitle">
            {token
              ? "Thiết lập mật khẩu đăng nhập để kích hoạt tài khoản của bạn."
              : canBootstrap
              ? "Hệ thống chưa có tài khoản quản trị. Vui lòng nhập thông tin bootstrap ban đầu."
              : "Liên kết kích hoạt cần có mã token được cấp bởi quản trị viên."}
          </p>
        </div>

        {error && (
          <div className="activate-error" role="alert">
            <CircleAlert size={20} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="activate-success" role="status">
            <CheckCircle2 size={20} />
            <span>{success}</span>
          </div>
        )}

        {token ? (
          <form className="activate-form" onSubmit={handleSetPassword}>
            <div className="activate-field">
              <label htmlFor="display-name">Tên hiển thị (tuỳ chọn)</label>
              <input
                id="display-name"
                type="text"
                autoComplete="name"
                placeholder="Ví dụ: Nguyễn Văn A"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="activate-field">
              <label htmlFor="new-password">Mật khẩu mới</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Tối thiểu 12 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <small>Mật khẩu an toàn từ 12 đến 128 ký tự</small>
            </div>

            <div className="activate-field">
              <label htmlFor="confirm-pwd">Xác nhận mật khẩu</label>
              <input
                id="confirm-pwd"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="activate-btn" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
              <span>{loading ? "Đang xử lý…" : "Đặt mật khẩu & Kích hoạt"}</span>
            </button>
          </form>
        ) : canBootstrap ? (
          <form className="activate-form" onSubmit={handleBootstrap}>
            <div className="activate-field">
              <label htmlFor="setup-token">Mã bí mật khởi tạo (SETUP_TOKEN)</label>
              <input
                id="setup-token"
                type="password"
                required
                autoComplete="off"
                placeholder="Nhập secret SETUP_TOKEN đã cấu hình"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                disabled={loading}
              />
              <small>Mã bí mật được cấu hình trên Cloudflare Workers</small>
            </div>

            <div className="activate-field">
              <label htmlFor="owner-email">Email chủ platform</label>
              <input
                id="owner-email"
                type="email"
                required
                autoComplete="email"
                placeholder="dothuongton@gmail.com"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                disabled={loading}
              />
              <small>Email phải nằm trong danh sách STAFF_EMAILS</small>
            </div>

            <div className="activate-field">
              <label htmlFor="bootstrap-name">Họ tên hiển thị</label>
              <input
                id="bootstrap-name"
                type="text"
                autoComplete="name"
                placeholder="Chủ sở hữu / Quản trị viên"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="activate-field">
              <label htmlFor="bootstrap-password">Mật khẩu mới</label>
              <input
                id="bootstrap-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Tối thiểu 12 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="activate-field">
              <label htmlFor="bootstrap-confirm">Xác nhận mật khẩu</label>
              <input
                id="bootstrap-confirm"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="activate-btn" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
              <span>{loading ? "Đang khởi tạo…" : "Khởi tạo quản trị viên & Đăng nhập"}</span>
            </button>
          </form>
        ) : (
          <div className="activate-notice-box">
            <p>
              <strong>Cần liên kết kích hoạt hợp lệ</strong>
            </p>
            <p>
              Để kích hoạt tài khoản hoặc đặt lại mật khẩu, vui lòng liên hệ quản trị viên cửa hàng để nhận liên kết kích hoạt có chứa mã token an toàn.
            </p>
            <p>
              Nếu anh/chị đã có tài khoản và mật khẩu, vui lòng vào trang đăng nhập bên dưới.
            </p>
          </div>
        )}

        <div className="activate-footer">
          <a href="/signin">Đã có tài khoản? Đăng nhập tại đây</a>
          <a href="/">← Quay lại trang chủ quán</a>
        </div>
      </div>
    </div>
  );
}
