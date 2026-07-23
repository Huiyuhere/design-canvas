/**
 * canvas.config.ts — the single place to make Design Canvas yours.
 *
 * Everything product-specific lives here: your project name, brand palette,
 * fonts, copy-lint rules, workspaces, device frame, and (optionally) the
 * GitHub repo your change logs should be filed against.
 *
 * The demo values ship with a fictional app called "Wavelength" — replace
 * them with your own product's values when you onboard your screens.
 */

export interface BrandToken {
  name: string;
  hex: string; // #RRGGBB or rgba(...)
  usage: string;
}

export interface BrandFont {
  name: string;
  css: string; // CSS font-family value
  job: string; // when to use it — shown as guidance in the inspector
}

export interface BannedTerm {
  term: string; // matched case-insensitively; "!" matches any exclamation mark
  reason: string;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  description: string;
  /** Soft cap on surfaces per workspace — the coverage audit warns above it. */
  cap: number;
}

export interface DeviceFrameConfig {
  /** "phone" renders an iPhone-style bezel; "browser" renders a desktop browser chrome. */
  kind: "phone" | "browser";
  width: number; // CSS px of the screen area
  height: number;
}

export interface CanvasConfig {
  /** Shown in the toolbar and export headers. */
  projectName: string;
  /**
   * Where each platform's real source code lives. Used in exports so coding
   * agents know which repo a codeRef path belongs to. All optional.
   */
  repos: {
    web?: string; // e.g. "your-org/your-web-app"
    ios?: string; // e.g. "your-org/your-ios-app"
    android?: string;
  };
  /**
   * Optional: "owner/repo" to file GitHub issues against from the change-log
   * panel (uses a prefilled new-issue URL — no token needed). Leave undefined
   * to hide the button.
   */
  githubIssueRepo?: string;
  brandTokens: BrandToken[];
  /** Extra palette entries offered in pickers but excluded from the off-palette lint. */
  extendedPalette: BrandToken[];
  fonts: BrandFont[];
  /** Terms the copy lint flags when they appear in edited text. */
  bannedVocabulary: BannedTerm[];
  workspaces: WorkspaceConfig[];
  device: DeviceFrameConfig;
  /** Accent color for canvas chrome (selection outlines, badges). */
  accent: string;
  ink: string;
  uiFont: string;
}

const config: CanvasConfig = {
  projectName: "Wavelength",

  repos: {
    web: "your-org/wavelength-web",
    ios: "your-org/wavelength-ios",
  },

  // githubIssueRepo: "your-org/wavelength-web",

  brandTokens: [
    { name: "Ink", hex: "#16161A", usage: "Primary text, icons, primary buttons" },
    { name: "Paper", hex: "#F6F5F1", usage: "The background of every screen" },
    { name: "Card White", hex: "#FFFFFF", usage: "Elevated cards" },
    { name: "Tide", hex: "#14655A", usage: "The accent — progress, focus moments, links" },
    { name: "Muted Ink", hex: "rgba(22,22,26,0.45)", usage: "Placeholder, disabled, secondary text" },
    { name: "Eyebrow", hex: "rgba(22,22,26,0.40)", usage: "Eyebrow labels, section headers, metadata" },
  ],

  extendedPalette: [
    { name: "Ink 5%", hex: "rgba(22,22,26,0.05)", usage: "Chips, quiet button fills" },
    { name: "Ink 8%", hex: "rgba(22,22,26,0.08)", usage: "Hairline borders, dividers" },
    { name: "Ink 12%", hex: "rgba(22,22,26,0.12)", usage: "Input borders, stronger hairlines" },
    { name: "Ink 55%", hex: "rgba(22,22,26,0.55)", usage: "Body secondary text" },
    { name: "Tide 10%", hex: "rgba(20,101,90,0.10)", usage: "Accent-tinted fills" },
  ],

  fonts: [
    { name: "Georgia", css: "Georgia, 'Times New Roman', serif", job: "Loud — headlines and hero statements. Weight 400/500." },
    { name: "Nunito", css: "'Nunito', sans-serif", job: "Quiet — body, buttons, labels, micro-copy. 400 reading / 700 small UI labels." },
  ],

  bannedVocabulary: [
    { term: "click here", reason: "Non-descriptive link text hurts accessibility and voice" },
    { term: "!", reason: "No exclamation marks — the voice is calm and confident" },
    { term: "world-class", reason: "Empty superlative — show, don't tell" },
  ],

  workspaces: [
    { id: "growth", name: "Growth", description: "Landing, sign-in, acquisition", cap: 100 },
    { id: "onboarding", name: "Onboarding", description: "First-run setup flow", cap: 100 },
    { id: "core", name: "Core Experience", description: "Home, detail, everyday loop", cap: 100 },
    { id: "system", name: "System & Edge", description: "Settings, errors, toasts", cap: 100 },
  ],

  device: { kind: "phone", width: 393, height: 852 },

  accent: "#14655A",
  ink: "#16161A",
  uiFont: "'Nunito', sans-serif",
};

export default config;
