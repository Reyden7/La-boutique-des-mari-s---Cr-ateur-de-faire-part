import { ExternalLink, MapPin } from "lucide-react";
import type { ButtonElement, CalendarElement, CountdownElement, CarouselElement, LocationElement, ScheduleElement, ScratchElement, SectionElement } from "../../types/editor";
import { PhotoCarouselRenderer } from "./PhotoCarouselRenderer";
import { ScratchCardRenderer } from "./ScratchCardRenderer";
import { directionsUrl, sanitizeExternalUrl } from "./safeUrl";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { ScheduleRenderer } from "./ScheduleRenderer";
import { CalendarRenderer } from "./CalendarRenderer";
import { CountdownRenderer } from "./CountdownRenderer";
import { SectionSurface } from "./SectionSurface";
import { getElementLayout } from "../../utils/responsiveLayout";
import { resolveElementVisualStyle } from "../../utils/responsiveVisualStyle";

export type RichElement = ScratchElement | CarouselElement | LocationElement | ScheduleElement | CalendarElement | CountdownElement | ButtonElement | SectionElement;

export function RichElementRenderer({ element, device }: { element: RichElement; device: PreviewDevice }) {
  element = resolveElementVisualStyle(element, device);
  const adapted = device !== "mobile" && !!element.responsive?.[device]?.visualStyle;
  if (element.type === "scratch") return <ScratchCardRenderer element={element} device={device} />;
  if (element.type === "carousel") return <PhotoCarouselRenderer element={element} />;
  if (element.type === "location") {
    const scale = device === "mobile" ? undefined : element.responsive?.[device]?.visualStyle?.locationScale;
    const px = (value: number) => `${value * (scale ?? 1) / PREVIEW_DEVICES[device].width * 100}cqw`;
    const mapUrl = Number.isFinite(element.latitude) && Number.isFinite(element.longitude)
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${element.longitude! - .015}%2C${element.latitude! - .01}%2C${element.longitude! + .015}%2C${element.latitude! + .01}&layer=mapnik&marker=${element.latitude}%2C${element.longitude}`
      : undefined;
    return <article className="location-card" style={{ background: element.backgroundColor, color: element.textColor, ...(scale ? { borderRadius: px(14) } : {}) }}>
      {mapUrl ? <iframe title={`Carte de ${element.venueName}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" /> : <div className="location-map-placeholder" style={scale ? { fontSize: px(10), padding: px(15), gap: px(8) } : undefined}><MapPin size={32} style={{ color: element.accentColor, ...(scale ? { width: px(32), height: px(32) } : {}) }} /><span>{element.address}</span></div>}
      <div className="location-copy" style={scale ? { padding: px(24) } : undefined}><small style={scale ? { fontSize: px(8) } : undefined}>Nous rejoindre</small><h3 style={scale ? { fontSize: px(20) } : undefined}>{element.venueName}</h3><address style={scale ? { fontSize: px(10) } : undefined}>{element.address}</address>{element.details && <p style={scale ? { fontSize: px(10) } : undefined}>{element.details}</p>}<a href={directionsUrl(element.address)} target="_blank" rel="noreferrer" style={{ background: element.accentColor, ...(scale ? { fontSize: px(10), padding: `${px(8)} ${px(12)}`, borderRadius: px(7), gap: px(6) } : {}) }}>{element.buttonLabel}<ExternalLink size={13} /></a></div>
    </article>;
  }
  if (element.type === "schedule") return <ScheduleRenderer element={element} device={device} />;
  if (element.type === "calendar") return <CalendarRenderer element={element} device={device} />;
  if (element.type === "countdown") return <CountdownRenderer element={element} device={device} />;
  if (element.type === "button") {
    const url = sanitizeExternalUrl(element.url);
    return <a className={`generic-link-button align-${element.textAlign}`} href={url} target={element.target === "new" ? "_blank" : "_self"} rel={element.target === "new" ? "noreferrer" : undefined} aria-disabled={!url && !element.welcomeAction} onClick={!url ? (event) => event.preventDefault() : undefined} style={{ background: element.backgroundColor, color: element.textColor, borderColor: element.borderColor, borderWidth: element.borderWidth, borderRadius: element.borderRadius, fontFamily: element.fontFamily, fontSize: adapted ? `${(element.fontSize ?? 13) / PREVIEW_DEVICES[device].width * 100}cqw` : element.fontSize, fontWeight: element.fontWeight }}>{element.label}</a>;
  }
  return <SectionSurface element={element} layout={getElementLayout(element, device)} />;
}
