/**
 * Wavelength — Settings. Delete-account confirm overlay pinned via ?overlay=delete.
 */
import { useState } from "react";
import { navigate } from "wouter/use-browser-location";
import { useFrameSearchParams } from "../canvas/frameEnv";

const INK = "#16161A";
const PAPER = "#F6F5F1";

export default function Settings() {
  const params = useFrameSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(params.get("overlay") === "delete");

  const rows = [
    { label: "Nudge frequency", value: "Once a day" },
    { label: "Quiet hours", value: "22:00 – 08:00" },
    { label: "Circle invites", value: "2 pending" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Nunito', sans-serif", color: INK, position: "relative" }}>
      <header style={{ padding: "28px 24px 0" }}>
        <button onClick={() => navigate("/home")} style={{ background: "none", border: "none", fontSize: 13, color: "rgba(22,22,26,0.45)", cursor: "pointer", padding: 0 }}>← Today</button>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: "14px 0 0" }}>Settings</h1>
      </header>

      <main style={{ padding: "22px 24px 60px" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid rgba(22,22,26,0.08)", borderRadius: 18, overflow: "hidden" }}>
          {rows.map((r, i) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderTop: i > 0 ? "1px solid rgba(22,22,26,0.06)" : "none" }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{r.label}</span>
              <span style={{ fontSize: 13, color: "rgba(22,22,26,0.5)" }}>{r.value}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => navigate("/")} style={{ width: "100%", background: "rgba(22,22,26,0.05)", color: INK, border: "none", borderRadius: 100, padding: "15px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}>
            Sign out
          </button>
          <button onClick={() => setConfirmOpen(true)} style={{ width: "100%", background: "none", color: "rgba(22,22,26,0.45)", border: "none", padding: "8px 0", fontSize: 12.5, fontFamily: "'Nunito', sans-serif", cursor: "pointer", textDecoration: "underline" }}>
            Delete account
          </button>
        </div>
      </main>

      {confirmOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(22,22,26,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div style={{ width: "100%", background: PAPER, borderRadius: 20, padding: "26px 24px" }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 22, margin: 0 }}>Delete your account?</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(22,22,26,0.55)", marginTop: 10 }}>
              Your circles keep their history, but your signals are removed within 30 days. This cannot be undone.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <button onClick={() => setConfirmOpen(false)} style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "15px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}>
                KEEP MY ACCOUNT
              </button>
              <button onClick={() => setConfirmOpen(false)} style={{ width: "100%", background: "none", color: "rgba(22,22,26,0.45)", border: "none", padding: "6px 0", fontSize: 12.5, fontFamily: "'Nunito', sans-serif", cursor: "pointer", textDecoration: "underline" }}>
                Delete anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
