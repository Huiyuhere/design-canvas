/**
 * Wavelength — Auth (signup / signin). State pinned via ?mode= query param.
 */
import { navigate } from "wouter/use-browser-location";
import { useFrameSearchParams } from "../canvas/frameEnv";

const INK = "#16161A";
const PAPER = "#F6F5F1";

export default function Auth() {
  const params = useFrameSearchParams();
  const mode = params.get("mode") === "signin" ? "signin" : "signup";
  const signup = mode === "signup";

  return (
    <div style={{ minHeight: "100vh", background: PAPER, display: "flex", flexDirection: "column", fontFamily: "'Nunito', sans-serif", color: INK }}>
      <header style={{ padding: "28px 28px 0" }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", fontSize: 13, color: "rgba(22,22,26,0.45)", cursor: "pointer", padding: 0 }}>
          ← Back
        </button>
      </header>

      <main style={{ flex: 1, padding: "48px 28px 0" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: 0 }}>
          {signup ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(22,22,26,0.55)", marginTop: 10 }}>
          {signup ? "Your circle is waiting to hear from you." : "Your circle kept the light on."}
        </p>

        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)" }}>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "15px 16px", fontSize: 15, fontFamily: "'Nunito', sans-serif", border: "1px solid rgba(22,22,26,0.12)", borderRadius: 12, background: "#FFFFFF", color: INK, outline: "none" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)" }}>Password</span>
            <input
              type="password"
              placeholder={signup ? "At least 8 characters" : "Your password"}
              style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "15px 16px", fontSize: 15, fontFamily: "'Nunito', sans-serif", border: "1px solid rgba(22,22,26,0.12)", borderRadius: 12, background: "#FFFFFF", color: INK, outline: "none" }}
            />
          </label>
        </div>
      </main>

      <footer style={{ padding: "0 28px 44px" }}>
        <button
          onClick={() => navigate(signup ? "/onboarding?step=name" : "/home")}
          style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "17px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}
        >
          CONTINUE
        </button>
        <p style={{ textAlign: "center", fontSize: 13, color: "rgba(22,22,26,0.45)", marginTop: 14 }}>
          {signup ? (
            <>Already have an account?{" "}
              <button onClick={() => navigate("/auth?mode=signin")} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: INK, cursor: "pointer", textDecoration: "underline" }}>Sign in instead</button>
            </>
          ) : (
            <>No account yet?{" "}
              <button onClick={() => navigate("/auth?mode=signup")} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: INK, cursor: "pointer", textDecoration: "underline" }}>Create one</button>
            </>
          )}
        </p>
      </footer>
    </div>
  );
}
