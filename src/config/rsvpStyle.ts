import type { RsvpFormStyle } from "../types/editor";

export const DEFAULT_RSVP_STYLE: RsvpFormStyle = {
  backgroundColor: "#f8f2ed",
  textColor: "#4b413b",
  labelColor: "#5d514a",
  fieldBackgroundColor: "#ffffff",
  fieldTextColor: "#443c37",
  fieldBorderColor: "#d9cec6",
  buttonBackgroundColor: "#795746",
  buttonTextColor: "#ffffff",
  buttonHoverColor: "#684737",
  selectionColor: "#9f604f",
  errorColor: "#9b4f4a",
};

export const resolveRsvpStyle = (
  style?: Partial<RsvpFormStyle> | null,
): RsvpFormStyle => ({ ...DEFAULT_RSVP_STYLE, ...style });
