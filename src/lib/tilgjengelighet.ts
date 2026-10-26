/* FLOGVIT — tilgjengelighetserklæringen (portal/TILGJENGELIGHET.md, flogvit-com#341).
 *
 * KOPI. Fila eies av portal/design/tilgjengelighet.ts og er lik byte for byte i
 * hvert produkt. Endre den i portalen, og skriv kopiene med `bun
 * tilgjengelighetkopi.ts --skriv` i meta-repoet; produktets egen test feller når
 * kopien avviker.
 *
 * Siden er den samme overalt; DATAENE er flatas egne. Hver flate gir en
 * `Erklaering` (status, datoer, kjente brudd) og setter `side()` inn i sin egen
 * layout på `/<lang>/tilgjengelighet`. Strukturen følger EU-malen
 * (gjennomføringsbeslutning 2018/1523) som uustatus.no bygger på: status for
 * samsvar, innhold som ikke er tilgjengelig (per suksesskriterium), hvordan
 * erklæringen ble laget, tilbakemelding, og tilsynet.
 *
 * Ingen import: fila skal kunne kopieres inn i en hvilken som helst stack som
 * kjører TypeScript (hono/jsx, statisk bygg). `side()` gir en HTML-streng, og
 * all tekst i den er escapet her.
 */

export const LANGS = ['en', 'nb', 'nn', 'sv', 'fr', 'es', 'fi', 'de'] as const;
export type Lang = (typeof LANGS)[number];

/** Stien under språkprefikset: `/<lang>/tilgjengelighet`. Lik på alle språk, som `/vilkar`. */
export const STI = '/tilgjengelighet';

/** Hvor tilbakemeldinger går, med mindre flata har en egen adresse. */
export const EPOST = 'support@flogvit.com';

/** Hvor gammel en test kan være før erklæringen regnes som utgått. EU-malen: minst årlig. */
export const MAKS_ALDER_DAGER = 365;

export type Status = 'fullt' | 'delvis' | 'ikke';

/** En tekst flata skriver selv. Engelsk og bokmål er påkrevd; et språk som mangler, vises på engelsk (nn: bokmål) med riktig `lang`. */
export type Tekst = { en: string; nb: string } & Partial<Record<Lang, string>>;

export interface Brudd {
  /** Suksesskriteriet, f.eks. `'1.4.3'`. Må være et A- eller AA-kriterium i WCAG 2.1. */
  kriterium: string;
  /** Hva som ikke virker, og hva det betyr for den som bruker siden. */
  hva: Tekst;
  /** Når det etter planen er rettet (ISO-dato), om det er bestemt. */
  rettes?: string;
}

export interface Erklaering {
  /** Vertsnavnet, f.eks. `'bible.flogvit.com'`. */
  nettsted: string;
  status: Status;
  /** Når erklæringen først ble laget (ISO-dato). */
  laget: string;
  /** Når den sist ble gjennomgått og oppdatert (ISO-dato). */
  oppdatert: string;
  /** Når flata sist ble testet mot WCAG 2.1 AA (ISO-dato). */
  testet: string;
  /** Kjente brudd. Tom liste krever `status: 'fullt'`. */
  brudd: Brudd[];
  /** Egen adresse for tilbakemeldinger; ellers `EPOST`. */
  epost?: string;
  /** Hva som ble testet, med flatas egne ord (sidetyper), om den vil si det. */
  omfang?: Tekst;
}

/* --------------------------------------------------------------- strenger --- */

/* chrome-i18n.json: `a11y.*` (og `footer.a11y` for `lenke`) — portalens test
   holder dem like. `{nettsted}`, `{dato}`, `{epost}`, `{tilsynet}` fylles inn. */
export const STRENGER: Record<Lang, Record<string, string>> = {
  en: {
    lenke: 'Accessibility',
    title: 'Accessibility statement',
    meta: 'Accessibility statement for {nettsted}: how the site meets WCAG 2.1 AA, what does not yet, and how to tell us.',
    intro: 'FLOGVIT wants everyone to be able to use {nettsted}. This statement describes how the site meets the requirements for universal design of ICT: the success criteria of WCAG 2.1 at levels A and AA, which the Norwegian regulations refer to.',
    statusH: 'Conformance status',
    fullt: '{nettsted} is fully conformant with WCAG 2.1 AA.',
    delvis: '{nettsted} is partially conformant with WCAG 2.1 AA. The content listed below does not meet the requirements yet.',
    ikke: '{nettsted} is not conformant with WCAG 2.1 AA. The content listed below does not meet the requirements.',
    bruddH: 'Content that is not accessible',
    bruddIntro: 'These requirements are not met yet:',
    ingenBrudd: 'We know of no content on the site that fails these requirements.',
    nivaa: 'level',
    rettes: 'Planned fixed by {dato}.',
    metodeH: 'How the statement was made',
    metode: 'This is a self-assessment made by FLOGVIT. Every page type was tested in a real browser with the automated tool axe-core against WCAG 2.0 and 2.1 levels A and AA, and checked by hand: use with the keyboard only, visible focus, colour contrast, text alternatives, form labels, language marking, zoom to 200 %, and text enlarged to 150 % on screens 320 and 390 pixels wide. The automated test runs again before every change to the site is published.',
    testet: 'Last tested: {dato}.',
    datoer: 'The statement was prepared on {laget} and last updated on {oppdatert}. We review it at least once a year, and whenever the site changes substantially.',
    tilbakemeldingH: 'Feedback and contact',
    tilbakemelding: 'Is something on the site hard to use, or do you need content in another form? Write to us at {epost}. Tell us which page it is and what happened, and we will answer you.',
    tilsynH: 'Supervisory authority',
    tilsyn: 'The Authority for Universal Design of ICT (Tilsynet for universell utforming av ikt), part of the Norwegian Digitalisation Agency, supervises that websites in Norway meet the requirements. If you are not satisfied with our answer, you can tell them at {tilsynet}.',
    modell: 'The statement follows the model used on uustatus.no, the Norwegian Digitalisation Agency’s service for statements from public bodies. FLOGVIT is not a public body, so the statement is published here rather than there.',
  },
  nb: {
    lenke: 'Tilgjengelighet',
    title: 'Tilgjengelighetserklæring',
    meta: 'Tilgjengelighetserklæring for {nettsted}: hvordan nettstedet oppfyller WCAG 2.1 AA, hva som ikke gjør det ennå, og hvordan du sier fra.',
    intro: 'FLOGVIT vil at alle skal kunne bruke {nettsted}. Denne erklæringen beskriver hvordan nettstedet oppfyller kravene til universell utforming av ikt: suksesskriteriene i WCAG 2.1 på nivå A og AA, som forskriften viser til.',
    statusH: 'Status for samsvar',
    fullt: '{nettsted} er fullt ut i samsvar med WCAG 2.1 AA.',
    delvis: '{nettsted} er delvis i samsvar med WCAG 2.1 AA. Innholdet som står under, oppfyller ikke kravene ennå.',
    ikke: '{nettsted} er ikke i samsvar med WCAG 2.1 AA. Innholdet som står under, oppfyller ikke kravene.',
    bruddH: 'Innhold som ikke er tilgjengelig',
    bruddIntro: 'Disse kravene er ikke oppfylt ennå:',
    ingenBrudd: 'Vi kjenner ikke til innhold på nettstedet som bryter disse kravene.',
    nivaa: 'nivå',
    rettes: 'Planlagt rettet innen {dato}.',
    metodeH: 'Slik ble erklæringen laget',
    metode: 'Dette er en egenvurdering gjort av FLOGVIT. Hver sidetype ble testet i en ekte nettleser med det automatiske verktøyet axe-core mot WCAG 2.0 og 2.1 nivå A og AA, og sjekket for hånd: bruk med bare tastatur, synlig fokus, fargekontrast, tekstalternativer, ledetekster i skjemaer, språkmerking, forstørring til 200 %, og tekst forstørret til 150 % på skjermer som er 320 og 390 piksler brede. Den automatiske testen kjøres på nytt før hver endring av nettstedet blir lagt ut.',
    testet: 'Sist testet: {dato}.',
    datoer: 'Erklæringen ble laget {laget} og sist oppdatert {oppdatert}. Vi går gjennom den minst én gang i året, og når nettstedet endres vesentlig.',
    tilbakemeldingH: 'Tilbakemelding og kontakt',
    tilbakemelding: 'Er noe på nettstedet vanskelig å bruke, eller trenger du innholdet i en annen form? Skriv til oss på {epost}. Si hvilken side det gjelder og hva som skjedde, så svarer vi deg.',
    tilsynH: 'Tilsyn',
    tilsyn: 'Tilsynet for universell utforming av ikt, en del av Digitaliseringsdirektoratet, fører tilsyn med at nettsteder i Norge oppfyller kravene. Er du ikke fornøyd med svaret fra oss, kan du si fra til dem på {tilsynet}.',
    modell: 'Erklæringen følger modellen som brukes på uustatus.no, Digitaliseringsdirektoratets løsning for erklæringer fra offentlige virksomheter. FLOGVIT er ikke en offentlig virksomhet, så erklæringen står her og ikke der.',
  },
  nn: {
    lenke: 'Tilgjenge',
    title: 'Tilgjengeerklæring',
    meta: 'Tilgjengeerklæring for {nettsted}: korleis nettstaden oppfyller WCAG 2.1 AA, kva som ikkje gjer det enno, og korleis du seier frå.',
    intro: 'FLOGVIT vil at alle skal kunne bruke {nettsted}. Denne erklæringa skildrar korleis nettstaden oppfyller krava til universell utforming av ikt: suksesskriteria i WCAG 2.1 på nivå A og AA, som forskrifta viser til.',
    statusH: 'Status for samsvar',
    fullt: '{nettsted} er fullt ut i samsvar med WCAG 2.1 AA.',
    delvis: '{nettsted} er delvis i samsvar med WCAG 2.1 AA. Innhaldet som står under, oppfyller ikkje krava enno.',
    ikke: '{nettsted} er ikkje i samsvar med WCAG 2.1 AA. Innhaldet som står under, oppfyller ikkje krava.',
    bruddH: 'Innhald som ikkje er tilgjengeleg',
    bruddIntro: 'Desse krava er ikkje oppfylte enno:',
    ingenBrudd: 'Vi kjenner ikkje til innhald på nettstaden som bryt desse krava.',
    nivaa: 'nivå',
    rettes: 'Planlagt retta innan {dato}.',
    metodeH: 'Slik vart erklæringa laga',
    metode: 'Dette er ei eigenvurdering gjord av FLOGVIT. Kvar sidetype vart testa i ein ekte nettlesar med det automatiske verktøyet axe-core mot WCAG 2.0 og 2.1 nivå A og AA, og sjekka for hand: bruk med berre tastatur, synleg fokus, fargekontrast, tekstalternativ, leietekstar i skjema, språkmerking, forstørring til 200 %, og tekst forstørra til 150 % på skjermar som er 320 og 390 pikslar breie. Den automatiske testen køyrer på nytt før kvar endring av nettstaden blir lagd ut.',
    testet: 'Sist testa: {dato}.',
    datoer: 'Erklæringa vart laga {laget} og sist oppdatert {oppdatert}. Vi går gjennom ho minst éin gong i året, og når nettstaden blir endra vesentleg.',
    tilbakemeldingH: 'Tilbakemelding og kontakt',
    tilbakemelding: 'Er noko på nettstaden vanskeleg å bruke, eller treng du innhaldet i ei anna form? Skriv til oss på {epost}. Sei kva side det gjeld og kva som skjedde, så svarar vi deg.',
    tilsynH: 'Tilsyn',
    tilsyn: 'Tilsynet for universell utforming av ikt, ein del av Digitaliseringsdirektoratet, fører tilsyn med at nettstader i Noreg oppfyller krava. Er du ikkje nøgd med svaret frå oss, kan du seie frå til dei på {tilsynet}.',
    modell: 'Erklæringa følgjer modellen som blir brukt på uustatus.no, Digitaliseringsdirektoratet si løysing for erklæringar frå offentlege verksemder. FLOGVIT er ikkje ei offentleg verksemd, så erklæringa står her og ikkje der.',
  },
  sv: {
    lenke: 'Tillgänglighet',
    title: 'Tillgänglighetsredogörelse',
    meta: 'Tillgänglighetsredogörelse för {nettsted}: hur webbplatsen uppfyller WCAG 2.1 AA, vad som inte gör det ännu och hur du säger till.',
    intro: 'FLOGVIT vill att alla ska kunna använda {nettsted}. Den här redogörelsen beskriver hur webbplatsen uppfyller kraven på universell utformning av IKT: framgångskriterierna i WCAG 2.1 på nivå A och AA, som de norska föreskrifterna hänvisar till.',
    statusH: 'Överensstämmelse',
    fullt: '{nettsted} är helt förenlig med WCAG 2.1 AA.',
    delvis: '{nettsted} är delvis förenlig med WCAG 2.1 AA. Innehållet som listas nedan uppfyller inte kraven ännu.',
    ikke: '{nettsted} är inte förenlig med WCAG 2.1 AA. Innehållet som listas nedan uppfyller inte kraven.',
    bruddH: 'Innehåll som inte är tillgängligt',
    bruddIntro: 'De här kraven är inte uppfyllda ännu:',
    ingenBrudd: 'Vi känner inte till något innehåll på webbplatsen som bryter mot de här kraven.',
    nivaa: 'nivå',
    rettes: 'Planerat åtgärdat senast {dato}.',
    metodeH: 'Så togs redogörelsen fram',
    metode: 'Det här är en självskattning som FLOGVIT har gjort. Varje sidtyp testades i en riktig webbläsare med det automatiska verktyget axe-core mot WCAG 2.0 och 2.1 nivå A och AA, och kontrollerades manuellt: användning med enbart tangentbord, synligt fokus, färgkontrast, textalternativ, etiketter i formulär, språkmärkning, förstoring till 200 % och text förstorad till 150 % på skärmar som är 320 och 390 pixlar breda. Det automatiska testet körs igen innan varje ändring av webbplatsen publiceras.',
    testet: 'Senast testad: {dato}.',
    datoer: 'Redogörelsen togs fram {laget} och uppdaterades senast {oppdatert}. Vi går igenom den minst en gång om året och när webbplatsen ändras väsentligt.',
    tilbakemeldingH: 'Återkoppling och kontakt',
    tilbakemelding: 'Är något på webbplatsen svårt att använda, eller behöver du innehållet i en annan form? Skriv till oss på {epost}. Berätta vilken sida det gäller och vad som hände, så svarar vi dig.',
    tilsynH: 'Tillsyn',
    tilsyn: 'Tillsynsmyndigheten för universell utformning av IKT (Tilsynet for universell utforming av ikt), en del av Norges digitaliseringsmyndighet, utövar tillsyn över att webbplatser i Norge uppfyller kraven. Om du inte är nöjd med vårt svar kan du vända dig till dem på {tilsynet}.',
    modell: 'Redogörelsen följer modellen som används på uustatus.no, Norges digitaliseringsmyndighets tjänst för redogörelser från offentliga verksamheter. FLOGVIT är inte en offentlig verksamhet, så redogörelsen publiceras här och inte där.',
  },
  fr: {
    lenke: 'Accessibilité',
    title: 'Déclaration d’accessibilité',
    meta: 'Déclaration d’accessibilité de {nettsted} : comment le site respecte les WCAG 2.1 AA, ce qui ne le fait pas encore, et comment nous le signaler.',
    intro: 'FLOGVIT souhaite que tout le monde puisse utiliser {nettsted}. Cette déclaration décrit comment le site respecte les exigences de conception universelle des TIC : les critères de succès des WCAG 2.1 aux niveaux A et AA, auxquels renvoie la réglementation norvégienne.',
    statusH: 'État de conformité',
    fullt: '{nettsted} est totalement conforme aux WCAG 2.1 AA.',
    delvis: '{nettsted} est partiellement conforme aux WCAG 2.1 AA. Le contenu indiqué ci-dessous ne respecte pas encore les exigences.',
    ikke: '{nettsted} n’est pas conforme aux WCAG 2.1 AA. Le contenu indiqué ci-dessous ne respecte pas les exigences.',
    bruddH: 'Contenu non accessible',
    bruddIntro: 'Ces exigences ne sont pas encore respectées :',
    ingenBrudd: 'Nous n’avons connaissance d’aucun contenu du site qui ne respecte pas ces exigences.',
    nivaa: 'niveau',
    rettes: 'Correction prévue d’ici le {dato}.',
    metodeH: 'Établissement de cette déclaration',
    metode: 'Il s’agit d’une auto-évaluation réalisée par FLOGVIT. Chaque type de page a été testé dans un vrai navigateur avec l’outil automatique axe-core selon les WCAG 2.0 et 2.1 niveaux A et AA, puis vérifié manuellement : utilisation au clavier seul, focus visible, contraste des couleurs, alternatives textuelles, étiquettes de formulaire, indication de la langue, zoom à 200 % et texte agrandi à 150 % sur des écrans de 320 et 390 pixels de large. Le test automatique est relancé avant chaque modification publiée du site.',
    testet: 'Dernier test : {dato}.',
    datoer: 'La déclaration a été établie le {laget} et mise à jour pour la dernière fois le {oppdatert}. Nous la revoyons au moins une fois par an, et chaque fois que le site change de façon importante.',
    tilbakemeldingH: 'Retour d’information et contact',
    tilbakemelding: 'Quelque chose sur le site est difficile à utiliser, ou vous avez besoin du contenu sous une autre forme ? Écrivez-nous à {epost}. Indiquez la page concernée et ce qui s’est passé, et nous vous répondrons.',
    tilsynH: 'Autorité de contrôle',
    tilsyn: 'L’Autorité pour la conception universelle des TIC (Tilsynet for universell utforming av ikt), rattachée à l’Agence norvégienne du numérique, contrôle que les sites web en Norvège respectent les exigences. Si notre réponse ne vous satisfait pas, vous pouvez vous adresser à elle sur {tilsynet}.',
    modell: 'La déclaration suit le modèle utilisé sur uustatus.no, le service de l’Agence norvégienne du numérique pour les déclarations des organismes publics. FLOGVIT n’est pas un organisme public : la déclaration est donc publiée ici et non là-bas.',
  },
  es: {
    lenke: 'Accesibilidad',
    title: 'Declaración de accesibilidad',
    meta: 'Declaración de accesibilidad de {nettsted}: cómo cumple el sitio las WCAG 2.1 AA, qué no lo hace todavía y cómo avisarnos.',
    intro: 'FLOGVIT quiere que todo el mundo pueda usar {nettsted}. Esta declaración describe cómo cumple el sitio los requisitos de diseño universal de las TIC: los criterios de conformidad de las WCAG 2.1 en los niveles A y AA, a los que remite la normativa noruega.',
    statusH: 'Situación de cumplimiento',
    fullt: '{nettsted} es plenamente conforme con las WCAG 2.1 AA.',
    delvis: '{nettsted} es parcialmente conforme con las WCAG 2.1 AA. El contenido que se indica abajo todavía no cumple los requisitos.',
    ikke: '{nettsted} no es conforme con las WCAG 2.1 AA. El contenido que se indica abajo no cumple los requisitos.',
    bruddH: 'Contenido no accesible',
    bruddIntro: 'Estos requisitos todavía no se cumplen:',
    ingenBrudd: 'No conocemos ningún contenido del sitio que incumpla estos requisitos.',
    nivaa: 'nivel',
    rettes: 'Corrección prevista antes del {dato}.',
    metodeH: 'Cómo se elaboró la declaración',
    metode: 'Se trata de una autoevaluación realizada por FLOGVIT. Cada tipo de página se probó en un navegador real con la herramienta automática axe-core según las WCAG 2.0 y 2.1 niveles A y AA, y se revisó a mano: uso solo con teclado, foco visible, contraste de color, alternativas textuales, etiquetas de formulario, marcado del idioma, ampliación al 200 % y texto ampliado al 150 % en pantallas de 320 y 390 píxeles de ancho. La prueba automática se ejecuta de nuevo antes de publicar cada cambio del sitio.',
    testet: 'Última prueba: {dato}.',
    datoer: 'La declaración se elaboró el {laget} y se actualizó por última vez el {oppdatert}. La revisamos al menos una vez al año y cada vez que el sitio cambia de forma importante.',
    tilbakemeldingH: 'Comentarios y contacto',
    tilbakemelding: '¿Hay algo en el sitio difícil de usar, o necesitas el contenido en otro formato? Escríbenos a {epost}. Dinos qué página es y qué ocurrió, y te responderemos.',
    tilsynH: 'Autoridad de control',
    tilsyn: 'La Autoridad de Diseño Universal de las TIC (Tilsynet for universell utforming av ikt), parte de la Agencia Noruega de Digitalización, supervisa que los sitios web en Noruega cumplan los requisitos. Si no estás satisfecho con nuestra respuesta, puedes dirigirte a ella en {tilsynet}.',
    modell: 'La declaración sigue el modelo de uustatus.no, el servicio de la Agencia Noruega de Digitalización para las declaraciones de los organismos públicos. FLOGVIT no es un organismo público, por lo que la declaración se publica aquí y no allí.',
  },
  fi: {
    lenke: 'Saavutettavuus',
    title: 'Saavutettavuusseloste',
    meta: 'Saavutettavuusseloste: {nettsted}. Miten sivusto täyttää WCAG 2.1 AA -vaatimukset, mikä ei vielä täytä niitä ja miten voit kertoa meille.',
    intro: 'FLOGVIT haluaa, että kaikki voivat käyttää sivustoa {nettsted}. Tämä seloste kertoo, miten sivusto täyttää tieto- ja viestintätekniikan esteettömyysvaatimukset: WCAG 2.1 -ohjeiden A- ja AA-tason onnistumiskriteerit, joihin Norjan säädökset viittaavat.',
    statusH: 'Vaatimustenmukaisuus',
    fullt: '{nettsted} täyttää WCAG 2.1 AA -vaatimukset kokonaan.',
    delvis: '{nettsted} täyttää WCAG 2.1 AA -vaatimukset osittain. Alla luetellut sisällöt eivät vielä täytä vaatimuksia.',
    ikke: '{nettsted} ei täytä WCAG 2.1 AA -vaatimuksia. Alla luetellut sisällöt eivät täytä vaatimuksia.',
    bruddH: 'Sisältö, joka ei ole saavutettavaa',
    bruddIntro: 'Nämä vaatimukset eivät vielä täyty:',
    ingenBrudd: 'Emme tiedä sivustolla olevan sisältöä, joka ei täytä näitä vaatimuksia.',
    nivaa: 'taso',
    rettes: 'Korjaus suunniteltu viimeistään {dato}.',
    metodeH: 'Miten seloste laadittiin',
    metode: 'Tämä on FLOGVITin tekemä itsearviointi. Jokainen sivutyyppi testattiin oikeassa selaimessa automaattisella axe-core-työkalulla WCAG 2.0- ja 2.1-ohjeiden A- ja AA-tasoa vasten, ja tarkistettiin käsin: käyttö pelkällä näppäimistöllä, näkyvä kohdistus, värikontrasti, tekstivastineet, lomakkeiden nimilaput, kielen merkitseminen, suurennus 200 prosenttiin sekä 150 prosenttiin suurennettu teksti 320 ja 390 pikselin levyisillä näytöillä. Automaattinen testi ajetaan uudelleen ennen kuin sivustoon tehty muutos julkaistaan.',
    testet: 'Viimeksi testattu: {dato}.',
    datoer: 'Seloste on laadittu {laget} ja päivitetty viimeksi {oppdatert}. Käymme sen läpi vähintään kerran vuodessa ja aina, kun sivusto muuttuu olennaisesti.',
    tilbakemeldingH: 'Palaute ja yhteystiedot',
    tilbakemelding: 'Onko jokin sivustolla vaikea käyttää, tai tarvitsetko sisällön toisessa muodossa? Kirjoita meille osoitteeseen {epost}. Kerro, mistä sivusta on kyse ja mitä tapahtui, niin vastaamme sinulle.',
    tilsynH: 'Valvontaviranomainen',
    tilsyn: 'Tieto- ja viestintätekniikan esteettömyyden valvontaviranomainen (Tilsynet for universell utforming av ikt), joka on osa Norjan digitalisaatiovirastoa, valvoo, että Norjassa toimivat verkkosivustot täyttävät vaatimukset. Jos et ole tyytyväinen vastaukseemme, voit ottaa yhteyttä viranomaiseen osoitteessa {tilsynet}.',
    modell: 'Seloste noudattaa mallia, jota käytetään uustatus.no-palvelussa, Norjan digitalisaatioviraston palvelussa julkisten toimijoiden selosteille. FLOGVIT ei ole julkinen toimija, joten seloste julkaistaan täällä eikä siellä.',
  },
  de: {
    lenke: 'Barrierefreiheit',
    title: 'Erklärung zur Barrierefreiheit',
    meta: 'Erklärung zur Barrierefreiheit für {nettsted}: wie die Website WCAG 2.1 AA erfüllt, was noch nicht, und wie Sie uns Bescheid geben.',
    intro: 'FLOGVIT möchte, dass alle {nettsted} nutzen können. Diese Erklärung beschreibt, wie die Website die Anforderungen an die universelle Gestaltung von IKT erfüllt: die Erfolgskriterien der WCAG 2.1 auf den Stufen A und AA, auf die die norwegischen Vorschriften verweisen.',
    statusH: 'Stand der Vereinbarkeit',
    fullt: '{nettsted} ist vollständig mit WCAG 2.1 AA vereinbar.',
    delvis: '{nettsted} ist teilweise mit WCAG 2.1 AA vereinbar. Die unten aufgeführten Inhalte erfüllen die Anforderungen noch nicht.',
    ikke: '{nettsted} ist nicht mit WCAG 2.1 AA vereinbar. Die unten aufgeführten Inhalte erfüllen die Anforderungen nicht.',
    bruddH: 'Nicht barrierefreie Inhalte',
    bruddIntro: 'Diese Anforderungen sind noch nicht erfüllt:',
    ingenBrudd: 'Uns sind keine Inhalte auf der Website bekannt, die diese Anforderungen nicht erfüllen.',
    nivaa: 'Stufe',
    rettes: 'Behebung geplant bis {dato}.',
    metodeH: 'Erstellung dieser Erklärung',
    metode: 'Dies ist eine Selbstbewertung von FLOGVIT. Jeder Seitentyp wurde in einem echten Browser mit dem automatischen Werkzeug axe-core gegen WCAG 2.0 und 2.1 Stufe A und AA getestet und von Hand geprüft: Bedienung nur mit der Tastatur, sichtbarer Fokus, Farbkontrast, Textalternativen, Formularbeschriftungen, Kennzeichnung der Sprache, Vergrößerung auf 200 % und auf 150 % vergrößerte Schrift auf 320 und 390 Pixel breiten Bildschirmen. Der automatische Test läuft erneut, bevor eine Änderung der Website veröffentlicht wird.',
    testet: 'Zuletzt getestet: {dato}.',
    datoer: 'Die Erklärung wurde am {laget} erstellt und zuletzt am {oppdatert} aktualisiert. Wir überprüfen sie mindestens einmal im Jahr und immer dann, wenn sich die Website wesentlich ändert.',
    tilbakemeldingH: 'Feedback und Kontakt',
    tilbakemelding: 'Ist etwas auf der Website schwer zu bedienen, oder brauchen Sie Inhalte in einer anderen Form? Schreiben Sie uns an {epost}. Nennen Sie die Seite und was passiert ist, und wir antworten Ihnen.',
    tilsynH: 'Aufsichtsbehörde',
    tilsyn: 'Die Aufsichtsbehörde für universelle Gestaltung von IKT (Tilsynet for universell utforming av ikt), Teil der norwegischen Digitalisierungsbehörde, überwacht, dass Websites in Norwegen die Anforderungen erfüllen. Sind Sie mit unserer Antwort nicht zufrieden, können Sie sich unter {tilsynet} an sie wenden.',
    modell: 'Die Erklärung folgt dem Muster von uustatus.no, dem Dienst der norwegischen Digitalisierungsbehörde für Erklärungen öffentlicher Stellen. FLOGVIT ist keine öffentliche Stelle, deshalb wird die Erklärung hier veröffentlicht und nicht dort.',
  },
};

/* ----------------------------------------------------- suksesskriteriene --- */

/**
 * WCAG 2.1 nivå A og AA — de kravene forskriften viser til. Navnet står på
 * engelsk (W3C) og bokmål (Difis/uutilsynets oversettelse); på de andre språkene
 * vises det engelske navnet, merket `lang="en"`.
 */
export const KRITERIER: Record<string, { nivaa: 'A' | 'AA'; en: string; nb: string }> = {
  '1.1.1': { nivaa: 'A', en: 'Non-text Content', nb: 'Ikke-tekstlig innhold' },
  '1.2.1': { nivaa: 'A', en: 'Audio-only and Video-only (Prerecorded)', nb: 'Bare lyd og bare video (forhåndsinnspilt)' },
  '1.2.2': { nivaa: 'A', en: 'Captions (Prerecorded)', nb: 'Teksting (forhåndsinnspilt)' },
  '1.2.3': { nivaa: 'A', en: 'Audio Description or Media Alternative (Prerecorded)', nb: 'Synstolking eller mediealternativ (forhåndsinnspilt)' },
  '1.2.4': { nivaa: 'AA', en: 'Captions (Live)', nb: 'Teksting (direkte)' },
  '1.2.5': { nivaa: 'AA', en: 'Audio Description (Prerecorded)', nb: 'Synstolking (forhåndsinnspilt)' },
  '1.3.1': { nivaa: 'A', en: 'Info and Relationships', nb: 'Informasjon og relasjoner' },
  '1.3.2': { nivaa: 'A', en: 'Meaningful Sequence', nb: 'Meningsfylt rekkefølge' },
  '1.3.3': { nivaa: 'A', en: 'Sensory Characteristics', nb: 'Sensoriske egenskaper' },
  '1.3.4': { nivaa: 'AA', en: 'Orientation', nb: 'Visningsretning' },
  '1.3.5': { nivaa: 'AA', en: 'Identify Input Purpose', nb: 'Identifiser formål med inndata' },
  '1.4.1': { nivaa: 'A', en: 'Use of Color', nb: 'Bruk av farge' },
  '1.4.2': { nivaa: 'A', en: 'Audio Control', nb: 'Styring av lyd' },
  '1.4.3': { nivaa: 'AA', en: 'Contrast (Minimum)', nb: 'Kontrast (minimum)' },
  '1.4.4': { nivaa: 'AA', en: 'Resize text', nb: 'Endring av tekststørrelse' },
  '1.4.5': { nivaa: 'AA', en: 'Images of Text', nb: 'Bilder av tekst' },
  '1.4.10': { nivaa: 'AA', en: 'Reflow', nb: 'Dynamisk tilpasning (Reflow)' },
  '1.4.11': { nivaa: 'AA', en: 'Non-text Contrast', nb: 'Kontrast for ikke-tekstlig innhold' },
  '1.4.12': { nivaa: 'AA', en: 'Text Spacing', nb: 'Tekstavstand' },
  '1.4.13': { nivaa: 'AA', en: 'Content on Hover or Focus', nb: 'Innhold ved pekerfokus eller tastaturfokus' },
  '2.1.1': { nivaa: 'A', en: 'Keyboard', nb: 'Tastatur' },
  '2.1.2': { nivaa: 'A', en: 'No Keyboard Trap', nb: 'Ingen tastaturfelle' },
  '2.1.4': { nivaa: 'A', en: 'Character Key Shortcuts', nb: 'Hurtigtaster som består av ett tegn' },
  '2.2.1': { nivaa: 'A', en: 'Timing Adjustable', nb: 'Justerbar hastighet' },
  '2.2.2': { nivaa: 'A', en: 'Pause, Stop, Hide', nb: 'Pause, stopp, skjul' },
  '2.3.1': { nivaa: 'A', en: 'Three Flashes or Below Threshold', nb: 'Terskelverdi på maksimalt tre glimt' },
  '2.4.1': { nivaa: 'A', en: 'Bypass Blocks', nb: 'Hoppe over blokker' },
  '2.4.2': { nivaa: 'A', en: 'Page Titled', nb: 'Sidetitler' },
  '2.4.3': { nivaa: 'A', en: 'Focus Order', nb: 'Fokusrekkefølge' },
  '2.4.4': { nivaa: 'A', en: 'Link Purpose (In Context)', nb: 'Formål med lenke (i kontekst)' },
  '2.4.5': { nivaa: 'AA', en: 'Multiple Ways', nb: 'Flere måter' },
  '2.4.6': { nivaa: 'AA', en: 'Headings and Labels', nb: 'Overskrifter og ledetekster' },
  '2.4.7': { nivaa: 'AA', en: 'Focus Visible', nb: 'Synlig fokus' },
  '2.5.1': { nivaa: 'A', en: 'Pointer Gestures', nb: 'Pekerbevegelser' },
  '2.5.2': { nivaa: 'A', en: 'Pointer Cancellation', nb: 'Pekeravbrytelse' },
  '2.5.3': { nivaa: 'A', en: 'Label in Name', nb: 'Ledetekst i navn' },
  '2.5.4': { nivaa: 'A', en: 'Motion Actuation', nb: 'Bevegelsesaktivering' },
  '3.1.1': { nivaa: 'A', en: 'Language of Page', nb: 'Språk på siden' },
  '3.1.2': { nivaa: 'AA', en: 'Language of Parts', nb: 'Språk på deler av innhold' },
  '3.2.1': { nivaa: 'A', en: 'On Focus', nb: 'Fokus' },
  '3.2.2': { nivaa: 'A', en: 'On Input', nb: 'Inndata' },
  '3.2.3': { nivaa: 'AA', en: 'Consistent Navigation', nb: 'Konsekvent navigering' },
  '3.2.4': { nivaa: 'AA', en: 'Consistent Identification', nb: 'Konsekvent identifikasjon' },
  '3.3.1': { nivaa: 'A', en: 'Error Identification', nb: 'Identifikasjon av feil' },
  '3.3.2': { nivaa: 'A', en: 'Labels or Instructions', nb: 'Ledetekster eller instruksjoner' },
  '3.3.3': { nivaa: 'AA', en: 'Error Suggestion', nb: 'Forslag ved feil' },
  '3.3.4': { nivaa: 'AA', en: 'Error Prevention (Legal, Financial, Data)', nb: 'Forhindring av feil (juridiske feil, økonomiske feil, datafeil)' },
  '4.1.1': { nivaa: 'A', en: 'Parsing', nb: 'Parsing (oppdeling)' },
  '4.1.2': { nivaa: 'A', en: 'Name, Role, Value', nb: 'Navn, rolle, verdi' },
  '4.1.3': { nivaa: 'AA', en: 'Status Messages', nb: 'Statusbeskjeder' },
};

/** W3Cs forklaring av kriteriet. Sluggen er det engelske navnet, slik W3C skriver den. */
export function kriterieUrl(nr: string): string {
  const slug = KRITERIER[nr]!.en.toLowerCase().replace(/[(),]/g, '').replace(/\s+/g, '-');
  return `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`;
}

/* ---------------------------------------------------------------- kontroll --- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dag = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Hva som er galt med en flates erklæring — tom liste når den holder. Produktets
 * test krever en tom liste, og datoen gjør at testen blir rød når erklæringen
 * er mer enn et år gammel: da er den ikke lenger en erklæring, bare en påstand.
 */
export function kontroller(e: Erklaering, idag: string = new Date().toISOString().slice(0, 10)): string[] {
  const feil: string[] = [];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(e.nettsted)) feil.push(`nettsted «${e.nettsted}» er ikke et vertsnavn`);
  for (const felt of ['laget', 'oppdatert', 'testet'] as const) {
    if (!ISO.test(e[felt]) || Number.isNaN(dag(e[felt]))) feil.push(`${felt} «${e[felt]}» er ikke en ISO-dato`);
    else if (dag(e[felt]) > dag(idag)) feil.push(`${felt} ${e[felt]} er etter i dag (${idag})`);
  }
  if (ISO.test(e.laget) && ISO.test(e.oppdatert) && dag(e.oppdatert) < dag(e.laget)) feil.push(`oppdatert ${e.oppdatert} er før laget ${e.laget}`);
  if (ISO.test(e.testet)) {
    const alder = (dag(idag) - dag(e.testet)) / 86_400_000;
    if (alder > MAKS_ALDER_DAGER) feil.push(`sist testet ${e.testet}, ${Math.floor(alder)} dager siden — test flata på nytt og oppdater erklæringen (TILGJENGELIGHET.md)`);
  }
  if (e.status === 'fullt' && e.brudd.length > 0) feil.push('status «fullt» med kjente brudd — da er den «delvis»');
  if (e.status !== 'fullt' && e.brudd.length === 0) feil.push(`status «${e.status}» uten ett eneste brudd — si hva, eller sett «fullt»`);
  for (const b of e.brudd) {
    if (!KRITERIER[b.kriterium]) feil.push(`brudd på «${b.kriterium}», som ikke er et A/AA-kriterium i WCAG 2.1`);
    if (!b.hva.en?.trim() || !b.hva.nb?.trim()) feil.push(`brudd på ${b.kriterium} mangler tekst på engelsk eller bokmål`);
    if (b.rettes !== undefined && !ISO.test(b.rettes)) feil.push(`brudd på ${b.kriterium}: rettes «${b.rettes}» er ikke en ISO-dato`);
  }
  if (e.epost !== undefined && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e.epost)) feil.push(`epost «${e.epost}» er ikke en adresse`);
  return feil;
}

/* -------------------------------------------------------------- rendering --- */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Språket teksten finnes på: språket selv, så bokmål for nynorsk, så engelsk. */
function velg<T extends Partial<Record<Lang, string>>>(t: T, lang: Lang): { tekst: string; lang: Lang } {
  for (const l of [lang, ...(lang === 'nn' ? (['nb'] as const) : []), 'en' as const]) {
    const v = t[l];
    if (v) return { tekst: v, lang: l };
  }
  return { tekst: '', lang: 'en' };
}

/** Teksten escapet, i et `<span lang>` når den står på et annet språk enn siden (WCAG 3.1.2). */
function paaSprak(t: Partial<Record<Lang, string>>, lang: Lang): string {
  const v = velg(t, lang);
  return v.lang === lang ? esc(v.tekst) : `<span lang="${v.lang}">${esc(v.tekst)}</span>`;
}

export function dato(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'nn' ? 'nn-NO' : lang === 'nb' ? 'nb-NO' : lang, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Fyll inn `{felt}`. Verdiene er ferdig HTML; malen escapes. */
function fyll(mal: string, verdier: Record<string, string>): string {
  return esc(mal).replace(/\{(\w+)\}/g, (_, k: string) => verdier[k] ?? `{${k}}`);
}

export const tekst = (lang: Lang, nøkkel: string): string => STRENGER[lang][nøkkel] ?? STRENGER.en[nøkkel]!;

/** `<title>`-teksten (uten produktets suffiks). */
export const tittel = (lang: Lang): string => tekst(lang, 'title');

/** Metabeskrivelsen, ren tekst. */
export const beskrivelse = (lang: Lang, e: Erklaering): string => tekst(lang, 'meta').replace('{nettsted}', e.nettsted);

/** Footer-lenkens tekst. Den er `footer.a11y` i chrome-i18n.json. */
export const lenketekst = (lang: Lang): string => tekst(lang, 'lenke');

/**
 * Erklæringen som HTML: `<article class="fv-a11y">` med én `<h1>` og en
 * `<h2>` per del. Produktet setter den inn i sin layout (`raw()` i hono/jsx),
 * og styler den med sine egne regler for `h1`, `h2`, `p` og `ul`.
 */
export function side(lang: Lang, e: Erklaering): string {
  const t = (k: string) => tekst(lang, k);
  const nettsted = `<strong>${esc(e.nettsted)}</strong>`;
  const epost = esc(e.epost ?? EPOST);
  const emne = encodeURIComponent(`${t('title')}: ${e.nettsted}`);
  const brudd = e.brudd.length === 0
    ? `<p>${esc(t('ingenBrudd'))}</p>`
    : `<p>${esc(t('bruddIntro'))}</p>
  <ul class="fv-a11y-brudd">
${e.brudd.map((b) => {
  const k = KRITERIER[b.kriterium]!;
  const navn = paaSprak({ en: k.en, nb: k.nb }, lang);
  const rettes = b.rettes ? ` ${fyll(t('rettes'), { dato: esc(dato(b.rettes, lang)) })}` : '';
  return `    <li><a href="${kriterieUrl(b.kriterium)}">${b.kriterium} ${navn}</a> (${esc(t('nivaa'))} ${k.nivaa}): ${paaSprak(b.hva, lang)}${rettes}</li>`;
}).join('\n')}
  </ul>`;
  return `<article class="fv-a11y" lang="${lang}">
  <h1>${esc(t('title'))}</h1>
  <p>${fyll(t('intro'), { nettsted })}</p>
  <h2>${esc(t('statusH'))}</h2>
  <p>${fyll(t(e.status), { nettsted })}</p>
  <h2>${esc(t('bruddH'))}</h2>
  ${brudd}
  <h2>${esc(t('metodeH'))}</h2>
  <p>${esc(t('metode'))}</p>${e.omfang ? `\n  <p>${paaSprak(e.omfang, lang)}</p>` : ''}
  <p>${fyll(t('testet'), { dato: esc(dato(e.testet, lang)) })}</p>
  <p>${fyll(t('datoer'), { laget: esc(dato(e.laget, lang)), oppdatert: esc(dato(e.oppdatert, lang)) })}</p>
  <h2>${esc(t('tilbakemeldingH'))}</h2>
  <p>${fyll(t('tilbakemelding'), { epost: `<a href="mailto:${epost}?subject=${emne}">${epost}</a>` })}</p>
  <h2>${esc(t('tilsynH'))}</h2>
  <p>${fyll(t('tilsyn'), { tilsynet: '<a href="https://www.uutilsynet.no/">uutilsynet.no</a>' })}</p>
  <p>${esc(t('modell'))}</p>
</article>`;
}
