/**
 * Wavelength — Onboarding. Three steps, each directly addressable with
 * ?step=name|frequency|quiet so the canvas can pin every state.
 */
import { useState } from "react";
import { navigate } from "wouter/use-browser-location";
import { useFrameSearchParams } from "../canvas/frameEnv";

const INK = "#16161A";
const PAPER = "#F6F5F1";
const TIDE = "#14655A";

const STEPS = ["name", "frequency", "quiet"] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const params = useFrameSearchParams();
  const raw = params.get("step") ?? "name";
  const step: Step = (STEPS as readonly string[]).includes(raw) ? (raw as Step) : "name";
  const idx = STEPS.indexOf(step);

  const next = () => {
    if (idx < STEPS.length - 1) navigate(`/onboarding?step=${STEPS[idx + 1]}`);
    else navigate("/home");
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, display: "flex", flexDirection: "column", fontFamily: "'Nunito', sans-serif", color: INK }}>
      <header style={{ padding: "28px 28px 0" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {STEPS.map((s, i) => (
            <span key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? TIDE : "rgba(22,22,26,0.10)" }} />
          ))}
        </div>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)", marginTop: 16 }}>
          Step {idx + 1} of {STEPS.length}
        </p>
      </header>

      <main style={{ flex: 1, padding: "28px 28px 0" }}>
        {step === "name" && <StepName />}
        {step === "frequency" && <StepFrequency />}
        {step === "quiet" && <StepQuiet />}
      </main>

      <footer style={{ padding: "0 28px 44px" }}>
        <button
          onClick={next}
          style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "17px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", fontFamily: "'Nunito', sans-serif", cursor: "pointer" }}
        >
          {idx === STEPS.length - 1 ? "FINISH" : "NEXT"}
        </button>
      </footer>
    </div>
  );
}

function StepName() {
  return (
    <div>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: 0 }}>
        What should your circle call you?
      </h1>
      <input
        placeholder="First name"
        style={{ width: "100%", boxSizing: "border-box", marginTop: 28, padding: "16px", fontSize: 17, fontFamily: "'Nunito', sans-serif", border: "1px solid rgba(22,22,26,0.12)", borderRadius: 12, background: "#FFFFFF", color: INK, outline: "none" }}
      />
      <p style={{ fontSize: 13, color: "rgba(22,22,26,0.45)", marginTop: 12, lineHeight: 1.6 }}>
        Just a first name. Your circle already knows who you are.
      </p>
    </div>
  );
}

function StepFrequency() {
  const [choice, setChoice] = useState("daily");
  const options = [
    { id: "daily", label: "Once a day", detail: "A single quiet nudge each evening" },
    { id: "weekly", label: "A few times a week", detail: "Only when there is something to say" },
    { id: "manual", label: "Only when I open the app", detail: "No nudges at all" },
  ];
  return (
    <div>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: 0 }}>
        How often do you want a nudge?
      </h1>
      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => setChoice(o.id)}
            style={{
              textAlign: "left", padding: "16px 18px", borderRadius: 14, cursor: "pointer",
              border: choice === o.id ? `1.5px solid ${INK}` : "1px solid rgba(22,22,26,0.12)",
              background: choice === o.id ? "#FFFFFF" : "rgba(255,255,255,0.6)",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: INK }}>{o.label}</span>
            <span style={{ display: "block", fontSize: 12.5, color: "rgba(22,22,26,0.5)", marginTop: 3 }}>{o.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepQuiet() {
  return (
    <div>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: "clamp(26px, 6vw, 40px)", letterSpacing: "-0.015em", margin: 0 }}>
        Set your quiet hours
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(22,22,26,0.55)", marginTop: 12 }}>
        Wavelength never makes a sound between these times.
      </p>
      <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
        {[{ label: "From", value: "22:00" }, { label: "Until", value: "08:00" }].map((t) => (
          <div key={t.label} style={{ flex: 1, background: "#FFFFFF", border: "1px solid rgba(22,22,26,0.12)", borderRadius: 14, padding: "14px 16px" }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(22,22,26,0.40)" }}>{t.label}</span>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 26, margin: "6px 0 0" }}>{t.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

