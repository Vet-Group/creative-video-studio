// The once-a-day reminder to link Lark (components/LarkLinkPrompt.tsx).

/** The localStorage key that holds the Vietnam day the reminder was last shown. */
export const LARK_PROMPT_KEY = 'cvs.larkPrompt.lastShown';

/** The Vietnam calendar day of `at`, as YYYY-MM-DD. */
export const vnDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(at);

/** Whether the reminder is due: it was not shown yet on `today` (a Vietnam day from vnDay). */
export const larkPromptDue = (lastShown: string | null, today: string) => lastShown !== today;

/** Who gets the reminder: Lark sign-in is on, the user is a person (not a system account) and has no linked Lark account yet. */
export const needsLarkPrompt = (o: { larkEnabled: boolean; system: boolean; providers: string[] }) => o.larkEnabled && !o.system && !o.providers.includes('lark');
