import type { OpeningAnimationConfig } from "../../types/editor";
import { getOpeningDefinition } from "./registry/openingRegistry";
import type { ReactNode } from "react";

export function OpeningRenderer({ config, children, couple, onInteract, onComplete }: { config: OpeningAnimationConfig; children: ReactNode; couple: string; onInteract?: () => void; onComplete?: () => void }) {
  const Component = getOpeningDefinition(config.type).component;
  return <Component config={config} couple={couple} onInteract={onInteract} onComplete={onComplete}>{children}</Component>;
}
