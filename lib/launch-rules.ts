/**
 * Going live — the words the screen and the server must agree on. No database
 * import, so the card in the browser reads the same phrase the action checks.
 */

/** Typed to confirm the launch: it is pressed once, and there is no second time. */
export const LAUNCH_PHRASE = 'تشغيل'

/** How far back the first real day may be set — a school that began the term before entering its data. */
export const LAUNCH_MAX_DAYS_BACK = 400

/** And how far ahead: a launch prepared on Thursday for the Sunday after. */
export const LAUNCH_MAX_DAYS_AHEAD = 60
