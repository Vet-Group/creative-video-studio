// lib/storage.ts and packages/db load the repo's .env when a setting is missing, and that file may hold a real FAL_KEY. Set (even empty), a variable is kept,
// so no test reads the real fal balance; a test that needs fal sets a fixture key and stubs fetch.
process.env.FAL_KEY = '';
