import type { ComponentType, ReactNode } from "react";
import type { OpeningAnimationConfig, OpeningAnimationType } from "../../types/editor";

export interface OpeningAnimationProps {
  config: OpeningAnimationConfig;
  children: ReactNode;
  couple: string;
  onInteract?: () => void;
}

export interface OpeningAnimationDefinition {
  id: OpeningAnimationType;
  name: string;
  description: string;
  thumbnail: string;
  component: ComponentType<OpeningAnimationProps>;
  defaultSettings: OpeningAnimationConfig;
}
