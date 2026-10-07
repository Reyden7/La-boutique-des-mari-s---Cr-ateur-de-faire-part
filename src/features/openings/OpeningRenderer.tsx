import { getOpeningDefinition } from "./registry/openingRegistry";
import type { OpeningAnimationProps } from "./openingTypes";

export function OpeningRenderer({ config, children, couple, device, onInteract, onComplete }: OpeningAnimationProps) {
  const Component = getOpeningDefinition(config.type).component;
  return <Component config={config} couple={couple} device={device} onInteract={onInteract} onComplete={onComplete}>{children}</Component>;
}
