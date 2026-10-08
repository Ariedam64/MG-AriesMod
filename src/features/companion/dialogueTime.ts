// Lines tied to the player's clock and calendar: the part of the day, the
// weekend, the holiday. Mixed into the free lines when he is talked to, and
// used by the greetings and the midnight reaction.
//
// Pure: the date is passed in.

import { EmoteType } from "./emoteTypes";

export type DayPart = "night" | "early" | "morning" | "afternoon" | "evening" | "late";

/** The player's LOCAL hour (0 to 23): `Date#getHours` already follows their time zone. */
export function dayPart(hour: number): DayPart {
  if (hour < 5) return "night";
  if (hour < 8) return "early";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "late";
}

/** Lines mixed into the free ones depending on the time at the player's. */
const DAY_PART_LINES: Record<DayPart, readonly string[]> = {
  night: [
    "Shouldn't you be asleep?",
    "The garden's so quiet at night.",
    "Night owl, huh?",
    "I'm not tired. You're tired.",
    "Midnight snacks count as gardening, right?",
  ],
  early: ["Early bird gets the best seeds.", "Morning already? I barely slept.", "Nothing beats an early start."],
  morning: ["Coffee first, crops second.", "Fresh morning, fresh sprouts.", "Morning, boss! Ready for the day?"],
  afternoon: ["Lunch break in the garden? Good call.", "Nice afternoon for it.", "Afternoon sun, happy plants."],
  evening: ["Evening already? Time flies in here.", "Love the evening light on the garden.", "One more harvest before dinner?"],
  late: ["It's getting late, boss.", "Late night gardening session?", "Don't stay up too late, okay?"],
};

export function dayPartLines(hour: number): readonly string[] {
  return DAY_PART_LINES[dayPart(hour)];
}

export type Holiday = "newyear" | "valentine" | "aprilfools" | "halloween" | "christmas" | "newyearseve";

/** Today's holiday, at the player's LOCAL date. Easter moves every year and is left out. */
export function holidayOf(date: Date): Holiday | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 1 && d === 1) return "newyear";
  if (m === 2 && d === 14) return "valentine";
  if (m === 4 && d === 1) return "aprilfools";
  if (m === 10 && d === 31) return "halloween";
  if (m === 12 && (d === 24 || d === 25)) return "christmas";
  if (m === 12 && d === 31) return "newyearseve";
  return null;
}

const HOLIDAY_LINES: Record<Holiday, readonly string[]> = {
  newyear: ["Happy New Year! New year, new crops.", "First harvest of the year, let's make it count!"],
  valentine: ["Happy Valentine's Day! I got you a sprout.", "Roses are red, crops are green, best gardener I've ever seen."],
  aprilfools: ["Did you know crops can talk? April fools!", "I planted a joke. It hasn't grown yet."],
  halloween: ["Happy Halloween! Any spooky crops tonight?", "Boo! Did I scare you?"],
  christmas: ["Merry Christmas! Hope Santa brings you rare seeds.", "Best present ever: a full garden."],
  newyearseve: ["Last day of the year! Let's end it with a big harvest.", "Any resolutions? Mine is more gardening."],
};

/** The greeting on a holiday, and the midnight announcement when one begins. */
export const HOLIDAY_GREETINGS: Record<Holiday, readonly string[]> = {
  newyear: ["Happy New Year, boss!", "Happy New Year! Here's to a great harvest."],
  valentine: ["Happy Valentine's Day!", "Aww, spending Valentine's Day with me?"],
  aprilfools: ["Welcome back! Your garden turned into a desert. April fools!", "Happy April Fools! Don't trust anything I say today."],
  halloween: ["Happy Halloween! Trick or treat?", "Spooky season is here! Happy Halloween!"],
  christmas: ["Merry Christmas!", "Merry Christmas, boss! Thanks for visiting me."],
  newyearseve: ["Last day of the year! Glad you're here.", "Happy New Year's Eve!"],
};

const WEEKEND_LINES: readonly string[] = ["Weekend gardening, the best kind.", "No work today? Perfect."];
const SUNDAY_LINES: readonly string[] = ["Lazy Sunday in the garden."];

/**
 * Time of day and calendar lines, mixed into the free ones when he is talked
 * to: the part of the day, the weekend, today's holiday.
 */
export function timeLines(date: Date): string[] {
  const out = [...dayPartLines(date.getHours())];
  const day = date.getDay();
  if (day === 0 || day === 6) out.push(...WEEKEND_LINES);
  if (day === 0) out.push(...SUNDAY_LINES);
  const holiday = holidayOf(date);
  if (holiday) out.push(...HOLIDAY_LINES[holiday]);
  return out;
}

/** The pose of the time and calendar lines, so `lineEmote` knows them too. */
export const TIME_LINE_EMOTES: Record<string, EmoteType> = {
  "Shouldn't you be asleep?": EmoteType.Questioning,
  "Night owl, huh?": EmoteType.Laughing,
  "I'm not tired. You're tired.": EmoteType.Laughing,
  "Midnight snacks count as gardening, right?": EmoteType.Questioning,
  "Early bird gets the best seeds.": EmoteType.Clapping,
  "Morning already? I barely slept.": EmoteType.Crying,
  "Morning, boss! Ready for the day?": EmoteType.Questioning,
  "Lunch break in the garden? Good call.": EmoteType.Clapping,
  "Love the evening light on the garden.": EmoteType.Love,
  "One more harvest before dinner?": EmoteType.Questioning,
  "Late night gardening session?": EmoteType.Questioning,
  "Weekend gardening, the best kind.": EmoteType.Love,
  "No work today? Perfect.": EmoteType.Clapping,
  "Lazy Sunday in the garden.": EmoteType.Love,
  "Happy New Year! New year, new crops.": EmoteType.Clapping,
  "First harvest of the year, let's make it count!": EmoteType.Clapping,
  "Happy Valentine's Day! I got you a sprout.": EmoteType.Love,
  "Roses are red, crops are green, best gardener I've ever seen.": EmoteType.Love,
  "Did you know crops can talk? April fools!": EmoteType.Laughing,
  "I planted a joke. It hasn't grown yet.": EmoteType.Laughing,
  "Happy Halloween! Any spooky crops tonight?": EmoteType.Questioning,
  "Boo! Did I scare you?": EmoteType.Laughing,
  "Merry Christmas! Hope Santa brings you rare seeds.": EmoteType.Love,
  "Best present ever: a full garden.": EmoteType.Love,
  "Last day of the year! Let's end it with a big harvest.": EmoteType.Clapping,
  "Any resolutions? Mine is more gardening.": EmoteType.Questioning,
};
