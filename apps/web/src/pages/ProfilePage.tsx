import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { TwoFactorPanel } from "../components/TwoFactorPanel";

export function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileErr("");
    setProfileMsg("");
    try {
      await api.patch("/auth/profile", { firstName, lastName });
      await refreshMe();
      setProfileMsg("Profile updated.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Could not update profile";
      setProfileErr(typeof msg === "string" ? msg : "Could not update profile");
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    if (newPassword !== confirmPassword) {
      setPwErr("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwErr("New password must be at least 8 characters.");
      return;
    }
    setPwBusy(true);
    try {
      await api.post("/auth/profile/password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg("Password changed.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Could not change password";
      setPwErr(typeof msg === "string" ? msg : "Could not change password");
    } finally {
      setPwBusy(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="topbar">
        <h1>Profile</h1>
      </div>
      <p className="muted">
        Update your name and password, and manage two-factor authentication (OTP) for this
        account.
      </p>

      <div className="grid cols-2" style={{ marginBottom: "1.25rem" }}>
        <form className="card stack" onSubmit={saveProfile}>
          <h2>Account</h2>
          {profileErr && <div className="error">{profileErr}</div>}
          {profileMsg && <p className="muted">{profileMsg}</p>}
          <div className="field">
            <label>Email</label>
            <input value={user.email} readOnly className="mono" />
          </div>
          <div className="field">
            <label>Tenant</label>
            <input value={`${user.tenantName} (${user.tenantSlug})`} readOnly />
          </div>
          <div className="field">
            <label>Role</label>
            <input value={user.role} readOnly className="mono" />
          </div>
          <div className="field">
            <label>First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <button className="btn primary" type="submit" disabled={profileBusy}>
            {profileBusy ? "Saving…" : "Save profile"}
          </button>
        </form>

        <form className="card stack" onSubmit={changePassword}>
          <h2>Change password</h2>
          {pwErr && <div className="error">{pwErr}</div>}
          {pwMsg && <p className="muted">{pwMsg}</p>}
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <button className="btn primary" type="submit" disabled={pwBusy}>
            {pwBusy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>

      <div style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ margin: "0 0 0.35rem" }}>Two-factor authentication</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Set up or update OTP here. Demo accounts start with OTP off.
        </p>
      </div>
      <TwoFactorPanel />
    </>
  );
}
