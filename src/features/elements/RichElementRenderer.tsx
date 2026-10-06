import { ExternalLink, MapPin } from "lucide-react";
import type { ButtonElement, CalendarElement, CarouselElement, LocationElement, ScheduleElement, ScratchElement, SectionElement } from "../../types/editor";
import { PhotoCarouselRenderer } from "./PhotoCarouselRenderer";
import { ScratchCardRenderer } from "./ScratchCardRenderer";
import { directionsUrl, sanitizeExternalUrl } from "./safeUrl";
import type { PreviewDevice } from "../../config/previewDevices";
import { ScheduleRenderer } from "./ScheduleRenderer";
import { CalendarRenderer } from "./CalendarRenderer";
import { SectionSurface } from "./SectionSurface";
import { getElementLayout } from "../../utils/responsiveLayout";

export type RichElement = ScratchElement | CarouselElement | LocationElement | ScheduleElement | CalendarElement | ButtonElement | SectionElement;

export function RichElementRenderer({ element, device }: { element: RichElement; device: PreviewDevice }) {
  if (element.type === "scratch") return <ScratchCardRenderer element={element} device={device} />;
  if (element.type === "carousel") return <PhotoCarouselRenderer element={element} />;
  if (element.type === "location") {
    const mapUrl = Number.isFinite(element.latitude) && Number.isFinite(element.longitude)
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${element.longitude! - .015}%2C${element.latitude! - .01}%2C${element.longitude! + .015}%2C${element.latitude! + .01}&layer=mapnik&marker=${element.latitude}%2C${element.longitude}`
      : undefined;
    return <article className="location-card" style={{ background: element.backgroundColor, color: element.textColor }}>
      {mapUrl ? <iframe title={`Carte de ${element.venueName}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" /> : <div className="location-map-placeholder"><MapPin size={32} style={{ color: element.accentColor }} /><span>{element.address}</span></div>}
      <div className="location-copy"><small>Nous rejoindre</small><h3>{element.venueName}</h3><address>{element.address}</address>{element.details && <p>{element.details}</p>}<a href={directionsUrl(element.address)} target="_blank" rel="noreferrer" style={{ background: element.accentColor }}>{element.buttonLabel}<ExternalLink size={13} /></a></div>
    </article>;
  }
  if (element.type === "schedule") return <ScheduleRenderer element={element} device={device} />;
  if (element.type === "calendar") return <CalendarRenderer element={element} device={device} />;
  if (element.type === "button") {
    const url = sanitizeExternalUrl(element.url);
    return <a className={`generic-link-button align-${element.textAlign}`} href={url} target={element.target === "new" ? "_blank" : "_self"} rel={element.target === "new" ? "noreferrer" : undefined} aria-disabled={!url && !element.welcomeAction} onClick={!url ? (event) => event.preventDefault() : undefined} style={{ background: element.backgroundColor, color: element.textColor, borderColor: element.borderColor, borderWidth: element.borderWidth, borderRadius: element.borderRadius, fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight }}>{element.label}</a>;
  }
  return <SectionSurface element={element} layout={getElementLayout(element, device)} />;
}
