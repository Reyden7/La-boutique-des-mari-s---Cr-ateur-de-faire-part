import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CarouselElement } from "../../types/editor";

export function PhotoCarouselRenderer({ element }: { element: CarouselElement }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | undefined>(undefined);
  const count = element.images.length;
  const go = (next: number) => setIndex(count ? (next + count) % count : 0);
  useEffect(() => {
    if (!element.autoplay || count < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), Math.max(1, element.interval) * 1000);
    return () => window.clearInterval(timer);
  }, [count, element.autoplay, element.interval]);
  useEffect(() => { if (index >= count) setIndex(Math.max(0, count - 1)); }, [count, index]);
  if (!count) return <div className="carousel-empty">Ajoutez des photos</div>;
  return <div className={`photo-carousel transition-${element.transition}`} style={{ borderRadius: element.cornerRadius }}
    onPointerDown={(e) => { touchStart.current = e.clientX; }}
    onPointerUp={(e) => { if (touchStart.current === undefined) return; const delta = e.clientX - touchStart.current; if (Math.abs(delta) > 35) go(index + (delta < 0 ? 1 : -1)); touchStart.current = undefined; }}>
    <img key={element.images[index].id} src={element.images[index].url} alt={element.images[index].alt} loading="lazy" style={{ objectFit: element.imageFit }} />
    {element.showArrows && count > 1 && <><button className="carousel-arrow previous" onClick={(e) => { e.stopPropagation(); go(index - 1); }} aria-label="Photo précédente"><ChevronLeft /></button><button className="carousel-arrow next" onClick={(e) => { e.stopPropagation(); go(index + 1); }} aria-label="Photo suivante"><ChevronRight /></button></>}
    {element.showDots && count > 1 && <div className="carousel-dots">{element.images.map((image, dot) => <button key={image.id} className={dot === index ? "active" : ""} onClick={(e) => { e.stopPropagation(); go(dot); }} aria-label={`Photo ${dot + 1}`} />)}</div>}
  </div>;
}
