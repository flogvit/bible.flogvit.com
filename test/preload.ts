// Runs before every test file (bunfig.toml).
//
// The songs on the chapter, theme, person and story pages come from
// FLOGVIT.music's public index on the internet (src/lib/songs.ts). Without this,
// every page the suite renders would fetch it: the suite would need the network
// and could turn red on a slow connection. Empty turns the songs off; a test that
// wants songs points `MUSIC_INDEX_URL` at its own server (test/songs.test.ts).
process.env.MUSIC_INDEX_URL ??= '';
