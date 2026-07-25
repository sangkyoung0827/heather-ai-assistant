export const DIRECT_COMMANDS_CHANGED_EVENT = "heather:direct-commands-changed";

export function notifyDirectCommandsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DIRECT_COMMANDS_CHANGED_EVENT));
  }
}
