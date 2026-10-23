// The accounts the e2e server creates and the specs sign in with. Each spec uses its own Member so their jobs do not mix.
export const PASSWORD = 'e2e-password-1';

export const USERS = {
  member1: { email: 'member1@e2e.test', name: 'E2E Member 1', role: 'member' },
  member2: { email: 'member2@e2e.test', name: 'E2E Member 2', role: 'member' },
  member3: { email: 'member3@e2e.test', name: 'E2E Member 3', role: 'member' },
  member4: { email: 'member4@e2e.test', name: 'E2E Member 4', role: 'member' },
  member5: { email: 'member5@e2e.test', name: 'E2E Member 5', role: 'member' },
  member6: { email: 'member6@e2e.test', name: 'E2E Member 6', role: 'member' },
  member7: { email: 'member7@e2e.test', name: 'E2E Member 7', role: 'member' },
  member8: { email: 'member8@e2e.test', name: 'E2E Member 8', role: 'member' },
  admin: { email: 'admin@e2e.test', name: 'E2E Admin', role: 'admin' },
} as const;

export type UserKey = keyof typeof USERS;
