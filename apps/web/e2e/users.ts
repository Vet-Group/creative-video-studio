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
  imgp: { email: 'imgp@e2e.test', name: 'E2E Img P', role: 'member' },
  tplpos: { email: 'tplpos@e2e.test', name: 'E2E Tpl Pos', role: 'member' },
  member11: { email: 'member11@e2e.test', name: 'E2E Member 11', role: 'member' },
  // Named so that no earlier spec's "E2E Member 1" text match picks them up.
  appsa: { email: 'appsa@e2e.test', name: 'E2E Apps A', role: 'member' },
  appsb: { email: 'appsb@e2e.test', name: 'E2E Apps B', role: 'member' },
  appsc: { email: 'appsc@e2e.test', name: 'E2E Apps C', role: 'member' },
  mkta: { email: 'mkta@e2e.test', name: 'E2E Mkt A', role: 'member' },
  mktb: { email: 'mktb@e2e.test', name: 'E2E Mkt B', role: 'member' },
  mktc: { email: 'mktc@e2e.test', name: 'E2E Mkt C', role: 'member' },
  mktp: { email: 'mktp@e2e.test', name: 'E2E Mkt P', role: 'member' },
  mktd: { email: 'mktd@e2e.test', name: 'E2E Mkt D', role: 'member' },
  mkte: { email: 'mkte@e2e.test', name: 'E2E Mkt E', role: 'member' },
  mktf: { email: 'mktf@e2e.test', name: 'E2E Mkt F', role: 'member' },
  mktg: { email: 'mktg@e2e.test', name: 'E2E Mkt G', role: 'member' },
  reusea: { email: 'reusea@e2e.test', name: 'E2E Reuse A', role: 'member' },
  tpla: { email: 'tpla@e2e.test', name: 'E2E Templates A', role: 'member' },
  tplb: { email: 'tplb@e2e.test', name: 'E2E Templates B', role: 'member' },
  usea: { email: 'usea@e2e.test', name: 'E2E Use A', role: 'member' },
  useb: { email: 'useb@e2e.test', name: 'E2E Use B', role: 'member' },
  sugga: { email: 'sugga@e2e.test', name: 'E2E Suggest A', role: 'member' },
  hista: { email: 'hista@e2e.test', name: 'E2E History A', role: 'member' },
  auda: { email: 'auda@e2e.test', name: 'E2E Audio A', role: 'member' },
  audb: { email: 'audb@e2e.test', name: 'E2E Audio B', role: 'member' },
  cvexa: { email: 'cvexa@e2e.test', name: 'E2E Create Examples A', role: 'member' },
  tryexa: { email: 'tryexa@e2e.test', name: 'E2E Try On Examples A', role: 'member' },
  imgexa: { email: 'imgexa@e2e.test', name: 'E2E Image Examples A', role: 'member' },
  chipa: { email: 'chipa@e2e.test', name: 'E2E Chips A', role: 'member' },
  vidfrom: { email: 'vidfrom@e2e.test', name: 'E2E Video From Image', role: 'member' },
  pickera: { email: 'pickera@e2e.test', name: 'E2E Try On Pickers', role: 'member' }, // its own Try On job gives it My models, which would hide another user's slot samples
  // memory.e2e: remembered settings (rema runs, remb never does, remc runs on a model that is then switched off).
  rema: { email: 'rema@e2e.test', name: 'E2E Remember A', role: 'member' },
  remb: { email: 'remb@e2e.test', name: 'E2E Remember B', role: 'member' },
  remc: { email: 'remc@e2e.test', name: 'E2E Remember C', role: 'member' },
  remd: { email: 'remd@e2e.test', name: 'E2E Remember D', role: 'member' },
  custa: { email: 'custa@e2e.test', name: 'E2E Custom A', role: 'member' },
  custb: { email: 'custb@e2e.test', name: 'E2E Custom B', role: 'member' },
  // The Run guard, Ctrl+Enter, recent prompts, the prompt box and the zip download (upgrades spec), one account per part.
  upga: { email: 'upga@e2e.test', name: 'E2E Upgrades A', role: 'member' },
  upgb: { email: 'upgb@e2e.test', name: 'E2E Upgrades B', role: 'member' },
  upgc: { email: 'upgc@e2e.test', name: 'E2E Upgrades C', role: 'member' },
  upgd: { email: 'upgd@e2e.test', name: 'E2E Upgrades D', role: 'member' },
  // refresh.e2e: pages that reload on a finished job or a return to the tab (fresha watches, freshb makes the jobs it must notice).
  fresha: { email: 'fresha@e2e.test', name: 'E2E Fresh A', role: 'member' },
  freshb: { email: 'freshb@e2e.test', name: 'E2E Fresh B', role: 'member' },
  admin: { email: 'admin@e2e.test', name: 'E2E Admin', role: 'admin' },
} as const;

export type UserKey = keyof typeof USERS;
