/**
 * RUET residential halls — the single source of truth for hall names.
 *
 * Source: the RUET provosts list (hum.ruet.ac.bd) screenshots
 * provided by Jidan on 2026-11-24. Use ONLY these names — do not
 * add halls from older syllabus lists or secondary sources.
 *
 * The halls, exactly as in those screenshots (the screenshots show
 * "Female Male Hall-1" / "Female Male Hall-2" — read as
 * "Female Hall-1" / "Female Hall-2"):
 *   1. Shahid President Ziaur Rahman Hall
 *   2. Shahid Lt. Selim Hall
 *   3. Sher-e-Bangla A K Fazlul Huq Hall
 *   4. Shahid Abdul Hamid Hall
 *   5. Shahid Shahidul Islam Hall
 *   6. Tin Shed Hall (Extension)
 *   7. Male Hall-1
 *   8. Male Hall-2
 *   9. Male Hall-3
 *  10. Female Hall-1
 *  11. Female Hall-2
 *
 * NOT included as named options, by design: Deshratna Sheikh Hasina
 * Hall and Bangabandhu Sheikh Mujibur Rahman Hall were in an earlier
 * build (from the 2024 syllabus list of seven halls) but are NOT in
 * the provosts-list screenshots above, so they were removed. A
 * student in such a hall should choose "Other" for now. If RUET
 * publishes an updated official hall list, add the verified names
 * here — do not invent them.
 */
export const HALLS = [
  "Shahid President Ziaur Rahman Hall",
  "Shahid Lt. Selim Hall",
  "Sher-e-Bangla A K Fazlul Huq Hall",
  "Shahid Abdul Hamid Hall",
  "Shahid Shahidul Islam Hall",
  "Tin Shed Hall (Extension)",
  "Male Hall-1",
  "Male Hall-2",
  "Male Hall-3",
  "Female Hall-1",
  "Female Hall-2",
  "Non-residential / Day Scholar",
  "Other",
] as const;

export type Hall = (typeof HALLS)[number];

export function isHall(value: unknown): value is Hall {
  return typeof value === "string" && (HALLS as readonly string[]).includes(value);
}
