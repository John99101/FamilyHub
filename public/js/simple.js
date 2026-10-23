// Simple mode for grandparents: large text and only the essentials (today's
// dates, big call buttons, the newest messages, the chat). It is switched on
// per device (stored in this browser only), in Settings or on the Start page.
const KEY = 'familyhub-simple';

/** Pages that exist in simple mode; every other address leads to the Start page. */
export const SIMPLE_ROUTES = new Set(['start', 'chat']);

export function isSimpleMode() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Switches simple mode on or off for this device and reloads the app. */
export function setSimpleMode(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the choice cannot be kept on this device
  }
  location.hash = '#/start';
  location.reload();
}
