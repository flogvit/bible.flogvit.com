import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './DiscoverGrid.module.scss';

interface DiscoverItem {
  to: string;
  title: string;
  desc: string;
  icon: ReactNode;
}

const items: DiscoverItem[] = [
  {
    to: '/tidslinje',
    title: 'Tidslinje',
    desc: 'Fra skapelsen til den tidlige kirken — se hvor i historien en tekst hører hjemme.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 12l9-9 9 9-9 9z" /><path d="M12 3v18" />
      </svg>
    ),
  },
  {
    to: '/personer',
    title: 'Personer',
    desc: 'Bibelske personer med biografier, slektskap og hvor de opptrer i teksten.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" /><path d="M4 22c0-4 4-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    to: '/profetier',
    title: 'Profetier',
    desc: 'GT-profetier og deres oppfyllelse i NT, med kontekst og kommentar.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z" />
      </svg>
    ),
  },
  {
    to: '/temaer',
    title: 'Temaer',
    desc: 'Følg motiver som nåde, lys, pakt eller ørken gjennom hele Bibelen.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 19h16M6 19V5h4v14M14 19V9h4v10" />
      </svg>
    ),
  },
  {
    to: '/paralleller',
    title: 'Parallelle tekster',
    desc: 'Se evangeliene side om side, sammenlign oversettelser og grunntekst.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 6h16v12H4z" /><path d="M4 10h16M9 6v12" />
      </svg>
    ),
  },
  {
    to: '/manuskripter',
    title: 'Manuskripter',
    desc: 'Dine andakter, prekener og studienotater — koblet til vers.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h6" />
      </svg>
    ),
  },
  {
    to: '/historier',
    title: 'Bibelhistorier',
    desc: 'Bibelens fortellinger samlet og søkbare med kategorier og beskrivelser.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 4h16v16H4z" /><path d="M4 8h16M8 4v16" />
      </svg>
    ),
  },
  {
    to: '/tall',
    title: 'Tall i Bibelen',
    desc: 'Tall og deres symbolikk gjennom hele Bibelen.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M8 4v16M16 4v16M4 9h16M4 15h16" />
      </svg>
    ),
  },
  {
    to: '/lesetekster',
    title: 'Lesetekster',
    desc: 'Kirkeårets lesetekster for hver søndag og helligdag.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M2 4h7a4 4 0 0 1 4 4v13" /><path d="M22 4h-7a4 4 0 0 0-4 4v13" />
      </svg>
    ),
  },
  {
    to: '/kjente-vers',
    title: 'Kjente vers',
    desc: 'Populære vers å lære utenat og kjenne igjen.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z" />
      </svg>
    ),
  },
  {
    to: '/lister',
    title: 'Verslister',
    desc: 'Lag dine egne samlinger av vers — for andakt, prekenforberedelse, eller studium.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    to: '/favoritter',
    title: 'Favoritter',
    desc: 'Dine merkede vers og passasjer.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M19 14c-3 4-7 7-7 7s-4-3-7-7-3-8 0-10 6-1 7 2c1-3 4-4 7-2s3 6 0 10z" />
      </svg>
    ),
  },
  {
    to: '/emner',
    title: 'Emner',
    desc: 'Tag vers, notater og innhold med dine egne emner.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V5a2 2 0 0 1 2-2h8l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="8" cy="8" r="1.5" />
      </svg>
    ),
  },
  {
    to: '/notater',
    title: 'Notater',
    desc: 'Skriv refleksjoner og kommentarer på vers.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    ),
  },
  {
    to: '/statistikk',
    title: 'Statistikk',
    desc: 'Se hvor mye du har lest og fulgt leseplaner.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    to: '/oversettelser',
    title: 'Oversettelser',
    desc: 'Tilgjengelige bibeloversettelser og last ned for offline-bruk.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </svg>
    ),
  },
];

export function DiscoverGrid() {
  return (
    <section className={styles.section} aria-labelledby="discover-heading">
      <div className={styles.head}>
        <h2 id="discover-heading">Utforsk</h2>
        <span className={styles.subtitle}>Studium på tvers av teksten</span>
      </div>
      <div className={styles.grid}>
        {items.map(item => (
          <Link key={item.to} to={item.to} className={styles.disc}>
            <span className={styles.discIcon}>{item.icon}</span>
            <h4>{item.title}</h4>
            <p>{item.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
