import type {
  AccountProfile,
  AccountProfileId,
  AccountServiceId,
  CalendarEventDraft
} from "./types";

export const ACCOUNT_PROFILES: AccountProfile[] = [
  {
    id: "work",
    name: "Work / Productivity",
    email: "waterfallingsound0827@gmail.com",
    purpose: "productivity",
    services: ["google_calendar", "gmail", "google_drive", "docs", "meetings"],
    connectionStatus: "not_connected",
    defaultBrowserProfile: "Work"
  },
  {
    id: "media",
    name: "Culture / Media",
    email: "samkyoung1004@gmail.com",
    purpose: "entertainment",
    services: ["youtube", "youtube_music", "netflix"],
    connectionStatus: "browser_session",
    defaultBrowserProfile: "Media"
  }
];

export function getAccountProfile(id: AccountProfileId): AccountProfile {
  return ACCOUNT_PROFILES.find((profile) => profile.id === id) || ACCOUNT_PROFILES[0];
}

export function routeAccountProfile(input: string): {
  profileId: AccountProfileId;
  service?: AccountServiceId;
  reason: string;
} {
  const lower = input.toLowerCase();

  if (/유튜브\s*뮤직|youtube music|음악|노래|music\.youtube/.test(lower)) {
    return {
      profileId: "media",
      service: "youtube_music",
      reason: "Music and entertainment requests use the media profile."
    };
  }

  if (/youtube|유튜브/.test(lower)) {
    return {
      profileId: "media",
      service: "youtube",
      reason: "YouTube requests use the media profile."
    };
  }

  if (/netflix|넷플릭스/.test(lower)) {
    return {
      profileId: "media",
      service: "netflix",
      reason: "Netflix requests use the media profile."
    };
  }

  if (/calendar|캘린더|일정|회의|미팅|스케줄/.test(lower)) {
    return {
      profileId: "work",
      service: "google_calendar",
      reason: "Scheduling requests use the work profile."
    };
  }

  if (/gmail|지메일|메일/.test(lower)) {
    return {
      profileId: "work",
      service: "gmail",
      reason: "Gmail requests use the work profile."
    };
  }

  if (/drive|드라이브|docs|문서|회의|meet/.test(lower)) {
    return {
      profileId: "work",
      service: "google_drive",
      reason: "Productivity requests use the work profile."
    };
  }

  return {
    profileId: "work",
    service: "google_search",
    reason: "General tasks default to the work profile unless they are media requests."
  };
}

export function buildServiceUrl(service: AccountServiceId, query = ""): string {
  const encoded = encodeURIComponent(query);

  if (service === "google_calendar") return "https://calendar.google.com/calendar/u/0/r";
  if (service === "gmail") return "https://mail.google.com/mail/u/0/";
  if (service === "google_drive") return "https://drive.google.com/drive/u/0/my-drive";
  if (service === "docs") return "https://docs.google.com/document/u/0/";
  if (service === "meetings") return "https://meet.google.com/";
  if (service === "youtube") return query ? `https://www.youtube.com/results?search_query=${encoded}` : "https://www.youtube.com/";
  if (service === "youtube_music") return query ? `https://music.youtube.com/search?q=${encoded}` : "https://music.youtube.com/";
  if (service === "netflix") return "https://www.netflix.com/";

  return query ? `https://www.google.com/search?q=${encoded}` : "https://www.google.com/";
}

export function parseCalendarEventDraft(input: string): CalendarEventDraft {
  const titleMatch = input.match(/(?:시에|에)\s*([^.,!?]+?)(?:\s*일정|\s*등록|\s*추가|$)/);
  const title = (titleMatch?.[1] || input.replace(/헤더|일정|등록|추가|캘린더|calendar/gi, ""))
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80) || "새 일정";
  const dateLabel = inferDateLabel(input);
  const timeLabel = inferTimeLabel(input);

  return {
    title,
    dateLabel,
    timeLabel,
    durationMinutes: 60
  };
}

export function inferCalendarRange(input: string): "today" | "tomorrow" | "week" | "range" {
  if (/내일|tomorrow/i.test(input)) return "tomorrow";
  if (/이번\s*주|week/i.test(input)) return "week";
  if (/\d{1,2}\s*월|\d{4}-\d{2}-\d{2}|range/i.test(input)) return "range";
  return "today";
}

function inferDateLabel(input: string): string {
  const explicit = input.match(/(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}-\d{1,2}-\d{1,2})/)?.[1];
  if (explicit) return explicit.replace(/\s+/g, " ");
  if (/내일|tomorrow/i.test(input)) return "tomorrow";
  if (/이번\s*주|week/i.test(input)) return "this week";
  return "today";
}

function inferTimeLabel(input: string): string | undefined {
  const match = input.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (!match) return undefined;

  return [match[1], `${match[2]}시`, match[3] ? `${match[3]}분` : ""]
    .filter(Boolean)
    .join(" ");
}
