/**
 * Wavelength — Not Found (in-app 404 surface).
 */
import { navigate } from "wouter/use-browser-location";

const INK = "#16161A";
const PAPER = "#F6F5F1";

export default function AppNotFound() {
  return (
    <div style={{ minHeight: "100vh", background: PAPER, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px", fontFamily: "'Nunito', sans-serif", color: INK }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)" }}>Error 404</p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: "14px 0 0" }}>
        This page drifted out of range.
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(22,22,26,0.55)", marginTop: 14, maxWidth: 280 }}>
        The link you followed does not exist, or it moved somewhere quieter.
      </p>
      <button
        onClick={() => navigate("/home")}
        style={{ marginTop: 30, alignSelf: "flex-start", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "15px 30px", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}
      >
        TAKE ME HOME
      </button>
    </div>
  );
}

