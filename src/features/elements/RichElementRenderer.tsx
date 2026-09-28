import { ExternalLink, MapPin } from "lucide-react";
import type { ButtonElement, CarouselElement, LocationElement, ScheduleElement, ScratchElement, SectionElement } from "../../types/editor";
import { PhotoCarouselRenderer } from "./PhotoCarouselRenderer";
import { ScratchCardRenderer } from "./ScratchCardRenderer";
import { directionsUrl, sanitizeExternalUrl } from "./safeUrl";

export type RichElement = ScratchElement | CarouselElement | LocationElement | ScheduleElement | ButtonElement | SectionElement;

const pageBackground = (element: SectionElement) => element.background.type === "gradient" && element.background.gradient
  ? element.background.gradient.type === "radial"
    ? `radial-gradient(circle, ${element.background.gradient.color1}, ${element.background.gradient.color2})`
    : `linear-gradient(${element.background.gradient.angle ?? 135}deg, ${element.background.gradient.color1}, ${element.background.gradient.color2})`
  : element.background.type === "image" ? `url(${element.background.imageUrl}) center / cover` : element.background.color;

export function RichElementRenderer({ element }: { element: RichElement }) {
  if (element.type === "scratch") return <ScratchCardRenderer element={element} />;
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
  if (element.type === "schedule") return <article className={`schedule-block schedule-${element.displayStyle}`} style={{ background: element.backgroundColor, color: element.textColor, "--schedule-time": element.timeColor, "--schedule-line": element.lineColor, "--schedule-accent": element.accentColor } as React.CSSProperties}>
    {element.items.map((item) => <div className="schedule-item" key={item.id}><span className="schedule-dot">{item.icon}</span><time>{item.time}</time><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div></div>)}
  </article>;
  if (element.type === "button") {
    const url = sanitizeExternalUrl(element.url);
    return <a className={`generic-link-button align-${element.textAlign}`} href={url} target={element.target === "new" ? "_blank" : "_self"} rel={element.target === "new" ? "noreferrer" : undefined} aria-disabled={!url && !element.welcomeAction} onClick={!url ? (event) => event.preventDefault() : undefined} style={{ background: element.backgroundColor, color: element.textColor, borderColor: element.borderColor, borderWidth: element.borderWidth, borderRadius: element.borderRadius, fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight }}>{element.label}</a>;
  }
  return <div className="document-section-element" style={{ background: pageBackground(element), padding: element.padding, borderRadius: element.cornerRadius }} />;
}
