// The pages a team can be set to land its members on after login (AdminTeams, teams.default_tool); the key is the route, the value its Vietnamese label.
export const LANDINGS = {
  '/explore': 'Khám phá',
  '/try-on': 'Thử đồ',
  '/image-generation': 'Tạo ảnh',
  '/create': 'Tạo video',
  '/marketing-studio': 'Marketing Studio',
  '/apps': 'Ứng dụng',
} as const;

/** The cookie that keeps the member's landing page for src/proxy.ts, so `/` redirects with no render or database read; the app layout refreshes it on every page. */
export const HOME_COOKIE = 'cvs-home';

export type Landing = keyof typeof LANDINGS;

export const isLanding = (v: unknown): v is Landing => typeof v === 'string' && v in LANDINGS;
