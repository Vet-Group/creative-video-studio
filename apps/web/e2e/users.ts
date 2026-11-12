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
  stocka: { email: 'stocka@e2e.test', name: 'E2E Stock A', role: 'member' },
  appsc: { email: 'appsc@e2e.test', name: 'E2E Apps C', role: 'member' },
  mkta: { email: 'mkta@e2e.test', name: 'E2E Mkt A', role: 'member' },
  mktb: { email: 'mktb@e2e.test', name: 'E2E Mkt B', role: 'member' },
  mktc: { email: 'mktc@e2e.test', name: 'E2E Mkt C', role: 'member' },
  mktp: { email: 'mktp@e2e.test', name: 'E2E Mkt P', role: 'member' },
  mktd: { email: 'mktd@e2e.test', name: 'E2E Mkt D', role: 'member' },
  mkte: { email: 'mkte@e2e.test', name: 'E2E Mkt E', role: 'member' },
  mktf: { email: 'mktf@e2e.test', name: 'E2E Mkt F', role: 'member' },
  mktg: { email: 'mktg@e2e.test', name: 'E2E Mkt G', role: 'member' },
  mktv: { email: 'mktv@e2e.test', name: 'E2E Mkt V', role: 'member' }, // marketing-video.e2e: the reference video
  mktw: { email: 'mktw@e2e.test', name: 'E2E Mkt W', role: 'member' }, // marketing-video.e2e: the example hook
  mktx: { email: 'mktx@e2e.test', name: 'E2E Mkt X', role: 'member' }, // marketing-video.e2e: the reference video from History
  mkth: { email: 'mkth@e2e.test', name: 'E2E Mkt H', role: 'member' }, // marketing-end.e2e: the end frame, the end scene and the end text
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
  sizea: { email: 'sizea@e2e.test', name: 'E2E Gallery Size A', role: 'member' },
  tryexa: { email: 'tryexa@e2e.test', name: 'E2E Try On Examples A', role: 'member' },
  imgexa: { email: 'imgexa@e2e.test', name: 'E2E Image Examples A', role: 'member' },
  chipa: { email: 'chipa@e2e.test', name: 'E2E Chips A', role: 'member' },
  vidfrom: { email: 'vidfrom@e2e.test', name: 'E2E Video From Image', role: 'member' },
  costa: { email: 'costa@e2e.test', name: 'E2E Costs A', role: 'member' },
  costb: { email: 'costb@e2e.test', name: 'E2E Costs B', role: 'member' },
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
  thinka: { email: 'thinka@e2e.test', name: 'E2E Thinking A', role: 'member' }, // thinking.e2e
  // create-extras.e2e: the end frame, a Run from the prompt alone and reference audio on Create video.
  cvxa: { email: 'cvxa@e2e.test', name: 'E2E Create Extras A', role: 'member' },
  cvpr: { email: 'cvpr@e2e.test', name: 'E2E Create Prompt', role: 'member' }, // create-prompt.e2e: the ?prompt= prefill
  cvxr: { email: 'cvxr@e2e.test', name: 'E2E Create Extras Reuse', role: 'member' }, // its end frame and audio refilled from a template and from History
  famsa: { email: 'famsa@e2e.test', name: 'E2E Families A', role: 'member' }, // model-families.e2e
  passa: { email: 'passa@e2e.test', name: 'E2E Passkey A', role: 'member' }, // passkey.e2e
  // account-security.e2e: a password change, a forced change of an Admin's temporary password and the sessions list.
  seca: { email: 'seca@e2e.test', name: 'E2E Security A', role: 'member' },
  secb: { email: 'secb@e2e.test', name: 'E2E Security B', role: 'member' },
  secc: { email: 'secc@e2e.test', name: 'E2E Security C', role: 'member' },
  // two-factor.e2e: totpa turns 2FA on and signs in with it, totpb has it turned off by an Admin, totpc signs in with a passkey.
  totpa: { email: 'totpa@e2e.test', name: 'E2E Two Factor A', role: 'member' },
  totpb: { email: 'totpb@e2e.test', name: 'E2E Two Factor B', role: 'member' },
  totpc: { email: 'totpc@e2e.test', name: 'E2E Two Factor C', role: 'member' },
  // settings.e2e: seta renames itself and picks a colour, setb walks the phone list and switches the preferences.
  seta: { email: 'seta@e2e.test', name: 'E2E Settings A', role: 'member' },
  setb: { email: 'setb@e2e.test', name: 'E2E Settings B', role: 'member' },
  explorea: { email: 'explorea@e2e.test', name: 'E2E Explore Lan', role: 'member' }, // explore.e2e: the greeting by given name and the Continue strip
  libv: { email: 'libv@e2e.test', name: 'E2E Library View', role: 'member' }, // library.e2e: grid or list, the selection bar, search and the empty states
  // library.e2e: libra marks from the detail view and in bulk, librb owns the item libra may read but not mark.
  libra: { email: 'libra@e2e.test', name: 'E2E Library Recipe A', role: 'member' },
  librb: { email: 'librb@e2e.test', name: 'E2E Library Recipe B', role: 'member' },
  welc: { email: 'welc@e2e.test', name: 'E2E Welcome', role: 'member' }, // library-extras.e2e: the first-visit card on Explore
  libx: { email: 'libx@e2e.test', name: 'E2E Library Extras', role: 'member' }, // library-extras.e2e: the date presets
  toolg: { email: 'toolg@e2e.test', name: 'E2E Tool Guide', role: 'member' }, // tool-guide.e2e: the sidebar lines, the guide, the page hints and Explore's start list
  thema: { email: 'thema@e2e.test', name: 'E2E Theme A', role: 'member' }, // theme.e2e: light, dark or the system's theme from Settings
  emptya: { email: 'emptya@e2e.test', name: 'E2E Empty A', role: 'member' }, // history e2e: no video job, so Create's History stays empty on a phone
  traya: { email: 'traya@e2e.test', name: 'E2E Tray A', role: 'member' }, // history e2e: the compact tray's buttons beside a page without its own History
  loada: { email: 'loada@e2e.test', name: 'E2E Load A', role: 'member' }, // history, library and image-pages e2e: a failed read and its retry, the upload reasons
  preseta: { email: 'preseta@e2e.test', name: 'E2E Preset A', role: 'member' }, // preset-pick.e2e: a late preset list does not undo a pick
  // preset-edit.e2e: tpled is a template editor (e2e/serve.ts sets it), tplprop a plain member who proposes.
  tpled: { email: 'tpled@e2e.test', name: 'E2E Template Editor', role: 'member' },
  tplprop: { email: 'tplprop@e2e.test', name: 'E2E Template Proposer', role: 'member' },
  // templates.e2e: stpla saves a template to a store on Create, stplb picks that store and applies it.
  stpla: { email: 'stpla@e2e.test', name: 'E2E Store Template A', role: 'member' },
  stplb: { email: 'stplb@e2e.test', name: 'E2E Store Template B', role: 'member' },
  // click-targets.e2e: a click anywhere on a card, tile, pill, row or label reaches its control (clicka the slots and banner, clickb Create, clickc an image result, clickd templates).
  clicka: { email: 'clicka@e2e.test', name: 'E2E Click A', role: 'member' },
  clickb: { email: 'clickb@e2e.test', name: 'E2E Click B', role: 'member' },
  clickc: { email: 'clickc@e2e.test', name: 'E2E Click C', role: 'member' },
  clickd: { email: 'clickd@e2e.test', name: 'E2E Click D', role: 'member' },
  stylea: { email: 'stylea@e2e.test', name: 'E2E Style A', role: 'member' }, // image-styles.e2e: picks a style on Image Generation and runs it on a mock model
  // store-brand.e2e: branded is a template editor (e2e/serve.ts sets it) who fills a store's brand kit, brandm a member who runs with it.
  branded: { email: 'branded@e2e.test', name: 'E2E Brand Editor', role: 'member' },
  brandm: { email: 'brandm@e2e.test', name: 'E2E Brand Member', role: 'member' },
  uploadsa: { email: 'uploadsa@e2e.test', name: 'E2E Uploads A', role: 'member' }, // uploads.e2e: a photo uploaded on one page is picked from the uploaded-photos picker on others
  uploadsb: { email: 'uploadsb@e2e.test', name: 'E2E Uploads B', role: 'member' }, // uploads.e2e: uploads carry the page's store and the picker filters by it
  // choices-store.e2e: chsa shares a hook with a store, chsb sees it under that store only, chsed is a template editor (e2e/serve.ts sets it) who shares with the company.
  chsa: { email: 'chsa@e2e.test', name: 'E2E Choices A', role: 'member' },
  chsb: { email: 'chsb@e2e.test', name: 'E2E Choices B', role: 'member' },
  chsed: { email: 'chsed@e2e.test', name: 'E2E Choices Editor', role: 'member' },
  // prompt-sections.e2e: the sectioned prompt on Create (secta) and Marketing Studio (sectb).
  secta: { email: 'secta@e2e.test', name: 'E2E Sections A', role: 'member' },
  sectb: { email: 'sectb@e2e.test', name: 'E2E Sections B', role: 'member' },
  // prompt-sections.e2e: the prompt templates dialog's recent group (sectc), whose jobs must be the only ones the member has.
  sectc: { email: 'sectc@e2e.test', name: 'E2E Sections C', role: 'member' },
  // marketing-formats.e2e: the Unboxing and Review formats, one member per test.
  fmta: { email: 'fmta@e2e.test', name: 'E2E Formats A', role: 'member' },
  fmtb: { email: 'fmtb@e2e.test', name: 'E2E Formats B', role: 'member' },
  fmtc: { email: 'fmtc@e2e.test', name: 'E2E Formats C', role: 'member' },
  fmtd: { email: 'fmtd@e2e.test', name: 'E2E Formats D', role: 'member' },
  fmte: { email: 'fmte@e2e.test', name: 'E2E Formats E', role: 'member' },
  fmtf: { email: 'fmtf@e2e.test', name: 'E2E Formats F', role: 'member' },
  // fashion-model.e2e: the AI model generator, a saved model in the Try On person picker.
  fashiona: { email: 'fashiona@e2e.test', name: 'E2E Fashion A', role: 'member' },
  // changelog.e2e: the changelog page, the sidebar dot and the once-a-day popup, one member per test.
  chga: { email: 'chga@e2e.test', name: 'E2E Changelog A', role: 'member' },
  chgb: { email: 'chgb@e2e.test', name: 'E2E Changelog B', role: 'member' },
  admin: { email: 'admin@e2e.test', name: 'E2E Admin', role: 'admin' },
} as const;

export type UserKey = keyof typeof USERS;
