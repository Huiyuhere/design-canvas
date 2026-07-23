/**
 * Wavelength — Circle Detail. Shows the last few signals inside one circle.
 */
import { navigate } from "wouter/use-browser-location";

const INK = "#16161A";
const PAPER = "#F6F5F1";
const TIDE = "#14655A";

const SIGNALS = [
  { who: "Maya", when: "2h ago", text: "Thinking of the lake trip. Same weekend as last year?" },
  { who: "Jonas", when: "Yesterday", text: "Passed the bakery we used to go to. It still smells the same." },
  { who: "You", when: "3 days ago", text: "Quiet week here. Missing you all." },
];

export default function CircleDetail() {
  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Nunito', sans-serif", color: INK }}>
      <header style={{ padding: "28px 24px 0" }}>
        <button onClick={() => navigate("/home")} style={{ background: "none", border: "none", fontSize: 13, color: "rgba(22,22,26,0.45)", cursor: "pointer", padding: 0 }}>← Today</button>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: "14px 0 0" }}>Inner circle</h1>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)", marginTop: 8 }}>4 people · 3 signals this week</p>
      </header>

      <main style={{ padding: "22px 24px 140px", display: "flex", flexDirection: "column", gap: 12 }}>
        {SIGNALS.map((s, i) => (
          <article key={i} style={{ background: "#FFFFFF", border: "1px solid rgba(22,22,26,0.08)", borderRadius: 18, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: s.who === "You" ? TIDE : INK }}>{s.who}</span>
              <span style={{ fontSize: 11, color: "rgba(22,22,26,0.40)" }}>{s.when}</span>
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: "8px 0 0", color: "rgba(22,22,26,0.8)" }}>{s.text}</p>
          </article>
        ))}
      </main>

      <div style={{ position: "fixed", bottom: 36, left: 24, right: 24 }}>
        <button
          onClick={() => navigate("/home?overlay=compose")}
          style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "17px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", fontFamily: "'Nunito', sans-serif", cursor: "pointer", boxShadow: "0 8px 28px rgba(0,0,0,0.18)" }}
        >
          SEND A SIGNAL
        </button>
      </div>
    </div>
  );
}
