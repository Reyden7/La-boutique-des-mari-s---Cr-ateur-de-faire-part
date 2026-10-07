import type { ComponentType, ReactNode } from "react";
import type { OpeningAnimationConfig, OpeningAnimationType } from "../../types/editor";
import type { PreviewDevice } from "../../config/previewDevices";

export interface OpeningAnimationProps {
  config: OpeningAnimationConfig;
  children: ReactNode;
  couple: string;
  device?: PreviewDevice;
  onInteract?: () => void;
  onComplete?: () => void;
}

export interface OpeningAnimationDefinition {
  id: OpeningAnimationType;
  name: string;
  description: string;
  thumbnail: string;
  component: ComponentType<OpeningAnimationProps>;
  defaultSettings: OpeningAnimationConfig;
}
