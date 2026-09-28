import { VolvoCardLabels } from "./types";

type TextLabels = Omit<Required<VolvoCardLabels>, "minutes">;

export const DEFAULT_LABELS: TextLabels = {
  unlocked: "Unlocked",
  locked: "Locked",
  scheduled: "Scheduled",
  charging: "Charging",
  lock: "Lock",
  unlock: "Unlock",
  climate: "Climate",
  electric: "electric",
  fuel: "fuel",
  fuel_level: "Fuel",
  time_left: "left",
  start_car: "Start car",
  stop_car: "Stop car",
  more: "More",
  flash: "Flash lights",
  honk: "Honk",
  honk_flash: "Honk & flash",
  confirm: "Tap again to confirm",
  charge: "Charge",
  charge_done_at: "Done at",
  charge_plugged_in: "Plugged in",
  charge_not_plugged_in: "Not plugged in",
  climate_running: "Running",
  climate_not_running: "Not running",
  parked_today: "Last parked today at",
  parked_yesterday: "Last parked yesterday at",
  parked_on: "Last parked",
  target_soc: "Charge limit",
  charge_current_limit: "Charge current",
  done: "Done",
};

export function label(labels: VolvoCardLabels | undefined, key: keyof TextLabels): string {
  return (labels?.[key] as string | undefined) ?? DEFAULT_LABELS[key];
}

/** "min" by default; with plural forms, picks the one for `n` in `locale` (e.g. pl: 1 minuta, 2 minuty, 50 minut). */
export function minutesWord(labels: VolvoCardLabels | undefined, n: number, locale: string): string {
  const m = labels?.minutes;
  if (!m) return "min";
  if (typeof m === "string") return m;
  let cat = "other";
  try {
    cat = new Intl.PluralRules(locale).select(n);
  } catch (_e) {
    /* unknown locale: fall back to "other" */
  }
  return m[cat] ?? m.other ?? m.many ?? Object.values(m)[0] ?? "min";
}
