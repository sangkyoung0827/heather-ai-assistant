import type { AccountProfileId, AccountServiceId } from "./types";
import { buildServiceUrl, routeAccountProfile } from "./account-profiles";

export type BrowserAutomationCapability = "url_navigation" | "dom_driver_pending" | "coordinate_click_blocked";

export interface BrowserSiteDriver {
  service: AccountServiceId;
  label: string;
  profileId: AccountProfileId;
  capabilities: BrowserAutomationCapability[];
  buildUrl(query?: string): string;
}

export const BLOCKED_BROWSER_AUTOMATION = [
  "payments",
  "purchases",
  "account_settings",
  "password_entry",
  "security_settings",
  "financial_websites",
  "stock_trading",
  "banking"
];

export const BROWSER_SITE_DRIVERS: BrowserSiteDriver[] = [
  siteDriver("google_search", "Google Search", "work"),
  siteDriver("google_calendar", "Google Calendar", "work"),
  siteDriver("gmail", "Gmail", "work"),
  siteDriver("youtube", "YouTube", "media"),
  siteDriver("youtube_music", "YouTube Music", "media"),
  siteDriver("netflix", "Netflix", "media")
];

export function createBrowserActionTarget(input: string, query = ""): {
  profileId: AccountProfileId;
  service: AccountServiceId;
  url: string;
  fallbackMessage: string;
} {
  const route = routeAccountProfile(input);
  const service = route.service || "google_search";
  const driver = BROWSER_SITE_DRIVERS.find((candidate) => candidate.service === service);

  return {
    profileId: route.profileId,
    service,
    url: driver?.buildUrl(query) || buildServiceUrl(service, query),
    fallbackMessage:
      "URL navigation is enabled. DOM click automation will be added only for allowlisted safe controls."
  };
}

function siteDriver(
  service: AccountServiceId,
  label: string,
  profileId: AccountProfileId
): BrowserSiteDriver {
  return {
    service,
    label,
    profileId,
    capabilities: ["url_navigation", "dom_driver_pending"],
    buildUrl: (query = "") => buildServiceUrl(service, query)
  };
}
