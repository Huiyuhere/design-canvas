/**
 * Wavelength — Today (home). States pinned via query params:
 *   ?state=empty     → empty state
 *   ?overlay=compose → compose sheet forced open
 *   ?toast=sent      → "signal sent" toast visible
 */
import { useState } from "react";
import { navigate } from "wouter/use-browser-location";
import { useFrameSearchParams } from "../canvas/frameEnv";

const INK = "#16161A";
const PAPER = "#F6F5F1";
const TIDE = "#14655A";

const CIRCLES = [
  { id: "inner", name: "Inner circle", members: 4, last: "Maya sent a signal · 2h ago", tone: TIDE },
  { id: "family", name: "Family", members: 5, last: "Quiet since Tuesday", tone: "rgba(22,22,26,0.35)" },
];

export default function Home() {
  const params = useFrameSearchParams();
  const empty = params.get("state") === "empty";
  const [composeOpen, setComposeOpen] = useState(params.get("overlay") === "compose");
  const [toast, setToast] = useState(params.get("toast") === "sent");

  const send = () => {
    setComposeOpen(false);
    setToast(true);
    setTimeout(() => setToast(false), 2600);
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Nunito', sans-serif", color: INK, position: "relative" }}>
      <header style={{ padding: "28px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)", margin: 0 }}>Tuesday, July 22</p>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: "6px 0 0" }}>Today</h1>
        </div>
        <button onClick={() => navigate("/settings")} aria-label="Settings" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "rgba(22,22,26,0.55)" }}>⚙</button>
      </header>

      <main style={{ padding: "24px 24px 120px" }}>
        {empty ? (
          <div style={{ marginTop: 64, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(20,101,90,0.10)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>〰</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 22, marginTop: 20 }}>All quiet today</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(22,22,26,0.5)", maxWidth: 240, margin: "10px auto 0" }}>
              Nobody has sent a signal yet. Be the first to break the silence.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CIRCLES.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/circle/${c.id}`)}
                style={{ textAlign: "left", background: "#FFFFFF", border: "1px solid rgba(22,22,26,0.08)", borderRadius: 18, padding: "18px 20px", cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>{c.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(22,22,26,0.40)" }}>{c.members} PEOPLE</span>
                </div>
                <p style={{ fontSize: 13, color: c.tone, margin: "8px 0 0" }}>{c.last}</p>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Compose CTA */}
      <div style={{ position: "fixed", bottom: 36, left: 24, right: 24 }}>
        <button
          onClick={() => setComposeOpen(true)}
          style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "17px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", fontFamily: "'Nunito', sans-serif", cursor: "pointer", boxShadow: "0 8px 28px rgba(0,0,0,0.18)" }}
        >
          COMPOSE
        </button>
      </div>

      {/* Compose overlay */}
      {composeOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(22,22,26,0.35)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
          <div style={{ width: "100%", background: PAPER, borderRadius: "24px 24px 0 0", padding: "26px 24px 40px" }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Send a signal</h2>
            <p style={{ fontSize: 13, color: "rgba(22,22,26,0.5)", marginTop: 8 }}>One line. Your inner circle sees it tonight.</p>
            <textarea
              placeholder="Thinking of the lake trip…"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", marginTop: 18, padding: "14px 16px", fontSize: 15, fontFamily: "'Nunito', sans-serif", border: "1px solid rgba(22,22,26,0.12)", borderRadius: 12, background: "#FFFFFF", color: INK, outline: "none", resize: "none" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setComposeOpen(false)} style={{ flex: 1, background: "rgba(22,22,26,0.05)", color: INK, border: "none", borderRadius: 100, padding: "15px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}>CANCEL</button>
              <button onClick={send} style={{ flex: 1, background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "15px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}>SEND</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", background: INK, color: "#fff", borderRadius: 100, padding: "10px 22px", fontSize: 13, fontWeight: 700, fontFamily: "'Nunito', sans-serif", zIndex: 60, boxShadow: "0 8px 28px rgba(0,0,0,0.24)" }}>
          Signal sent to your inner circle
        </div>
      )}
    </div>
  );
}
