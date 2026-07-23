/**
 * applyOverridesToDom — imperatively apply saved canvas overrides + inserted
 * elements to a rendered surface's DOM. Shared by the iOS preview snapshot
 * stage (and usable by any headless capture path). Mirrors the application
 * logic in PreviewPage/DeviceFrame.
 */
import { instrumentSurface, hasDirectText } from "./instrument";
import { isRichText, sanitizeRich } from "../../../shared/richtext";
import type { ElementOverride, InsertedElement } from "./store";

export function applyOverridesToDom(
  root: HTMLElement,
  surfaceId: string,
  overrides: Record<string, ElementOverride>,
  inserted: Record<string, InsertedElement>,
): void {
  instrumentSurface(root, surfaceId);
  root.querySelectorAll<HTMLElement>("[data-fd-id]").forEach((el) => {
    const o = overrides[`${surfaceId}::${el.dataset.fdId}`] ?? overrides[`*::${el.dataset.fdId}`];
    if (!o) return;
    if (o.text !== undefined) {
      if (isRichText(o.text) || o.text.includes("\n")) {
        const html = sanitizeRich(o.text.replace(/\n/g, "<br>"));
        if (el.dataset.fdRich !== html) {
          el.innerHTML = html;
          el.dataset.fdRich = html;
        }
        el.querySelectorAll<HTMLElement>("strong[data-c], em[data-c]").forEach((s) => {
          const hex = s.dataset.c ?? "";
          if (/^#[0-9A-Fa-f]{6}$/.test(hex)) s.style.color = hex;
        });
      } else if (hasDirectText(el)) {
        const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
        if (textNodes[0] && textNodes[0].textContent !== o.text) {
          textNodes[0].textContent = o.text;
          textNodes.slice(1).forEach((n) => {
            n.textContent = "";
          });
        }
      }
    }
    if (o.color) el.style.color = o.color;
    if (o.background) el.style.backgroundColor = o.background;
    if (o.fontSize) el.style.fontSize = o.fontSize;
    if (o.fontWeight) el.style.fontWeight = o.fontWeight;
    if (o.fontFamily) el.style.fontFamily = o.fontFamily;
    if (o.letterSpacing) el.style.letterSpacing = o.letterSpacing;
    if (o.lineHeight) el.style.lineHeight = o.lineHeight;
    if (o.textTransform) el.style.textTransform = o.textTransform;
    if (o.textAlign) el.style.textAlign = o.textAlign;
    if (o.borderColor) el.style.borderColor = o.borderColor;
    if (o.dx || o.dy) el.style.transform = `translate(${o.dx ?? 0}px, ${o.dy ?? 0}px)`;
    if (o.w) el.style.width = `${o.w}px`;
    if (o.h) el.style.height = `${o.h}px`;
    el.style.display = o.hidden ? "none" : "";
  });
  // Inserted elements: absolute within the frame.
  Object.values(inserted)
    .filter((i) => i.surfaceId === surfaceId)
    .forEach((i) => {
      if (root.querySelector(`[data-fd-inserted="${i.elementId}"]`)) return;
      const div = document.createElement("div");
      div.setAttribute("data-fd-inserted", i.elementId);
      div.setAttribute("data-fd-id", i.elementId);
      Object.assign(div.style, {
        position: "absolute",
        left: `${i.dx}px`,
        top: `${i.dy}px`,
        zIndex: "60",
        padding: i.kind === "button" ? "12px 24px" : "4px 8px",
        borderRadius: i.kind === "button" ? "100px" : "6px",
        background: i.background,
        color: i.color,
        fontSize: i.fontSize,
      } as CSSStyleDeclaration);
      div.textContent = i.text;
      root.appendChild(div);
    });
}

