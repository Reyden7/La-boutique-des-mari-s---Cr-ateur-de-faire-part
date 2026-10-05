export type ElementType = "text" | "image" | "shape" | "icon" | "scratch" | "carousel" | "location" | "schedule" | "button" | "section";
export type AnimationType = "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom" | "rotate";

export interface AnimationConfig {
  type: AnimationType;
  duration: number;
  delay: number;
}

export interface ResponsiveElementLayout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Section-only end-of-document marker for this device. */
  isLastSection?: boolean;
  rotation?: number;
  visible?: boolean;
  zIndex?: number;
  /** null explicitly places this element outside every section on this device. */
  sectionId?: string | null;
  fontSize?: number;
  /** Programme typography overrides in the same device layout as its geometry. */
  timeFontSize?: number;
  titleFontSize?: number;
  descriptionFontSize?: number;
}

export interface ResponsiveLayouts {
  tablet?: ResponsiveElementLayout;
  desktop?: ResponsiveElementLayout;
}

export type WelcomeTransition = "fade" | "zoom" | "split";
export type IntroductionMode = "none" | "welcome" | "classic";

export interface WelcomeMediaTransform {
  x: number;
  y: number;
  scale: number;
}

export interface WelcomeArchTransform {
  x: number;
  y: number;
  width: number;
}

export type WelcomeTextKey = "message" | "firstName" | "separator" | "secondName" | "date" | "enterButton";

export interface WelcomeTextAppearance {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  italic: boolean;
  underline: boolean;
  rotation: number;
  opacity: number;
}

export interface WelcomeResponsiveSettings {
  background?: Partial<WelcomeMediaTransform>;
  arch?: Partial<WelcomeArchTransform>;
  text?: Partial<Record<WelcomeTextKey, Partial<Omit<WelcomeTextAppearance, "color">>>>;
}

export interface WelcomeTextStyle {
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
  namesSize: number;
  detailSize: number;
  buttonSize: number;
}

export interface WelcomeCustomAsset {
  id: string;
  name: string;
  url: string;
  assetId?: string;
  globalAssetId?: string;
}

export interface WelcomePageConfig {
  enabled: boolean;
  showArch: boolean;
  archId?: string;
  showBackground: boolean;
  backgroundId?: string;
  /** Project-scoped uploads. Built-in presets remain in welcomeCatalog.ts. */
  customArches?: WelcomeCustomAsset[];
  customBackgrounds?: WelcomeCustomAsset[];
  fallbackColor: string;
  fallbackColor2: string;
  background: WelcomeMediaTransform;
  arch: WelcomeArchTransform;
  responsive?: Partial<Record<"tablet" | "desktop", WelcomeResponsiveSettings>>;
  names: string;
  firstName?: string;
  separator?: string;
  secondName?: string;
  date: string;
  message: string;
  enterLabel: string;
  elements: EditorElement[];
  /** Legacy bridge retained while old projects are normalized to elements. */
  textElements: Record<WelcomeTextKey, WelcomeTextAppearance>;
  textStyle: WelcomeTextStyle;
  transition: WelcomeTransition;
  transitionDuration: number;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  /** Parent section in the logical document. Coordinates remain document-based. */
  sectionId?: string | null;
  name: string;
  /** Global editor-only label. Never replaces visible content or responsive geometry. */
  editorName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  /** Editor-only geometry lock. Missing on legacy projects means false. */
  locked?: boolean;
  animation?: AnimationConfig;
  responsive?: ResponsiveLayouts;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  italic: boolean;
  underline: boolean;
}

export type ImageFrameType =
  | "simple"
  | "thin"
  | "thick"
  | "double"
  | "rounded"
  | "polaroid"
  | "classic"
  | "gold"
  | "silver"
  | "wood-light"
  | "wood-dark"
  | "vintage"
  | "wedding-floral";

export type ImageFrameBorderStyle = "solid" | "double" | "dotted" | "dashed";

export interface ImageFrameConfig {
  enabled: boolean;
  type: ImageFrameType;
  color: string;
  width: number;
  radius: number;
  opacity: number;
  borderStyle: ImageFrameBorderStyle;
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowOpacity: number;
  shadowDistance: number;
}

export interface ImageStyleConfig {
  frame?: ImageFrameConfig;
  /** Non-destructive content transform. Crop positions are normalized from 0 to 1. */
  transform?: Partial<ImageTransformConfig>;
  /** Optional per-device content transforms; absent devices inherit the mobile transform. */
  responsive?: {
    tablet?: Partial<ImageTransformConfig>;
    desktop?: Partial<ImageTransformConfig>;
  };
}

export type ImageFit = "contain" | "cover";

export interface ImageTransformConfig {
  cropX: number;
  cropY: number;
  cropScale: number;
  flipX: boolean;
  flipY: boolean;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  alt: string;
  /** Missing on legacy projects, where the historical renderer used cover. */
  fit?: ImageFit;
  /** Optional for backward compatibility. Absence keeps the historical image renderer. */
  imageStyle?: ImageStyleConfig;
  assetId?: string;
  globalAssetId?: string;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: "rectangle" | "rounded-rectangle" | "circle" | "line";
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export type DecorativeHeartStyle =
  | "filled"
  | "outline"
  | "double"
  | "script"
  | "thin"
  | "wedding"
  | "modern"
  | "ornamental";

export interface IconElement extends BaseElement {
  type: "icon";
  icon: string;
  color: string;
  fontSize: number;
  heartStyle?: DecorativeHeartStyle;
}

export type ScratchIndicatorType = "finger" | "hand" | "text" | "finger-text";

export interface ScratchIndicatorConfig {
  enabled: boolean;
  type: ScratchIndicatorType;
  text: string;
  color: string;
  opacity: number;
  size: number;
  /** Offsets from the center of the scratch surface, in local logical pixels. */
  x: number;
  y: number;
  animated: boolean;
  fontFamily?: string;
  fontWeight?: number;
}

export interface ScratchElement extends BaseElement {
  type: "scratch";
  content: string;
  shape: "circle" | "rectangle" | "rounded-rectangle" | "custom";
  /** Project asset used as an alpha silhouette, not as a visible picture. */
  scratchModel?: { url: string; name: string; assetId?: string };
  surfaceStyle: "gold" | "silver" | "champagne" | "beige" | "rose" | "custom";
  surfaceColor: string;
  revealedBackgroundColor?: string;
  /** Legacy projects used contentColor; keep it as a read fallback. */
  contentColor: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  /** Local offsets inside the scratch card, never document coordinates. */
  textOffsetX?: number;
  textOffsetY?: number;
  /** Optional on legacy projects; absence intentionally means disabled. */
  scratchIndicator?: ScratchIndicatorConfig;
  hint: string;
}

export interface CarouselImage {
  id: string;
  url: string;
  alt: string;
  assetId?: string;
}

export interface CarouselElement extends BaseElement {
  type: "carousel";
  images: CarouselImage[];
  showArrows: boolean;
  showDots: boolean;
  autoplay: boolean;
  interval: number;
  transition: "slide" | "fade";
  cornerRadius: number;
  imageFit: "cover" | "contain";
}

export interface LocationElement extends BaseElement {
  type: "location";
  venueName: string;
  address: string;
  details: string;
  latitude?: number;
  longitude?: number;
  buttonLabel: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  icon?: string;
}

export interface ScheduleElement extends BaseElement {
  type: "schedule";
  items: ScheduleItem[];
  displayStyle: "list" | "timeline" | "elegant";
  backgroundColor: string;
  textColor: string;
  timeColor: string;
  lineColor: string;
  accentColor: string;
  /** Optional for backward compatibility; renderers apply shared defaults. */
  timeFontSize?: number;
  titleFontSize?: number;
  descriptionFontSize?: number;
  titleColor?: string;
  descriptionColor?: string;
}

export interface ButtonElement extends BaseElement {
  type: "button";
  label: string;
  url: string;
  target: "same" | "new";
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  textAlign: "left" | "center" | "right";
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  welcomeAction?: "enter";
}

export interface SectionElement extends BaseElement {
  type: "section";
  isLastSection?: boolean;
  background: PageBackground;
  padding: number;
  cornerRadius: number;
}

export type EditorElement = TextElement | ImageElement | ShapeElement | IconElement | ScratchElement | CarouselElement | LocationElement | ScheduleElement | ButtonElement | SectionElement;

export interface PageBackground {
  type: "color" | "gradient" | "image";
  color?: string;
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    angle?: number;
  };
  imageUrl?: string;
}

export interface BackgroundSection {
  id: string;
  y: number;
  height: number;
  background: PageBackground;
}

export interface WeddingPage {
  id: string;
  name: string;
  background: PageBackground;
  elements: EditorElement[];
  backgroundSections?: BackgroundSection[];
}

export interface CustomFontAsset {
  id: string;
  name: string;
  family: string;
  url: string;
  format: "ttf" | "otf" | "truetype" | "opentype" | "woff" | "woff2";
  assetId?: string;
  globalAssetId?: string;
}

export type RsvpFieldType = "short_text" | "long_text" | "number" | "boolean" | "single_choice" | "multiple_choice" | "select" | "email";

export interface RsvpField {
  id: string;
  label: string;
  type: RsvpFieldType;
  required: boolean;
  options?: string[];
}

export interface RsvpFormStyle {
  backgroundColor: string;
  textColor: string;
  labelColor: string;
  fieldBackgroundColor: string;
  fieldTextColor: string;
  fieldBorderColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  buttonHoverColor: string;
  selectionColor: string;
  errorColor: string;
}

export interface RsvpFormTypography {
  fontFamily?: string;
  titleFontSize?: number;
  labelFontSize?: number;
  fieldFontSize?: number;
}

export interface RsvpFormConfig {
  /** Global editor-only hierarchy label, independent of the public form title. */
  editorName?: string;
  enabled: boolean;
  visibilityByDevice?: Partial<Record<"mobile" | "tablet" | "desktop", boolean>>;
  purchased: boolean;
  animation?: AnimationConfig;
  /** Optional parent section in the editor; commercial entitlement remains independent. */
  sectionId?: string | null;
  /** The RSVP block is positionable in the editor, so its geometry can be locked too. */
  locked?: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  fields: RsvpField[];
  /** Mobile reference horizontal geometry. Undefined keeps the legacy full width. */
  positionX?: number;
  width?: number;
  /** Requested mobile height. Effective height never clips form content. */
  height?: number;
  /** Mobile reference position. Undefined keeps the legacy automatic placement. */
  positionY?: number;
  /** Tablet and desktop reuse the same responsive override model as canvas elements. */
  responsive?: ResponsiveLayouts;
  style?: RsvpFormStyle;
  typography?: RsvpFormTypography;
}

export type OpeningAnimationType = "none" | "envelope" | "curtains" | "doors" | "scroll" | "book" | "veil" | "floral-gates";

export interface OpeningAnimationConfig {
  type: OpeningAnimationType;
  duration: number;
  colors?: string[];
  variant?: string;
  customSettings?: Record<string, unknown>;
}

export interface EnvelopeOpeningSettings {
  envelopeColor: string;
  envelopeInnerColor: string;
  flapColor?: string;
  sealColor: string;
  backgroundColor: string;
  hintText: string;
  duration?: number;
  variant?: string;
}

export interface ProjectAudioConfig {
  enabled: boolean;
  source: "library" | "upload" | null;
  trackId?: string;
  uploadedAudioId?: string;
  uploadedAudioName?: string;
  uploadedAudioUrl?: string;
  globalAssetId?: string;
  volume: number;
  loop: boolean;
  startMode: "opening-interaction" | "manual";
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export type ParticleShape =
  | "circle"
  | "heart"
  | "star"
  | "petal"
  | "sparkle"
  | "diamond"
  | "custom";
export type ParticleDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

export interface ParticleConfig {
  enabled: boolean;

  shape: ParticleShape;

  direction: ParticleDirection;

  // 0 = flottement local, sans sortir de l’écran
  speed: number;

  quantity: number;

  colors: string[];

  minSize: number;

  maxSize: number;

  opacity: number;

  layer: "behind" | "front";

  customImageUrl?: string;
  customImageName?: string;
  customImageAssetId?: string;
  customImageGlobalAssetId?: string;
}

export interface WeddingProject {
  id: string;
  ownerId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "published" | "expired";
  paymentStatus?: "unpaid" | "pending" | "paid" | "refunded";
  publicId?: string;
  publishedAt?: string;
  expiresAt?: string;

  /** Editable commercial declaration; never grants paid rights. */
  requestedGuestCount?: number;
  /** Read-only server columns. Absent for historical purchases. */
  purchasedGuestCapacity?: number;
  purchasedExtraBlocks?: number;
  publicationLicenseId?: string;

  pages: WeddingPage[];

  opening: OpeningAnimationConfig;

  audio: ProjectAudioConfig;

  particles: ParticleConfig;

  introductionMode: IntroductionMode;

  customFonts?: CustomFontAsset[];

  rsvp?: RsvpFormConfig;

  /** Optional full-screen introduction shown before the scrollable document. */
  welcomePage?: WelcomePageConfig;
}

export const WEDDING_FONTS = [
  "Cormorant Garamond", "Playfair Display", "DM Serif Display", "Libre Baskerville",
  "Bodoni Moda", "Lora", "Cinzel", "Marcellus", "Prata", "Italiana",
  "Montserrat", "Poppins", "Raleway", "Josefin Sans", "Manrope", "Inter",
  "Quicksand", "Nunito Sans", "Source Sans 3", "Work Sans",
  "Great Vibes", "Parisienne", "Dancing Script", "Allura", "Alex Brush",
  "Sacramento", "Tangerine", "Petit Formal Script", "Italianno", "Pinyon Script",
  "Caveat", "Satisfy", "Cormorant SC", "Poiret One", "Forum",
  "Georgia", "Garamond", "Palatino", "Times New Roman", "Arial"
] as const;
