const PATHS: Record<string, string> = {
  menu: "M3 6h18M3 12h18M3 18h18",
  sidebar: "M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 4v16",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  forward: "M9 5l7 7-7 7",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  auto: "M12 3a9 9 0 100 18V3z M12 3a9 9 0 010 18",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  inbox: "M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5",
  revise: "M20 12a8 8 0 11-2.3-5.7M20 4v5h-5",
  cards: "M6 6h11a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2zM8 3h11a2 2 0 012 2v11",
  atlas: "M4 19V5l8 4 8-4v14l-8 4zM12 9v14",
  sparkle: "M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z",
  check: "M5 12l5 5 9-10",
  chevron: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  signout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2",
  // A gear (after Lucide's "settings", ISC licence).
  settings:
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  // A pen, for writing a Mains answer.
  pen: "M4 20l1-5L16 4l4 4L9 19zM14 6l4 4M4 20h6",
  // A marked sheet, for Mains feedback.
  feedback: "M7 3h10l2 2v16H5V5zM9 8h6M9 12l2 2 4-4M9 17h4",
  // A camera, for photographing pages.
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  // A quarter turn, for straightening a photo.
  turn: "M20 12a8 8 0 11-2.3-5.7M20 4v5h-5",
  // A flame, for the news heat map.
  heat: "M12 3c.6 3.2 4.5 5.2 4.5 10a4.5 4.5 0 0 1-9 0c0-2 .9-3.4 2.2-4.4 0 1.7.9 2.8 2.1 2.8-.4-3 0-5.6.2-8.4z",
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
