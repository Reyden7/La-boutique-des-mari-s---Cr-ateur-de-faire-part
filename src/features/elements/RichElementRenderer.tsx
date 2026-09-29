import { ExternalLink, MapPin } from "lucide-react";
import type { ButtonElement, CarouselElement, LocationElement, ScheduleElement, ScratchElement, SectionElement } from "../../types/editor";
import { PhotoCarouselRenderer } from "./PhotoCarouselRenderer";
import { ScratchCardRenderer } from "./ScratchCardRenderer";
import { directionsUrl, sanitizeExternalUrl } from "./safeUrl";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { getElementLayout } from "../../utils/responsiveLayout";
import { DEFAULT_SCHEDULE_STYLE, resolveScheduleTypography } from "../../config/scheduleStyle";

export type RichElement = ScratchElement | CarouselElement | LocationElement | ScheduleElement | ButtonElement | SectionElement;

const pageBackground = (element: SectionElement) => element.background.type === "gradient" && element.background.gradient
  ? element.background.gradient.type === "radial"
    ? `radial-gradient(circle, ${element.background.gradient.color1}, ${element.background.gradient.color2})`
    : `linear-gradient(${element.background.gradient.angle ?? 135}deg, ${element.background.gradient.color1}, ${element.background.gradient.color2})`
  : element.background.type === "image" ? `url(${element.background.imageUrl}) center / cover` : element.background.color;

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
  if (element.type === "schedule") {
    const viewport = PREVIEW_DEVICES[device];
    const typography = resolveScheduleTypography(element, getElementLayout(element, device));
    const logicalSize = (value: number) => `${value / viewport.width * 100}cqw`;
    return <article className={`schedule-block schedule-${element.displayStyle}`} style={{
      background: element.backgroundColor,
      color: element.textColor,
      "--schedule-time": element.timeColor,
      "--schedule-title": element.titleColor ?? element.textColor,
      "--schedule-description": element.descriptionColor ?? element.textColor,
      "--schedule-line": element.lineColor,
      "--schedule-accent": element.accentColor,
      "--schedule-time-size": logicalSize(typography.timeFontSize),
      "--schedule-title-size": logicalSize(typography.titleFontSize),
      "--schedule-description-size": logicalSize(typography.descriptionFontSize),
      "--schedule-padding": logicalSize(DEFAULT_SCHEDULE_STYLE.contentPadding),
      "--schedule-marker-size": logicalSize(11),
      "--schedule-time-column": logicalSize(58),
      "--schedule-column-gap": logicalSize(8),
      "--schedule-line-x": logicalSize(30),
      "--schedule-marker-border": logicalSize(2),
      "--schedule-elegant-marker-column": logicalSize(18),
      "--schedule-elegant-gap": logicalSize(12),
      "--schedule-elegant-marker-size": logicalSize(9),
    } as React.CSSProperties}>
      {element.items.map((item) => <div className="schedule-item" key={item.id}><span className="schedule-dot">{item.icon}</span><time>{item.time}</time><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div></div>)}
    </article>;
  }
  if (element.type === "button") {
    const url = sanitizeExternalUrl(element.url);
    return <a className={`generic-link-button align-${element.textAlign}`} href={url} target={element.target === "new" ? "_blank" : "_self"} rel={element.target === "new" ? "noreferrer" : undefined} aria-disabled={!url && !element.welcomeAction} onClick={!url ? (event) => event.preventDefault() : undefined} style={{ background: element.backgroundColor, color: element.textColor, borderColor: element.borderColor, borderWidth: element.borderWidth, borderRadius: element.borderRadius, fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight }}>{element.label}</a>;
  }
  return <div className="document-section-element" style={{ background: pageBackground(element), padding: element.padding, borderRadius: element.cornerRadius }} />;
}
