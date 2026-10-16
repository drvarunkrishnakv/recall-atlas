const PATHS: Record<string, string> = {
  menu: "M3 6h18M3 12h18M3 18h18",
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
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
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
