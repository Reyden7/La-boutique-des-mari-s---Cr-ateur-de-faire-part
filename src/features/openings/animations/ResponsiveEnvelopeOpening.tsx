import { useResponsiveDevice } from "../../../hooks/useResponsiveDevice";
import type { OpeningAnimationProps } from "../openingTypes";
import { PngEnvelopeOpening } from "./PngEnvelopeOpening";

export function ResponsiveEnvelopeOpening(props: OpeningAnimationProps) {
  const device = useResponsiveDevice(props.device);
  return <PngEnvelopeOpening key={device} {...props} device={device} />;
}
