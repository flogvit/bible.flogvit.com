/**
 * Historie-slugs som fikk ny form i korrekturen, og som må 301-e (#153).
 *
 * Kilden er free-bibles `generate/proofread_stories/nb/<slug>.json`: fila er
 * navngitt etter den NÅVÆRENDE slugen, og `revisedStory.slug` bærer formen
 * historien hadde da den ble korrekturlest. `pasken-og-uttogget` står i
 * free-bibles første historie-commit, altså har den vært en ekte, indeksert
 * adresse — crawlere med en eldre indeks ber fortsatt om den og fikk 404.
 *
 * Et par kom bare med når alle tre holdt (målt 2026-10-24 over 300 filer):
 *   - den nåværende slugen finnes som historie,
 *   - den gamle slugen finnes IKKE som historie (ellers er den en levende
 *     adresse, og en redirect ville tatt den fra leseren),
 *   - referansene i den gamle versjonen overlapper den nåværende historiens.
 *
 * Det tredje kravet er ikke pynt. Metadataen har par som åpenbart er feil —
 * `peters-tale-i-salomos-soylegang` står ved `josefs-far-jakob-kommer-til-egypt`
 * — og de tre slike parene feller alle på det andre kravet. De øvrige 57 parene
 * peker på en fil som ikke finnes i `stories/`, altså en historie som er borte
 * eller aldri ble publisert; dem gjetter vi ikke et mål for.
 *
 * Slugene er de samme på alle språk (`stories/en/` speiler `stories/nb/`), så
 * kartet gjelder uavhengig av locale.
 */
export const STORY_SLUG_ALIASES: Record<string, string> = {
  'daniel-og-nebukadnesars-drom': 'daniel-tyder-nebukadnesars-drom',
  'det-tapte-faret': 'den-bortkomne-sauen',
  'elisja-mottar-dobbel-del-av-elias-aand': 'elias-opprykkelse-og-elisjas-doble-del',
  'engelen-gabriel-besok-maria': 'engelen-gabriel-besoker-maria',
  'gjennomgangen-gjennom-rodehavet': 'israelittene-gar-gjennom-rodehavet',
  'hannah-ber-om-en-sonn': 'hanna-ber-om-en-sonn',
  'inntogget-i-jerusalem': 'inntoget-i-jerusalem',
  'jesus-renser-tempelet': 'tempelrenselsen',
  'lignelsen-om-sennepsfroet': 'sennepsfroet',
  'marias-lovprisning': 'marias-lovsang',
  'moses-sang': 'moses-sang-ved-havet',
  'ordsprakene-om-visdom': 'visdommen-roper-pa-torget',
  'pasken-og-uttogget': 'pasken-og-uttoget',
  'paulus-avskjedsord-til-timoteus': 'paulus-andre-brev-til-timoteus',
  'sauls-moete-med-spaakvinna-i-en-dor': 'saul-og-spaakvinnen-i-en-dor',
  'tabernaklet-bygges': 'tabernaklet-reises',
};
