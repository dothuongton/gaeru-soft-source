"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, CircleAlert, CheckCircle2, KeyRound, LoaderCircle, LogIn, QrCode } from "lucide-react";
import { api } from "@/lib/api-client";
import "./signin.css";

function safeReturnUrl(url: string | null): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) {
    return "/?view=admin";
  }
  return url;
}

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [returnTo, setReturnTo] = useState("/?view=admin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = safeReturnUrl(params.get("returnTo") || params.get("return_to"));
    setReturnTo(target);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await api<{ access: unknown; mustChangePassword?: boolean }>("auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.mustChangePassword) {
        setMustChange(true);
        setSuccess("Đăng nhập thành công. Vui lòng đặt mật khẩu mới trước khi tiếp tục.");
      } else {
        setSuccess("Đăng nhập thành công! Đang chuyển hướng…");
        window.location.href = returnTo;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (newPassword.length < 12) {
      setError("Mật khẩu mới phải có tối thiểu 12 ký tự.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      await api<{ ok: boolean }>("auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      setSuccess("Đổi mật khẩu thành công! Đang chuyển hướng…");
      setTimeout(() => {
        window.location.href = returnTo;
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đổi mật khẩu thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signin-container">
      <div className="signin-card">
        <div className="signin-header">
          <div className="signin-logo">
            <QrCode size={28} />
          </div>
          <h1 className="signin-title">GAERU Soft</h1>
          <p className="signin-subtitle">
            {mustChange ? "Đặt lại mật khẩu mới" : "Đăng nhập quản trị cửa hàng & nền tảng"}
          </p>
        </div>

        {error && (
          <div className="signin-error" role="alert">
            <CircleAlert size={20} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="signin-success" role="status">
            <CheckCircle2 size={20} />
            <span>{success}</span>
          </div>
        )}

        {!mustChange ? (
          <form className="signin-form" onSubmit={handleLogin}>
            <div className="signin-field">
              <label htmlFor="signin-email">Email tài khoản</label>
              <input
                id="signin-email"
                type="email"
                required
                autoComplete="email"
                placeholder="traichuoiprovjp@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="signin-field">
              <label htmlFor="signin-password">Mật khẩu</label>
              <input
                id="signin-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <small>Tối thiểu 12 ký tự</small>
            </div>

            <button type="submit" className="signin-btn" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
              <span>{loading ? "Đang xác thực…" : "Đăng nhập"}</span>
            </button>
          </form>
        ) : (
          <form className="signin-form" onSubmit={handleChangePassword}>
            <div className="signin-field">
              <label htmlFor="new-password">Mật khẩu mới</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Tối thiểu 12 ký tự"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="signin-field">
              <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="signin-btn" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
              <span>{loading ? "Đang lưu…" : "Cập nhật mật khẩu"}</span>
            </button>
          </form>
        )}

        <div className="signin-footer">
          <a href="/activate">Kích hoạt tài khoản nhân viên / Đặt lại mật khẩu</a>
          <a href="/">← Quay lại trang chủ quán</a>
        </div>
      </div>
    </div>
  );
}
