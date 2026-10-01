import type { PreviewDevice } from "../../config/previewDevices";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import type { ButtonElement, EditorElement, TextElement, WelcomeArchTransform, WelcomeMediaTransform, WelcomePageConfig, WelcomeTextAppearance, WelcomeTextKey } from "../../types/editor";
import { normalizeElementLocks } from "../../utils/elementLocking";

const DEFAULT_TEXT_COLOR = "#fffaf5";

const textAppearance = (x: number, y: number, width: number, height: number, fontSize: number): WelcomeTextAppearance => ({
  x, y, width, height, fontSize, color: DEFAULT_TEXT_COLOR, fontFamily: "Cormorant Garamond",
  fontWeight: 500, textAlign: "center", lineHeight: 1, letterSpacing: 0,
  italic: false, underline: false, rotation: 0, opacity: 1,
});

const DEFAULT_TEXT_ELEMENTS: Record<WelcomeTextKey, WelcomeTextAppearance> = {
  message: { ...textAppearance(50, 42, 82, 6, 13), letterSpacing: 2, fontFamily: "Montserrat", fontWeight: 500 },
  firstName: textAppearance(50, 48, 88, 10, 52),
  separator: textAppearance(50, 53, 30, 8, 38),
  secondName: textAppearance(50, 58, 88, 10, 52),
  date: { ...textAppearance(50, 64, 65, 6, 18), letterSpacing: 1 },
  enterButton: { ...textAppearance(50, 75, 38, 7, 13), fontFamily: "Montserrat", fontWeight: 600, letterSpacing: 2 },
};

export const DEFAULT_WELCOME_PAGE: WelcomePageConfig = {
  enabled: false,
  showArch: true,
  archId: "white-curtain",
  showBackground: true,
  backgroundId: "italy",
  fallbackColor: "#eee2d7",
  fallbackColor2: "#c9aa91",
  background: { x: 50, y: 50, scale: 1 },
  arch: { x: 50, y: 52, width: 92 },
  names: "Emma & Lucas",
  firstName: "Emma",
  separator: "&",
  secondName: "Lucas",
  date: "18 juin 2027",
  message: "Découvrez notre invitation",
  enterLabel: "Entrer",
  customArches: [],
  customBackgrounds: [],
  elements: [],
  textElements: structuredClone(DEFAULT_TEXT_ELEMENTS),
  textStyle: {
    fontFamily: "Cormorant Garamond",
    color: "#fffaf5",
    align: "center",
    namesSize: 52,
    detailSize: 18,
    buttonSize: 13,
  },
  transition: "fade",
  transitionDuration: 1.1,
};

export const resolveWelcomePage = (value?: Partial<WelcomePageConfig>): WelcomePageConfig => {
  const legacyNames = value?.names ?? DEFAULT_WELCOME_PAGE.names;
  const [legacyFirstName, legacySecondName = ""] = legacyNames.split(/\s*&\s*/, 2);
  const firstName = value?.firstName ?? legacyFirstName;
  const separator = value?.separator ?? "&";
  const secondName = value?.secondName ?? legacySecondName;
  const legacyColor = value?.textStyle?.color ?? DEFAULT_TEXT_COLOR;
  const textElements = Object.fromEntries(
    (Object.keys(DEFAULT_TEXT_ELEMENTS) as WelcomeTextKey[]).map((key) => [
      key,
      {
        ...DEFAULT_TEXT_ELEMENTS[key],
        color: legacyColor,
        fontFamily: value?.textStyle?.fontFamily ?? DEFAULT_TEXT_ELEMENTS[key].fontFamily,
        fontSize: key === "firstName" || key === "secondName" ? value?.textStyle?.namesSize ?? DEFAULT_TEXT_ELEMENTS[key].fontSize
          : key === "enterButton" ? value?.textStyle?.buttonSize ?? DEFAULT_TEXT_ELEMENTS[key].fontSize
          : value?.textStyle?.detailSize ?? DEFAULT_TEXT_ELEMENTS[key].fontSize,
        textAlign: value?.textStyle?.align ?? DEFAULT_TEXT_ELEMENTS[key].textAlign,
        ...value?.textElements?.[key],
      },
    ]),
  ) as Record<WelcomeTextKey, WelcomeTextAppearance>;
  const resolved = {
    ...structuredClone(DEFAULT_WELCOME_PAGE),
    ...value,
    firstName,
    separator,
    secondName,
    names: secondName ? `${firstName} ${separator} ${secondName}` : firstName,
    customArches: value?.customArches ?? [],
    customBackgrounds: value?.customBackgrounds ?? [],
    textElements,
    background: { ...DEFAULT_WELCOME_PAGE.background, ...value?.background },
    arch: { ...DEFAULT_WELCOME_PAGE.arch, ...value?.arch },
    textStyle: { ...DEFAULT_WELCOME_PAGE.textStyle, ...value?.textStyle },
    responsive: value?.responsive,
  };
  if (Array.isArray(value?.elements)) return { ...resolved, elements: normalizeElementLocks(value.elements) };

  const content: Record<Exclude<WelcomeTextKey, "enterButton">, string> = {
    message: resolved.message,
    firstName: resolved.firstName ?? "",
    separator: resolved.separator ?? "",
    secondName: resolved.secondName ?? "",
    date: resolved.date,
  };
  const elements: EditorElement[] = (Object.keys(content) as (Exclude<WelcomeTextKey, "enterButton">)[]).map((key, index) => {
    const appearance = textElements[key];
    const mobile = PREVIEW_DEVICES.mobile;
    const base: TextElement = {
      id: crypto.randomUUID(), type: "text", name: key === "message" ? "Petit texte" : key === "date" ? "Date" : key === "separator" ? "Séparateur" : key === "firstName" ? "Prénom 1" : "Prénom 2",
      x: (appearance.x - appearance.width / 2) / 100 * mobile.width,
      y: (appearance.y - appearance.height / 2) / 100 * mobile.height,
      width: appearance.width / 100 * mobile.width, height: appearance.height / 100 * mobile.height,
      rotation: appearance.rotation, opacity: appearance.opacity, zIndex: index + 1, visible: true, locked: false,
      text: content[key], fontFamily: appearance.fontFamily, fontSize: appearance.fontSize, fontWeight: appearance.fontWeight,
      color: appearance.color, textAlign: appearance.textAlign, lineHeight: appearance.lineHeight, letterSpacing: appearance.letterSpacing,
      italic: appearance.italic, underline: appearance.underline, animation: { type: "none", duration: .8, delay: 0 },
    };
    base.responsive = Object.fromEntries((["tablet", "desktop"] as const).map((device) => {
      const viewport = PREVIEW_DEVICES[device];
      const override = value?.responsive?.[device]?.text?.[key];
      const item = { ...appearance, ...override };
      return [device, { x: (item.x - item.width / 2) / 100 * viewport.width, y: (item.y - item.height / 2) / 100 * viewport.height, width: item.width / 100 * viewport.width, height: item.height / 100 * viewport.height, rotation: item.rotation, fontSize: item.fontSize }];
    })) as TextElement["responsive"];
    return base;
  });
  const buttonAppearance = textElements.enterButton;
  const mobile = PREVIEW_DEVICES.mobile;
  const button: ButtonElement = {
    id: crypto.randomUUID(), type: "button", name: "Bouton Entrer", welcomeAction: "enter", label: resolved.enterLabel, url: "", target: "same",
    x: (buttonAppearance.x - buttonAppearance.width / 2) / 100 * mobile.width, y: (buttonAppearance.y - buttonAppearance.height / 2) / 100 * mobile.height,
    width: buttonAppearance.width / 100 * mobile.width, height: buttonAppearance.height / 100 * mobile.height,
    rotation: buttonAppearance.rotation, opacity: buttonAppearance.opacity, zIndex: 100, visible: true, locked: false,
    backgroundColor: "rgba(255,255,255,0.13)", textColor: buttonAppearance.color, borderColor: buttonAppearance.color, borderWidth: 1, borderRadius: 99, textAlign: "center",
    fontFamily: buttonAppearance.fontFamily, fontSize: buttonAppearance.fontSize, fontWeight: buttonAppearance.fontWeight,
    animation: { type: "none", duration: .8, delay: 0 },
  };
  button.responsive = Object.fromEntries((["tablet", "desktop"] as const).map((device) => {
    const viewport = PREVIEW_DEVICES[device];
    const item = { ...buttonAppearance, ...value?.responsive?.[device]?.text?.enterButton };
    return [device, { x: (item.x - item.width / 2) / 100 * viewport.width, y: (item.y - item.height / 2) / 100 * viewport.height, width: item.width / 100 * viewport.width, height: item.height / 100 * viewport.height, rotation: item.rotation }];
  })) as ButtonElement["responsive"];
  return { ...resolved, elements: [...elements, button] };
};

export const getWelcomeTextAppearance = (
  config: WelcomePageConfig,
  key: WelcomeTextKey,
  device: PreviewDevice,
): WelcomeTextAppearance => ({
  ...config.textElements[key],
  ...(device === "mobile" ? undefined : config.responsive?.[device]?.text?.[key]),
});

export const getWelcomeTransforms = (config: WelcomePageConfig, device: PreviewDevice): {
  background: WelcomeMediaTransform;
  arch: WelcomeArchTransform;
} => {
  const override = device === "mobile" ? undefined : config.responsive?.[device];
  return {
    background: { ...config.background, ...override?.background },
    arch: { ...config.arch, ...override?.arch },
  };
};
