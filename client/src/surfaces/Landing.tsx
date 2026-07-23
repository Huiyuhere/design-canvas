/**
 * Wavelength — Landing. Demo surface for the Design Canvas.
 * Fictional product: a quiet social app for staying close to your inner circle.
 */
import { navigate } from "wouter/use-browser-location";

const INK = "#16161A";
const PAPER = "#F6F5F1";
const TIDE = "#14655A";

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", background: PAPER, display: "flex", flexDirection: "column", fontFamily: "'Nunito', sans-serif", color: INK }}>
      <header style={{ padding: "28px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Wavelength</span>
        <button
          onClick={() => navigate("/auth?mode=signin")}
          style={{ background: "none", border: "none", fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", color: INK, cursor: "pointer" }}
        >
          SIGN IN
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)", marginBottom: 18 }}>
          For your five closest people
        </p>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(40px, 9vw, 64px)", lineHeight: 1.06, letterSpacing: "-0.02em", margin: 0 }}>
          Stay on the same <em style={{ color: TIDE }}>wavelength</em>.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(22,22,26,0.55)", marginTop: 22, maxWidth: 300 }}>
          One small signal a day to the people who matter. No feed, no likes, no noise.
        </p>
      </main>

      <footer style={{ padding: "0 28px 44px" }}>
        <button
          onClick={() => navigate("/auth?mode=signup")}
          style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "17px 0", fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", cursor: "pointer" }}
        >
          GET STARTED
        </button>
        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(22,22,26,0.45)", marginTop: 14 }}>
          Free for circles of five or fewer.
        </p>
      </footer>
    </div>
  );
}
