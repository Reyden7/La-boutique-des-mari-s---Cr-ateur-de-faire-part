import type { ScratchElement } from "../../types/editor";

export const getScratchTextStyle = (element: ScratchElement) => ({
  fontSize: element.fontSize ?? 42,
  fontFamily: element.fontFamily ?? "Cormorant Garamond",
  fontWeight: element.fontWeight ?? 600,
  textColor: element.textColor ?? element.contentColor ?? "#4d3e34",
  textAlign: element.textAlign ?? "center",
  textOffsetX: element.textOffsetX ?? 0,
  textOffsetY: element.textOffsetY ?? 0,
});
