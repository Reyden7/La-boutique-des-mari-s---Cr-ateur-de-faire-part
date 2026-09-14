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

export interface IconElement extends BaseElement {
  type: "icon";
  icon: string;
  color: string;
  fontSize: number;
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

export interface WeddingPage {
  id: string;
  name: string;
  background: PageBackground;
  elements: EditorElement[];
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
}

export const WEDDING_FONTS = [
  "Cormorant Garamond", "Playfair Display", "Great Vibes", "Parisienne",
  "Montserrat", "Poppins", "Lora", "Libre Baskerville", "Dancing Script",
  "Cinzel", "Georgia", "Garamond", "Palatino", "Times New Roman", "Arial"
] as const;
