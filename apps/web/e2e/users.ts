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
  // image-pages.e2e geometry at 1440: two gallery images each beside member11's, so the queue runs them side by side.
  geoa: { email: 'geoa@e2e.test', name: 'E2E Geo A', role: 'member' },
  geob: { email: 'geob@e2e.test', name: 'E2E Geo B', role: 'member' },
  geoc: { email: 'geoc@e2e.test', name: 'E2E Geo C', role: 'member' },
  geod: { email: 'geod@e2e.test', name: 'E2E Geo D', role: 'member' },
  // Named so that no earlier spec's "E2E Member 1" text match picks them up.
  appsa: { email: 'appsa@e2e.test', name: 'E2E Apps A', role: 'member' },
  appsb: { email: 'appsb@e2e.test', name: 'E2E Apps B', role: 'member' },
  stocka: { email: 'stocka@e2e.test', name: 'E2E Stock A', role: 'member' },
  appsc: { email: 'appsc@e2e.test', name: 'E2E Apps C', role: 'member' },
  appart: { email: 'appart@e2e.test', name: 'E2E Apps Art', role: 'member' }, // never runs an app: its History stays empty
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
  mktm: { email: 'mktm@e2e.test', name: 'E2E Mkt M', role: 'member' }, // marketing.e2e: the hook x ratio matrix
  reusea: { email: 'reusea@e2e.test', name: 'E2E Reuse A', role: 'member' },
  tpla: { email: 'tpla@e2e.test', name: 'E2E Templates A', role: 'member' },
  tplb: { email: 'tplb@e2e.test', name: 'E2E Templates B', role: 'member' },
  tplslots: { email: 'tplslots@e2e.test', name: 'E2E Templates Slots', role: 'member' }, // templates.e2e: a Try On template saved without a model photo
  tplunbox: { email: 'tplunbox@e2e.test', name: 'E2E Templates Unboxing', role: 'member' }, // templates.e2e: an Unboxing template saved without a product photo
  usea: { email: 'usea@e2e.test', name: 'E2E Use A', role: 'member' },
  useb: { email: 'useb@e2e.test', name: 'E2E Use B', role: 'member' },
  // templates.e2e: exmaker makes a company example on Create, exuse uses it and keeps their own photo and store.
  exmaker: { email: 'exmaker@e2e.test', name: 'E2E Example Maker', role: 'member' },
  exuse: { email: 'exuse@e2e.test', name: 'E2E Example User', role: 'member' },
  sugga: { email: 'sugga@e2e.test', name: 'E2E Suggest A', role: 'member' },
  hista: { email: 'hista@e2e.test', name: 'E2E History A', role: 'member' },
  resimga: { email: 'resimga@e2e.test', name: 'E2E Result Image A', role: 'member' },
  restrya: { email: 'restrya@e2e.test', name: 'E2E Result Try On A', role: 'member' },
  auda: { email: 'auda@e2e.test', name: 'E2E Audio A', role: 'member' },
  audb: { email: 'audb@e2e.test', name: 'E2E Audio B', role: 'member' },
  cvexa: { email: 'cvexa@e2e.test', name: 'E2E Create Examples A', role: 'member' },
  sizea: { email: 'sizea@e2e.test', name: 'E2E Gallery Size A', role: 'member' },
  tryexa: { email: 'tryexa@e2e.test', name: 'E2E Try On Examples A', role: 'member' },
  imgexa: { email: 'imgexa@e2e.test', name: 'E2E Image Examples A', role: 'member' },
  appexa: { email: 'appexa@e2e.test', name: 'E2E App Examples A', role: 'member' }, // apps.e2e: the Examples tab of Jewelry Try-On
  chipa: { email: 'chipa@e2e.test', name: 'E2E Chips A', role: 'member' },
  vidfrom: { email: 'vidfrom@e2e.test', name: 'E2E Video From Image', role: 'member' },
  costa: { email: 'costa@e2e.test', name: 'E2E Costs A', role: 'member' },
  costb: { email: 'costb@e2e.test', name: 'E2E Costs B', role: 'member' },
  tryposea: { email: 'tryposea@e2e.test', name: 'E2E Try On Poses', role: 'member' }, // image-pages.e2e: the model catalog and the pose step
  pickera: { email: 'pickera@e2e.test', name: 'E2E Try On Pickers', role: 'member' }, // its own Try On job gives it My models, which would hide another user's slot samples
  garmentcap: { email: 'garmentcap@e2e.test', name: 'E2E Try On Garment Cap', role: 'member' }, // image-pages.e2e: Nano Banana 2.1's 13 garments and the slot's count
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
  exploreb: { email: 'exploreb@e2e.test', name: 'E2E Explore Minh', role: 'member' }, // explore.e2e: a running job's elapsed time keeps counting
  // explore.e2e: the day line over two kinds of job, the first-visit cards, and the hero strip of Examples.
  exploremix: { email: 'exploremix@e2e.test', name: 'E2E Explore Mix', role: 'member' },
  explorenew: { email: 'explorenew@e2e.test', name: 'E2E Explore New', role: 'member' },
  explorestrip: { email: 'explorestrip@e2e.test', name: 'E2E Explore Strip', role: 'member' },
  libv: { email: 'libv@e2e.test', name: 'E2E Library View', role: 'member' }, // library.e2e: grid or list, the selection bar, search and the empty states
  libd: { email: 'libd@e2e.test', name: 'E2E Library Days', role: 'member' }, // library.e2e: the day headings and their select-all checkbox
  librange: { email: 'librange@e2e.test', name: 'E2E Library Range', role: 'member' }, // library.e2e: Shift-click picks a range
  // library-boards.e2e: libboard makes, fills, renames and deletes a board; libboardb opens libboard's copied board link and must see the board-not-found state.
  libboard: { email: 'libboard@e2e.test', name: 'E2E Library Board', role: 'member' },
  libboardb: { email: 'libboardb@e2e.test', name: 'E2E Library Board B', role: 'member' },
  // library.e2e: libra marks from the detail view and in bulk, librb owns the item libra may read but not mark.
  libra: { email: 'libra@e2e.test', name: 'E2E Library Recipe A', role: 'member' },
  librb: { email: 'librb@e2e.test', name: 'E2E Library Recipe B', role: 'member' },
  librp: { email: 'librp@e2e.test', name: 'E2E Library Prefetch', role: 'member' }, // library.e2e: the detail fetches its image neighbours' previews ahead
  librf: { email: 'librf@e2e.test', name: 'E2E Library Frame', role: 'member' }, // library.e2e: Use this frame takes a video's frame to Create
  shelf: { email: 'shelf@e2e.test', name: 'E2E Product Shelf', role: 'member' }, // product-shelf.e2e: the Library's Products view, its form and the create-more-angles link
  shelfpick: { email: 'shelfpick@e2e.test', name: 'E2E Shelf Picker', role: 'member' }, // product-shelf-picker.e2e: the shelf link on the slots that take a photo
  welc: { email: 'welc@e2e.test', name: 'E2E Welcome', role: 'member' }, // library-extras.e2e: the first-visit card on Explore
  libx: { email: 'libx@e2e.test', name: 'E2E Library Extras', role: 'member' }, // library-extras.e2e: the date presets
  toolg: { email: 'toolg@e2e.test', name: 'E2E Tool Guide', role: 'member' }, // tool-guide.e2e: the sidebar lines, the guide, the page hints and Explore's start list
  thema: { email: 'thema@e2e.test', name: 'E2E Theme A', role: 'member' }, // theme.e2e: light, dark or the system's theme from Settings
  emptya: { email: 'emptya@e2e.test', name: 'E2E Empty A', role: 'member' }, // history e2e: no video job, so Create's History stays empty on a phone
  traya: { email: 'traya@e2e.test', name: 'E2E Tray A', role: 'member' }, // history e2e: the compact tray's buttons beside a page without its own History
  loada: { email: 'loada@e2e.test', name: 'E2E Load A', role: 'member' }, // history, library and image-pages e2e: a failed read and its retry, the upload reasons
  preseta: { email: 'preseta@e2e.test', name: 'E2E Preset A', role: 'member' }, // preset-pick.e2e: a late preset list does not undo a pick
  // preset-edit.e2e: tpled is a template editor (e2e/serve.ts sets it), tplprop a plain member who proposes; preset-edit-touch.e2e only reads the picker as tplprop.
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
  // camera-angles.e2e: several camera angles on Create, one member per test.
  angla: { email: 'angla@e2e.test', name: 'E2E Angles A', role: 'member' },
  anglb: { email: 'anglb@e2e.test', name: 'E2E Angles B', role: 'member' },
  anglc: { email: 'anglc@e2e.test', name: 'E2E Angles C', role: 'member' },
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
  // multi-angle.e2e: the multi-angle app, one job per view; viewsb runs the 360 turntable.
  viewsa: { email: 'viewsa@e2e.test', name: 'E2E Views A', role: 'member' },
  viewsb: { email: 'viewsb@e2e.test', name: 'E2E Views B', role: 'member' },
  // breed-swap.e2e: the breed swap app, one job per breed.
  breedsa: { email: 'breedsa@e2e.test', name: 'E2E Breeds A', role: 'member' },
  // pet-apps.e2e: the pet portrait, mockup pack and name swap apps, one member each.
  petsa: { email: 'petsa@e2e.test', name: 'E2E Pets A', role: 'member' },
  mockupsa: { email: 'mockupsa@e2e.test', name: 'E2E Mockups A', role: 'member' },
  namesa: { email: 'namesa@e2e.test', name: 'E2E Names A', role: 'member' },
  namesb: { email: 'namesb@e2e.test', name: 'E2E Names B', role: 'member' }, // the names from a CSV file
  // pose-generator.e2e: the pose generator's Run of one job per pose, and its shortcut from an AI model's and a Try On's result.
  posea: { email: 'posea@e2e.test', name: 'E2E Poses A', role: 'member' },
  poseb: { email: 'poseb@e2e.test', name: 'E2E Poses B', role: 'member' },
  posec: { email: 'posec@e2e.test', name: 'E2E Poses C', role: 'member' }, // the pose photos
  posed: { email: 'posed@e2e.test', name: 'E2E Poses D', role: 'member' }, // the catalogue: several model photos in one Run
  posee: { email: 'posee@e2e.test', name: 'E2E Poses E', role: 'member' }, // the catalogue's Run that stops part way
  posef: { email: 'posef@e2e.test', name: 'E2E Poses F', role: 'member' }, // the garment chips
  poseg: { email: 'poseg@e2e.test', name: 'E2E Poses G', role: 'member' }, // the face score on the cards
  // recolor-listing.e2e: product recolor's and the listing set's Runs of one job per colour or shot.
  recolora: { email: 'recolora@e2e.test', name: 'E2E Recolor A', role: 'member' },
  listinga: { email: 'listinga@e2e.test', name: 'E2E Listing A', role: 'member' },
  // result-tools.e2e: a breed swap's ZIP named by breed, History's Background Remover button on an image result, and Media Optimizer's listing preset.
  toolsa: { email: 'toolsa@e2e.test', name: 'E2E Tools A', role: 'member' },
  toolsb: { email: 'toolsb@e2e.test', name: 'E2E Tools B', role: 'member' },
  // apps.e2e: a bulk Run of several photos on Background Remover.
  bulka: { email: 'bulka@e2e.test', name: 'E2E Bulk A', role: 'member' },
  toolsc: { email: 'toolsc@e2e.test', name: 'E2E Tools C', role: 'member' }, // the listing preset's .zip of several images
  toolsd: { email: 'toolsd@e2e.test', name: 'E2E Tools D', role: 'member' }, // History selects a whole Run of more than the 20 jobs it loads (seeded)
  // library.e2e: a picture's Library detail opens it in Background Remover, for its creator and for another member.
  libtoola: { email: 'libtoola@e2e.test', name: 'E2E Library Tools A', role: 'member' },
  libtoolb: { email: 'libtoolb@e2e.test', name: 'E2E Library Tools B', role: 'member' },
  libfocus: { email: 'libfocus@e2e.test', name: 'E2E Library Focus', role: 'member' }, // library.e2e: every Tab stop of a video's detail shows above its pinned footer
  // library.e2e: a system account (flag set in serve.ts), whose results stay out of the Library until an Admin shows them.
  syslib: { email: 'syslib@e2e.test', name: 'E2E System Library', role: 'member' },
  // changelog.e2e: the changelog page, the sidebar dot and the once-a-day popup, one member per test.
  chga: { email: 'chga@e2e.test', name: 'E2E Changelog A', role: 'member' },
  chgb: { email: 'chgb@e2e.test', name: 'E2E Changelog B', role: 'member' },
  // impersonation.e2e: a developer Admin (flag seeded in serve.ts), an Admin without it, and the member the developer signs in as.
  impdev: { email: 'impdev@e2e.test', name: 'E2E Imp Dev', role: 'admin' },
  impplain: { email: 'impplain@e2e.test', name: 'E2E Imp Plain', role: 'admin' },
  impmember: { email: 'impmember@e2e.test', name: 'E2E Imp Member', role: 'member' },
  // rating.e2e: members with three succeeded real jobs (seeded in serve.ts), so the satisfaction prompt is due: one sends a score, one snoozes, one is on a phone.
  ratea: { email: 'ratea@e2e.test', name: 'E2E Rating A', role: 'member' },
  rateb: { email: 'rateb@e2e.test', name: 'E2E Rating B', role: 'member' },
  ratec: { email: 'ratec@e2e.test', name: 'E2E Rating C', role: 'member' },
  rated: { email: 'rated@e2e.test', name: 'E2E Rating D', role: 'member' }, // no jobs: only the Feedback page's block rates
  // quick-ui.e2e: Create's Examples while its lists load, and an image result's Examples tile on a phone.
  quicka: { email: 'quicka@e2e.test', name: 'E2E Quick A', role: 'member' },
  // run-progress.e2e: a running History card (the job list is answered by the spec) with its blurred input, bar and reveal.
  runprog: { email: 'runprog@e2e.test', name: 'E2E Run Progress', role: 'member' },
  admin: { email: 'admin@e2e.test', name: 'E2E Admin', role: 'admin' },
  // a11y.e2e: one finished clip, so a Library card shows its marks on a phone.
  phonea: { email: 'phonea@e2e.test', name: 'E2E Phone A', role: 'member' },
  // a11y.e2e: one image result, so History shows its prompt tools and the Library its select boxes.
  tapa: { email: 'tapa@e2e.test', name: 'E2E Tap A', role: 'member' },
  // drag-photo.e2e: History photos dragged onto a form slot, one member per page.
  draga: { email: 'draga@e2e.test', name: 'E2E Drag A', role: 'member' },
  dragb: { email: 'dragb@e2e.test', name: 'E2E Drag B', role: 'member' },
  dragc: { email: 'dragc@e2e.test', name: 'E2E Drag C', role: 'member' },
  motion: { email: 'motion@e2e.test', name: 'E2E Motion', role: 'member' }, // motion.e2e: the dialog entrance, the Run button's grey and ready colours, the press scale, the tab panel fade
  tutor: { email: 'tutor@e2e.test', name: 'E2E Tutor', role: 'member' }, // tutorials.e2e: the tutorial videos on the About tabs and the tutorials page
  ownmodel: { email: 'ownmodel@e2e.test', name: 'E2E Own Model', role: 'member' }, // own-model.e2e: Try On's model creator inside the model picker (owns its only AI model)
  // workspaces-isolation.e2e: a company member, a partner seller in ws_partner only, and a user in both (the spec moves the last two there itself).
  wscomp: { email: 'wscomp@e2e.test', name: 'E2E WS Company', role: 'member' },
  wspart: { email: 'wspart@e2e.test', name: 'E2E WS Partner', role: 'member' },
  wsdual: { email: 'wsdual@e2e.test', name: 'E2E WS Dual', role: 'member' },
  // workspaces-manage.e2e: the Admin who creates a partner workspace and adds a company member to it, who then switches between the two.
  wsadm: { email: 'wsadm@e2e.test', name: 'E2E WS Admin', role: 'admin' },
  wsboth: { email: 'wsboth@e2e.test', name: 'E2E WS Both', role: 'member' },
  // image-prompt-bar.e2e: the prompt bar at 1440, at 390, and its axe scans.
  pbara: { email: 'pbara@e2e.test', name: 'E2E Prompt Bar A', role: 'member' },
  pbarb: { email: 'pbarb@e2e.test', name: 'E2E Prompt Bar B', role: 'member' },
  pbarc: { email: 'pbarc@e2e.test', name: 'E2E Prompt Bar C', role: 'member' },
  pbard: { email: 'pbard@e2e.test', name: 'E2E Prompt Bar D', role: 'member' },
  pbare: { email: 'pbare@e2e.test', name: 'E2E Prompt Bar E', role: 'member' },
  pbarf: { email: 'pbarf@e2e.test', name: 'E2E Prompt Bar F', role: 'member' },
  pbarg: { email: 'pbarg@e2e.test', name: 'E2E Prompt Bar G', role: 'member' },
  pbarh: { email: 'pbarh@e2e.test', name: 'E2E Prompt Bar H', role: 'member' },
  pbari: { email: 'pbari@e2e.test', name: 'E2E Prompt Bar I', role: 'member' },
  pbarj: { email: 'pbarj@e2e.test', name: 'E2E Prompt Bar J', role: 'member' },
  pbark: { email: 'pbark@e2e.test', name: 'E2E Prompt Bar K', role: 'member' },
  pbarn: { email: 'pbarn@e2e.test', name: 'E2E Prompt Bar N', role: 'member' }, // a Run of 4 pictures
  pbarl: { email: 'pbarl@e2e.test', name: 'E2E Prompt Bar L', role: 'member' },
  // A template editor (e2e/serve.ts sets it), whose bar opens the brand kit and style editors.
  pbared: { email: 'pbared@e2e.test', name: 'E2E Prompt Bar Editor', role: 'member' },
  // billing.e2e: a member the spec puts in a billing team of its own, whose store picker then lists only that team's store.
  billa: { email: 'billa@e2e.test', name: 'E2E Billing A', role: 'member' },
  // preset-notes.e2e: the preset card on Create, and Marketing Studio's format filter on History and Examples.
  notea: { email: 'notea@e2e.test', name: 'E2E Notes A', role: 'member' },
  noteb: { email: 'noteb@e2e.test', name: 'E2E Notes B', role: 'member' },
  // hook-effects.e2e: the hook effects app, its History, Reuse and Library chip.
  hooka: { email: 'hooka@e2e.test', name: 'E2E Hook A', role: 'member' },
  // video-edit.e2e: the video edit app, its History, Reuse and Library chip.
  edita: { email: 'edita@e2e.test', name: 'E2E Edit A', role: 'member' },
  // one-tap-apps.e2e: the Admin who makes a custom app in the workspace ws_onetap, and the member of that workspace who runs it.
  tapadm: { email: 'tapadm@e2e.test', name: 'E2E Tap Admin', role: 'admin' },
  tapmem: { email: 'tapmem@e2e.test', name: 'E2E Tap Member', role: 'member' },
  // touch-viewers.e2e: the "view large" controls on an iPad-sized touch screen.
  tabletv: { email: 'tabletv@e2e.test', name: 'E2E Tablet Viewer', role: 'member' },
  // image-viewer.e2e: zoom, swipe, step arrows and download in the picture viewer.
  viewergest: { email: 'viewergest@e2e.test', name: 'E2E Viewer Gestures', role: 'member' },
  viewerhist: { email: 'viewerhist@e2e.test', name: 'E2E Viewer History', role: 'member' },
  // a11y.e2e: a History card's taps on a touch phone and a touch tablet.
  touchcardp: { email: 'touchcardp@e2e.test', name: 'E2E Touch Card Phone', role: 'member' },
  touchcardt: { email: 'touchcardt@e2e.test', name: 'E2E Touch Card Tablet', role: 'member' },
  tabletcard: { email: 'tabletcard@e2e.test', name: 'E2E Tablet Card', role: 'member' },
  // popular.e2e: the week's Run counts on the Apps cards and Explore's sort, seen from a workspace of its own (popw) and from the company's (popv).
  popw: { email: 'popw@e2e.test', name: 'E2E Popular W', role: 'member' },
  popv: { email: 'popv@e2e.test', name: 'E2E Popular V', role: 'member' },
} as const;

export type UserKey = keyof typeof USERS;
