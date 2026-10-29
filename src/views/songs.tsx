// Songs from FLOGVIT.music (#188): one list, used by the chapter page (study
// block and verse detail) and by the theme, person and story pages.

import { currentLocale, tCtx, tEnum } from '../lib/i18n.ts';
import { songPageUrl, type Song } from '../lib/songs.ts';

/** Title, style and length, the browser's own player, and the song on FLOGVIT.music. */
export function SongList({ songs }: { songs: Song[] }) {
  const t = tCtx();
  const locale = currentLocale();
  return (
    <ul class="song-list">
      {songs.map((song) => {
        const style = song.style.map((s) => tEnum(t, 'songs.style.', s)).join(', ');
        const meta = [style, song.music?.duration].filter(Boolean).join(' · ');
        return (
          <li class="song">
            <span class="song-title">{song.title}</span>
            {meta && <span class="song-meta">{meta}</span>}
            <audio
              class="song-audio"
              controls
              preload="none"
              src={song.audio}
              aria-label={t('songs.play', { title: song.title })}
            ></audio>
            <a class="song-link" href={songPageUrl(song, locale)}>
              {t('songs.open')}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** The «Songs» section of a theme, person or story page; nothing when there are none. */
export function SongSection({ songs }: { songs: Song[] }) {
  if (songs.length === 0) return null;
  return (
    <section class="song-section">
      <h2>{tCtx()('songs.title')}</h2>
      <SongList songs={songs} />
    </section>
  );
}
