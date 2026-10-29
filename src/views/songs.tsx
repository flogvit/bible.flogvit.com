// Songs from FLOGVIT.music (#188): one list, used by the chapter page (study
// block and verse detail) and by the theme, person and story pages.

import { currentLocale, tCtx, tEnum } from '../lib/i18n.ts';
import { songPageUrl, type Song } from '../lib/songs.ts';

/**
 * Shown before the rest fold away: `/personer/jesus` has over forty songs, and
 * the page's own content should not start forty players down.
 */
const SHOWN = 5;

function SongItem({ song }: { song: Song }) {
  const t = tCtx();
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
      <a class="song-link" href={songPageUrl(song, currentLocale())}>
        {t('songs.open')}
      </a>
    </li>
  );
}

/** Title, style and length, the browser's own player, and the song on FLOGVIT.music. */
export function SongList({ songs }: { songs: Song[] }) {
  const rest = songs.slice(SHOWN);
  return (
    <>
      <ul class="song-list">
        {songs.slice(0, SHOWN).map((song) => <SongItem song={song} />)}
      </ul>
      {rest.length > 0 && (
        <details class="song-more">
          <summary>{tCtx()('songs.more', { n: rest.length })}</summary>
          <ul class="song-list">
            {rest.map((song) => <SongItem song={song} />)}
          </ul>
        </details>
      )}
    </>
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
