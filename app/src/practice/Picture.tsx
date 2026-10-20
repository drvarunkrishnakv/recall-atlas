// A card's or puzzle's picture: an image file, or a small map the app draws itself ("svg:<id>").
// Real maps come as image files; the drawn ones are made-up sketches for the fixture and tests.
import type { ReactNode } from "react";

const DRAWN: Record<string, (alt: string) => ReactNode> = {
  // A made-up coast: a peninsula on the left, an island on the right, and a strait between.
  "sample-coast": (alt) => (
    <svg viewBox="0 0 380 300" role="img" aria-label={alt}>
      <rect width="380" height="300" fill="#1d3440" />
      <path d="M30 0h140l25 120-25 110-35 70H95l30-110-35-100z" fill="#4a5a3a" />
      <path d="M230 140 360 40l20 15v245H270z" fill="#4a5a3a" />
    </svg>
  ),
};

export function Picture({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  if (src.startsWith("svg:")) {
    const draw = DRAWN[src.slice(4)];
    return (
      <div className={`pc-picture ${className}`}>{draw ? draw(alt) : <span className="pc-noimg">{alt}</span>}</div>
    );
  }
  return <img className={`pc-picture ${className}`} src={src} alt={alt} loading="lazy" draggable={false} />;
}
