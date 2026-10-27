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
  member9: { email: 'member9@e2e.test', name: 'E2E Member 9', role: 'member' },
  member10: { email: 'member10@e2e.test', name: 'E2E Member 10', role: 'member' },
  member11: { email: 'member11@e2e.test', name: 'E2E Member 11', role: 'member' },
  // Named so that no earlier spec's "E2E Member 1" text match picks them up.
  appsa: { email: 'appsa@e2e.test', name: 'E2E Apps A', role: 'member' },
  appsb: { email: 'appsb@e2e.test', name: 'E2E Apps B', role: 'member' },
  appsc: { email: 'appsc@e2e.test', name: 'E2E Apps C', role: 'member' },
  mkta: { email: 'mkta@e2e.test', name: 'E2E Mkt A', role: 'member' },
  mktb: { email: 'mktb@e2e.test', name: 'E2E Mkt B', role: 'member' },
  mktc: { email: 'mktc@e2e.test', name: 'E2E Mkt C', role: 'member' },
  mktd: { email: 'mktd@e2e.test', name: 'E2E Mkt D', role: 'member' },
  mkte: { email: 'mkte@e2e.test', name: 'E2E Mkt E', role: 'member' },
  auda: { email: 'auda@e2e.test', name: 'E2E Audio A', role: 'member' },
  audb: { email: 'audb@e2e.test', name: 'E2E Audio B', role: 'member' },
  admin: { email: 'admin@e2e.test', name: 'E2E Admin', role: 'admin' },
} as const;

export type UserKey = keyof typeof USERS;
