// CSE 2027 dates from UPSC's calendar (published May 2026). Local calendar days, "YYYY-MM-DD".
import { today } from "./progress.ts";

export const PRELIMS_2027 = "2027-05-23";
export const MAINS_2027 = "2027-08-20";

const dayNum = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5;

/** Whole days from `from` to `day` (0 on the day itself, negative after it). */
export const daysUntil = (day: string, from = today()) => dayNum(day) - dayNum(from);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Sunday 23 May 2027" (spelt out here, because browsers differ on the comma). */
export function longDate(day: string): string {
  const d = new Date(dayNum(day) * 864e5);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
