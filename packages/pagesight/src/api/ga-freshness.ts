export function gaFreshnessWarnings(endDates: string[], timeZone: unknown, collectedAt: string): string[] {
  if (typeof timeZone !== "string" || !timeZone)
    return ["GA property timezone is unavailable; report freshness could not be assessed."];
  let collectedDate: string;
  try {
    collectedDate = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(collectedAt));
  } catch {
    return ["GA property timezone or collection time is invalid; report freshness could not be assessed."];
  }
  return endDates.some((end) => Date.parse(collectedDate) - Date.parse(end) < 3 * 86400000)
    ? [
        "GA was collected fewer than three property-calendar days after the requested end date; recent data may still change. This precaution is not a finalization guarantee for older data.",
      ]
    : [];
}
