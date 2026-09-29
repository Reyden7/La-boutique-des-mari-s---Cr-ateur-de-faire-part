import type { ScheduleElement } from "../types/editor";
import type { ResolvedElementLayout } from "../utils/responsiveLayout";

export const DEFAULT_SCHEDULE_STYLE = {
  timeFontSize: 12,
  titleFontSize: 17,
  descriptionFontSize: 11,
  contentPadding: 24,
} as const;

export const resolveScheduleTypography = (
  element: ScheduleElement,
  layout: ResolvedElementLayout,
) => ({
  timeFontSize: layout.timeFontSize ?? element.timeFontSize ?? DEFAULT_SCHEDULE_STYLE.timeFontSize,
  titleFontSize: layout.titleFontSize ?? element.titleFontSize ?? DEFAULT_SCHEDULE_STYLE.titleFontSize,
  descriptionFontSize: layout.descriptionFontSize ?? element.descriptionFontSize ?? DEFAULT_SCHEDULE_STYLE.descriptionFontSize,
});

