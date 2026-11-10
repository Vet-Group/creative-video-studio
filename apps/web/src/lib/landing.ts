// The pages a team can be set to land its members on after login (AdminTeams, teams.default_tool); the key is the route, the value its Vietnamese label.
export const LANDINGS = {
  '/explore': 'Khám phá',
  '/try-on': 'Thử đồ',
  '/image-generation': 'Tạo ảnh',
  '/create': 'Tạo video',
  '/marketing-studio': 'Marketing Studio',
  '/apps': 'Ứng dụng',
} as const;

export type Landing = keyof typeof LANDINGS;

export const isLanding = (v: unknown): v is Landing => typeof v === 'string' && v in LANDINGS;
