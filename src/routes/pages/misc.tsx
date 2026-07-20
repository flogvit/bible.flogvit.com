// Statiske sider: /om, /tilgjengelighet + 404-visningen (koblet i app.ts).
// Portert 1:1 fra bibel/src/pages/AboutPage.tsx og AccessibilityPage.tsx.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';

const r = new Hono<AppEnv>();

r.get('/om', (c) =>
  c.html(
    <Layout title="Om — FLOGVIT.bibel" description="Om bibelprosjektet: åpen kildekode, bibeloversettelser, KVN-versnummerering og hjelpemidler." styles={['about.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Om' }]} />

          <h1>Om denne siden</h1>

          <section class="about-section">
            <h2>Prosjektet</h2>
            <p>
              Denne bibelsiden er en del av et åpent prosjekt for å gjøre Bibelen tilgjengelig med
              gode studieverktøy. Både nettsiden og alle bibeldata er åpen kildekode og fritt
              tilgjengelig.
            </p>
            <p>
              <a href="https://github.com/flogvit/bibel.flogvit.no" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/bibel.flogvit.no
              </a>{' '}
              &ndash; kildekoden til denne nettsiden
            </p>
            <p>
              <a href="https://github.com/flogvit/free-bible/" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/free-bible
              </a>{' '}
              &ndash; bibeldata (tekst, grunntekst, referanser, m.m.)
            </p>
          </section>

          <section class="about-section">
            <h2>Bibeloversettelser</h2>

            <h3>Norsk tekst (OSNB2)</h3>
            <p>Den norske teksten er en åpen oversettelse som er fritt tilgjengelig for alle å bruke.</p>

            <h3>Hebraisk grunntekst (Tanach)</h3>
            <p>
              Den hebraiske teksten for Det gamle testamente er basert på den åpne Tanach-teksten
              fra Tanach.us.
            </p>
            <p>
              <a href="https://tanach.us" target="_blank" rel="noopener noreferrer">
                Tanach.us
              </a>
            </p>

            <h3>Gresk grunntekst (SBLGNT)</h3>
            <p>
              Den greske teksten for Det nye testamente er SBL Greek New Testament, utgitt av
              Society of Biblical Literature og Logos Bible Software.
            </p>
            <p>
              <a href="https://sblgnt.com/" target="_blank" rel="noopener noreferrer">
                sblgnt.com
              </a>
            </p>
            <p>
              <a href="https://github.com/morphgnt/sblgnt" target="_blank" rel="noopener noreferrer">
                SBLGNT på GitHub
              </a>
            </p>
          </section>

          <section class="about-section">
            <h2>Versnummerering (KVN)</h2>
            <p>
              Ulike bibeloversettelser nummererer vers forskjellig. Et vers som heter 1. Mosebok
              31,55 i Bibelselskapets oversettelse (2024) heter 1. Mosebok 32,1 i vår grunntekst
              (osnb2), fordi den hebraiske tradisjonen deler kapitlene annerledes enn den
              europeiske.
            </p>
            <p>For eksempel i 1. Mosebok rundt kapittel 31&ndash;32:</p>
            <table class="about-verse-table">
              <thead>
                <tr>
                  <th>Bibelselskapets 2024</th>
                  <th>osnb2 (hebraisk)</th>
                  <th>Tekst</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1 Mos 31,55</td>
                  <td>1 Mos 32,1</td>
                  <td>Tidlig neste morgen kysset Laban...</td>
                </tr>
                <tr>
                  <td>1 Mos 32,1</td>
                  <td>1 Mos 32,2</td>
                  <td>Jakob fortsatte på sin vei...</td>
                </tr>
                <tr>
                  <td>1 Mos 32,2</td>
                  <td>1 Mos 32,3</td>
                  <td>Da Jakob så dem, sa han...</td>
                </tr>
              </tbody>
            </table>
            <p>
              Slike forskjeller finnes i over tusen vers, særlig i Salmene (der overskrifter noen
              ganger telles som eget vers), og i flere kapitler i Mosebøkene, Joel og andre
              profeter der kapittelgrensene er forskjøvet.
            </p>
            <p>
              For å håndtere dette bruker vi <strong>KVN</strong> (Kanonisk Versnummer) &ndash; et
              system som gir hvert vers i Bibelen et unikt nummer uavhengig av oversettelse. Når
              du velger en versnummerering under &laquo;Innstillinger&raquo; eller i
              hjelpemiddelpanelet, brukes KVN til å vise riktige versnummer for den valgte
              tradisjonen, selv om den underliggende teksten er den samme.
            </p>
            <p>
              KVN støtter i dag{' '}
              <a href="https://github.com/flogvit/free-bible/tree/main/kvn" target="_blank" rel="noopener noreferrer">
                12 ulike nummereringssystemer
              </a>
              , inkludert Bibelselskapets oversettelser (1930, 1978, 2011, 2024), Norsk Bibel
              (1988, 1994), King James Version og flere.
            </p>
          </section>

          <section class="about-section">
            <h2>Hjelpemidler</h2>
            <h3>Studieverktøy</h3>
            <ul>
              <li><strong>Grunntekst</strong> - Vis hebraisk/gresk originaltekst med ord-for-ord oversettelse</li>
              <li><strong>Referanser</strong> - Kryssreferanser mellom bibelvers</li>
              <li><strong>Boksammendrag</strong> - Oversikt over hver boks innhold</li>
              <li><strong>Kapittelsammendrag</strong> - Kort beskrivelse av hvert kapittel</li>
              <li><strong>Viktige ord</strong> - Nøkkelbegreper forklart</li>
              <li><strong>Kjente vers</strong> - Utvalgte, kjente bibelvers</li>
              <li><strong>Bibelhistorier</strong> - Bibelens fortellinger samlet og gjengitt</li>
              <li><strong>Temaer</strong> - Tematiske oversikter med relevante bibelvers</li>
              <li><strong>Profetier</strong> - Profetier og deres oppfyllelser</li>
              <li><strong>Paralleller</strong> - Synoptiske paralleller mellom evangeliene</li>
              <li><strong>Personer</strong> - Bibelske personer med referanser</li>
              <li><strong>Tall</strong> - Tallenes betydning i Bibelen</li>
              <li><strong>Dager</strong> - Helligdager og merkedager i kristen tradisjon</li>
              <li><strong>Tidslinje</strong> - Bibelske hendelser i kronologisk rekkefølge</li>
            </ul>

            <h3>Personlige verktøy</h3>
            <ul>
              <li><strong>Favoritter</strong> - Lagre dine favorittvers</li>
              <li><strong>Emner</strong> - Tag vers med egne emner</li>
              <li><strong>Notater</strong> - Skriv egne notater til vers</li>
              <li><strong>Verslister</strong> - Samle bibelvers i navngitte lister for manuskripter og studier</li>
              <li><strong>Leseplaner</strong> - Ulike planer for systematisk bibellesing</li>
              <li><strong>Manuskripter</strong> - Skriv andakter, prekener og bibeltimer med versreferanser</li>
              <li><strong>Oversettelser</strong> - Last opp og bruk egne bibeloversettelser</li>
              <li><strong>Statistikk</strong> - Oversikt over lesing og bruk</li>
            </ul>
          </section>

          <section id="hjelp" class="about-section">
            <h2>Hjelp og brukerveiledning</h2>
            <p>Her er noen tips for å få mest mulig ut av siden:</p>

            <h3>Navigasjon</h3>
            <ul>
              <li>Bruk <strong>søkefeltet</strong> øverst for å søke etter vers eller tekst</li>
              <li>Skriv en referanse som <em>&quot;Joh 3:16&quot;</em> for å gå direkte til verset</li>
              <li>Bruk <strong>piltastene</strong> (← →) for å bla mellom kapitler</li>
            </ul>

            <h3>Tastaturhurtigtaster</h3>
            <p>Trykk <kbd>?</kbd> på en hvilken som helst side for å se alle tilgjengelige hurtigtaster.</p>
            <ul>
              <li><kbd>/</kbd> eller <kbd>Ctrl</kbd>+<kbd>K</kbd> - Fokuser søkefeltet</li>
              <li><kbd>R</kbd> - Lesemodus på/av</li>
              <li><kbd>←</kbd> / <kbd>→</kbd> - Forrige/neste kapittel</li>
              <li><kbd>1-9</kbd> - Hopp til vers 1-9</li>
              <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+bokstav - Hurtignavigasjon (H=Hjem, S=Søk, L=Leseplan, T=Tidslinje, P=Profetier, F=Favoritter, E=Emner, N=Notater, K=Kjente vers, O=Personer, V=Verslister, A=Paralleller, I=Statistikk, M=Manuskripter, C=Temaer)</li>
            </ul>

            <h3>Versinteraksjon</h3>
            <p>Klikk på <strong>versnummeret</strong> for å åpne versdetaljer med følgende faner:</p>
            <ul>
              <li><strong>Grunntekst</strong> - Hebraisk/gresk originaltekst (klikk på ord for oversettelse)</li>
              <li><strong>Referanser</strong> - Kryssreferanser til andre bibelvers</li>
              <li><strong>Profetier</strong> - Profetier knyttet til verset (hvis relevant)</li>
              <li><strong>Emner</strong> - Tag verset med egne emner</li>
              <li><strong>Notater</strong> - Skriv egne notater til verset</li>
              <li><strong>Versjoner</strong> - Sammenlign med andre bibeloversettelser</li>
            </ul>

            <h3>Verslister</h3>
            <p>
              Under <a href="/lister">Verslister</a> kan du samle bibelvers i navngitte lister for
              manuskripter, bibeltimer eller studier. Skriv inn referanser som &quot;Joh 3,16&quot;
              eller &quot;Sal 23,1-6&quot; for å legge til vers. Du kan endre rekkefølge og kopiere
              en lenke som viser alle versene.
            </p>

            <h3>Manuskripter</h3>
            <p>
              Under <a href="/manuskripter">Manuskripter</a> kan du skrive andakter, prekener,
              bibeltimer og andre tekster. Bruk <code>[ref:Joh 3,16]</code> for å sette inn
              versreferanser. Sidepanelet gir deg tilgang til:
            </p>
            <ul>
              <li><strong>Bibel</strong> - Slå opp og sett inn vers direkte i teksten</li>
              <li><strong>Manuskripter</strong> - Søk i andre manuskripter</li>
              <li><strong>Kontekst</strong> - Automatisk sammendrag og historisk kontekst for refererte kapitler</li>
              <li><strong>Tidslinje</strong> - Tidslinjehendelser knyttet til refererte kapitler</li>
            </ul>

            <h3>Hjelpemidler-panelet</h3>
            <p>
              På mobil, trykk på tannhjulet (⚙) for å åpne hjelpemidler. På desktop vises disse i
              et sidepanel.
            </p>
          </section>

          <section id="offline" class="about-section">
            <h2>Offline-tilgang</h2>
            <p>
              Denne siden fungerer også uten internett. Kapitler du har lest blir automatisk
              lagret på enheten din, slik at du kan lese dem igjen selv om du er offline.
            </p>

            <h3>Automatisk lagring</h3>
            <p>
              Når du leser et kapittel, lagres det automatisk i nettleserens cache. Neste gang du
              besøker det samme kapittelet uten nett, vises den lagrede versjonen.
            </p>

            <h3>Last ned hele Bibelen</h3>
            <p>
              Du kan også laste ned hele bibelversjoner på forhånd. Gå til{' '}
              <a href="/offline">offline-siden</a> for å:
            </p>
            <ul>
              <li>Se hvilke kapitler som er lagret</li>
              <li>Laste ned hele bibelversjoner (bokmål, nynorsk, gresk, hebraisk)</li>
              <li>Se hvor mye lagringsplass som brukes</li>
              <li>Slette lagrede data</li>
            </ul>

            <h3>Oppdateringer</h3>
            <p>
              Når bibeldataene oppdateres på serveren, får du en melding om å oppdatere de
              lagrede kapitlene. Du kan velge å oppdatere med en gang eller vente til senere.
            </p>
          </section>

          <section class="about-section">
            <h2>Kontakt</h2>
            <p>Vegard Hanssen</p>
            <p>
              E-post: <a href="mailto:Vegard.Hanssen@menneske.no">Vegard.Hanssen@menneske.no</a>
            </p>
            <p>
              Tlf: <a href="tel:+4740401214">+47 404 01 214</a>
            </p>
            <p>
              Feil og forslag kan også meldes inn på GitHub:{' '}
              <a href="https://github.com/flogvit/free-bible/issues" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/free-bible/issues
              </a>
            </p>
          </section>
        </div>
      </div>
    </Layout>,
  ),
);

r.get('/tilgjengelighet', (c) =>
  c.html(
    <Layout title="Tilgjengelighet — FLOGVIT.bibel" description="Tilgjengelighetserklæring for bibelsiden: WCAG 2.2 AA, tastaturnavigasjon, skjermleserstøtte." styles={['about.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Tilgjengelighet' }]} />

          <h1>Tilgjengelighetserklæring</h1>

          <section class="about-section">
            <h2>Om tilgjengelighet på denne siden</h2>
            <p>
              bibel.flogvit.no er utviklet for å være tilgjengelig for alle, uavhengig av
              funksjonsevne. Siden oppfyller kravene i WCAG 2.2 på nivå AA.
            </p>
          </section>

          <section class="about-section">
            <h2>Status</h2>
            <p>
              <strong>Samsvarsstatus:</strong> Delvis i samsvar med WCAG 2.2 AA
            </p>
            <p>
              Siden er testet og utviklet med tanke på tilgjengelighet. Manuell testing med
              skjermlesere gjenstår.
            </p>
          </section>

          <section class="about-section">
            <h2>Kjente begrensninger</h2>
            <p>Vi er klar over følgende områder som kan ha tilgjengelighetsproblemer:</p>
            <ul>
              <li>Ikke alle funksjoner er testet med skjermlesere (VoiceOver/NVDA)</li>
            </ul>
            <p>Vi jobber aktivt med å teste og utbedre eventuelle problemer.</p>
          </section>

          <section class="about-section">
            <h2>Hva gjør vi?</h2>
            <h3>Struktur og semantikk</h3>
            <ul>
              <li>Semantisk og strukturert HTML med korrekte landmark-regioner</li>
              <li>Skip-link for å hoppe direkte til hovedinnhold</li>
              <li>Korrekt overskriftshierarki (h1-h6)</li>
              <li>Breadcrumbs på alle sider for orientering</li>
              <li>Språkmerking på hebraisk og gresk tekst (lang-attributt)</li>
              <li>Forkortelser forklart med abbr-tag</li>
              <li>ARIA-labels på alle interaktive elementer</li>
              <li>aria-live regioner for statusmeldinger</li>
            </ul>

            <h3>Visuell tilgjengelighet</h3>
            <ul>
              <li>Fargekontrast som oppfyller WCAG AA-krav (4.5:1)</li>
              <li>Informasjon formidles aldri kun via farge (ikoner/symboler i tillegg)</li>
              <li>Tydelig fokusindikator på alle klikkbare elementer</li>
              <li>Tilpassbar tekststørrelse (liten/medium/stor)</li>
              <li>Mørk modus for redusert lysbelastning</li>
              <li>Støtte for høykontrastmodus (prefers-contrast)</li>
              <li>Støtte for redusert bevegelse (prefers-reduced-motion)</li>
              <li>Minimum klikkbar størrelse 24x24px (WCAG 2.5.8)</li>
            </ul>

            <h3>Navigasjon</h3>
            <ul>
              <li>Konsistent plassering av navigasjon, header og footer</li>
              <li>Flere måter å finne innhold (søk, meny, breadcrumbs, sitemap)</li>
              <li>Beskrivende lenketekster og aria-labels</li>
              <li>Ingen uventede kontekstendringer ved fokus eller input</li>
              <li>Konsistent hjelp tilgjengelig via Footer (WCAG 3.2.6)</li>
            </ul>

            <h3>Tastaturnavigasjon</h3>
            <ul>
              <li>Alle funksjoner tilgjengelige via tastatur</li>
              <li>Fokus skjules ikke bak sticky elementer (WCAG 2.4.11)</li>
              <li>Logisk tab-rekkefølge</li>
              <li>Ingen tastaturfeller</li>
            </ul>

            <h3>Hurtigtaster</h3>
            <p>Trykk <kbd>?</kbd> for å se alle tilgjengelige hurtigtaster.</p>
            <ul>
              <li><kbd>?</kbd> - Vis/skjul hurtigtasthjelp</li>
              <li><kbd>/</kbd> eller <kbd>Ctrl</kbd>+<kbd>K</kbd> - Gå til søkefeltet</li>
              <li><kbd>←</kbd> / <kbd>→</kbd> - Forrige/neste kapittel</li>
              <li><kbd>1-9</kbd> - Hopp til vers 1-9</li>
              <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> - Gå til forsiden</li>
            </ul>

            <h3>Skjemaer og feilhåndtering</h3>
            <ul>
              <li>Tydelige labels og instruksjoner på alle skjemafelt</li>
              <li>Beskrivende feilmeldinger på norsk</li>
              <li>Placeholder-tekster som veileder brukeren</li>
            </ul>

            <h3>Testing og kvalitetssikring</h3>
            <ul>
              <li>Automatisk tilgjengelighetstesting</li>
              <li>Validert HTML</li>
            </ul>
          </section>

          <section class="about-section">
            <h2>Tilbakemelding</h2>
            <p>
              Opplever du problemer med tilgjengeligheten på siden? Vi setter pris på
              tilbakemeldinger slik at vi kan forbedre oss.
            </p>
            <p>
              <strong>Kontakt:</strong>
            </p>
            <p>
              E-post: <a href="mailto:Vegard.Hanssen@menneske.no">Vegard.Hanssen@menneske.no</a>
            </p>
            <p>
              Du kan også melde inn problemer på GitHub:{' '}
              <a href="https://github.com/flogvit/free-bible/issues" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/free-bible/issues
              </a>
            </p>
          </section>

          <section class="about-section">
            <h2>Tilsynsmyndighet</h2>
            <p>
              Digitaliseringsdirektoratet (Digdir) er tilsynsmyndighet for universell utforming av
              IKT i Norge. Hvis du mener at vi ikke har svart tilfredsstillende på din
              henvendelse, kan du kontakte Digdir.
            </p>
            <p>
              <a href="https://uutilsynet.no/" target="_blank" rel="noopener noreferrer">
                uutilsynet.no
              </a>
            </p>
          </section>

          <section class="about-section">
            <p>
              <em>Sist oppdatert: Januar 2026</em>
            </p>
          </section>
        </div>
      </div>
    </Layout>,
  ),
);

/** 404-siden — koblet via app.notFound i app.ts. */
export function NotFoundPage() {
  return (
    <Layout title="Siden finnes ikke — FLOGVIT.bibel">
      <div class="reading-container" style="text-align: center; padding: 4rem 1rem;">
        <h1>404 - Siden finnes ikke</h1>
        <p>Beklager, vi finner ikke siden du leter etter.</p>
        <a href="/">Gå til forsiden</a>
      </div>
    </Layout>
  );
}

export default r;
