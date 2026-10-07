import { useResponsiveDevice } from "../../../hooks/useResponsiveDevice";
import type { OpeningAnimationProps } from "../openingTypes";
import { PngEnvelopeOpening } from "./PngEnvelopeOpening";
import { VerticalEnvelopeOpening } from "./VerticalEnvelopeOpening";

export function ResponsiveEnvelopeOpening(props: OpeningAnimationProps) {
  const device = useResponsiveDevice(props.device);
  return device === "mobile" ? <PngEnvelopeOpening {...props} /> : <VerticalEnvelopeOpening {...props} />;
}
