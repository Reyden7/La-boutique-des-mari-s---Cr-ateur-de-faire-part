export type ElementType = "text" | "image" | "shape" | "icon";
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
  rotation?: number;
  fontSize?: number;
}

export interface ResponsiveLayouts {
  tablet?: ResponsiveElementLayout;
  desktop?: ResponsiveElementLayout;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
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

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  alt: string;
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

export type EditorElement = TextElement | ImageElement | ShapeElement | IconElement;

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
  format: "truetype" | "opentype" | "woff" | "woff2";
  assetId?: string;
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

export interface RsvpFormConfig {
  enabled: boolean;
  purchased: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  fields: RsvpField[];
  /** Mobile reference position. Undefined keeps the legacy automatic placement. */
  positionY?: number;
  /** Tablet and desktop reuse the same responsive override model as canvas elements. */
  responsive?: ResponsiveLayouts;
  style?: RsvpFormStyle;
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

  pages: WeddingPage[];

  opening: OpeningAnimationConfig;

  audio: ProjectAudioConfig;

  particles: ParticleConfig;

  customFonts?: CustomFontAsset[];

  rsvp?: RsvpFormConfig;
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
