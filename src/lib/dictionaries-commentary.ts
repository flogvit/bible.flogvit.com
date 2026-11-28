// Bibelkommentarene (#269, #286): blokka på kapittelsiden, lesevisningen, lenka
// fra versdetaljene og innstillingene. Egen fil som dictionaries-mcp.ts: `en`
// spres inn i den engelske ordboka og blir del av nøkkelsettet, og de sju andre
// typer mot den, så en nøkkel som mangler her er en kompileringsfeil der.
//
// {placeholders} fylles av t(): {range} er en versrekke («1–15», «7:26–8:11»),
// {models} er modellnavnene som de står i kilden, {language} et språknavn.
//
// `cm.work.<id>` er verkets tittel på leserens språk (#286). Et verk uten
// nøkkel viser tittelen fra free-bibles meta.json, så et nytt verk vises uten
// kodeendring — nøkkelen er bare oversettelsen av navnet.

export const COMMENTARY_EN = {
  "rd.commentary": "Commentary",
  "cm.intro": "Introduction",
  "cm.bookIntro": "Introduction to the book",
  "cm.verses": "Verses {range}",
  "cm.showOriginal": "Show the original ({language})",
  "cm.models": "Translated and checked by {models}",
  "cm.sourceOnly": "Not yet translated into your language; shown in the original language.",
  "cm.license": "Licence: {license}",
  "cm.sourceLink": "Source",
  "cm.jump": "Commentary on this verse",
  "cm.work.mhc": "Matthew Henry's Complete Commentary on the Whole Bible",
  "set.commentariesHelp": "Each commentary can be switched off. One that is off is not shown on the chapter pages, in the verse details or in search.",
  "set.type.commentary": "Bible commentaries",
  "nav.commentaries": "Bible commentaries",
  "about.tool.commentaries": "Classic commentaries on each chapter, such as Matthew Henry, in your language with the original a click away",
};

type CommentaryDict = Record<keyof typeof COMMENTARY_EN, string>;

const nb: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Innledning",
  "cm.bookIntro": "Innledning til boka",
  "cm.verses": "Vers {range}",
  "cm.showOriginal": "Vis originalteksten ({language})",
  "cm.models": "Oversatt og kontrollert av {models}",
  "cm.sourceOnly": "Ikke oversatt til ditt språk ennå; vises på originalspråket.",
  "cm.license": "Lisens: {license}",
  "cm.sourceLink": "Kilde",
  "cm.jump": "Kommentar til dette verset",
  "cm.work.mhc": "Matthew Henrys kommentar til hele Bibelen",
  "set.commentariesHelp": "Hver kommentar kan slås av. En som er slått av, vises ikke på kapittelsidene, i versdetaljene eller i søket.",
  "set.type.commentary": "Bibelkommentarer",
  "nav.commentaries": "Bibelkommentarer",
  "about.tool.commentaries": "Klassiske kommentarer til hvert kapittel, som Matthew Henry, på ditt språk og med originalen ett klikk unna",
};

const nn: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Innleiing",
  "cm.bookIntro": "Innleiing til boka",
  "cm.verses": "Vers {range}",
  "cm.showOriginal": "Vis originalteksten ({language})",
  "cm.models": "Omsett og kontrollert av {models}",
  "cm.sourceOnly": "Ikkje omsett til språket ditt enno; vert vist på originalspråket.",
  "cm.license": "Lisens: {license}",
  "cm.sourceLink": "Kjelde",
  "cm.jump": "Kommentar til dette verset",
  "cm.work.mhc": "Matthew Henrys kommentar til heile Bibelen",
  "set.commentariesHelp": "Kvar kommentar kan slåast av. Ein som er slått av, vert ikkje vist på kapittelsidene, i versdetaljane eller i søket.",
  "set.type.commentary": "Bibelkommentarar",
  "nav.commentaries": "Bibelkommentarar",
  "about.tool.commentaries": "Klassiske kommentarar til kvart kapittel, som Matthew Henry, på språket ditt og med originalen eitt klikk unna",
};

const sv: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Inledning",
  "cm.bookIntro": "Inledning till boken",
  "cm.verses": "Vers {range}",
  "cm.showOriginal": "Visa originaltexten ({language})",
  "cm.models": "Översatt och kontrollerad av {models}",
  "cm.sourceOnly": "Ännu inte översatt till ditt språk; visas på originalspråket.",
  "cm.license": "Licens: {license}",
  "cm.sourceLink": "Källa",
  "cm.jump": "Kommentar till denna vers",
  "cm.work.mhc": "Matthew Henrys kommentar till hela Bibeln",
  "set.commentariesHelp": "Varje kommentar kan stängas av. En som är avstängd visas inte på kapitelsidorna, i versdetaljerna eller i sökningen.",
  "set.type.commentary": "Bibelkommentarer",
  "nav.commentaries": "Bibelkommentarer",
  "about.tool.commentaries": "Klassiska kommentarer till varje kapitel, som Matthew Henry, på ditt språk och med originalet ett klick bort",
};

const fr: CommentaryDict = {
  "rd.commentary": "Commentaire",
  "cm.intro": "Introduction",
  "cm.bookIntro": "Introduction au livre",
  "cm.verses": "Versets {range}",
  "cm.showOriginal": "Afficher le texte original ({language})",
  "cm.models": "Traduit et vérifié par {models}",
  "cm.sourceOnly": "Pas encore traduit dans votre langue ; affiché dans la langue d’origine.",
  "cm.license": "Licence : {license}",
  "cm.sourceLink": "Source",
  "cm.jump": "Commentaire sur ce verset",
  "cm.work.mhc": "Commentaire de Matthew Henry sur toute la Bible",
  "set.commentariesHelp": "Chaque commentaire peut être désactivé. Un commentaire désactivé n’apparaît ni sur les pages des chapitres, ni dans les détails des versets, ni dans la recherche.",
  "set.type.commentary": "Commentaires bibliques",
  "nav.commentaries": "Commentaires bibliques",
  "about.tool.commentaries": "Des commentaires classiques de chaque chapitre, comme Matthew Henry, dans votre langue et avec l’original à portée de clic",
};

const es: CommentaryDict = {
  "rd.commentary": "Comentario",
  "cm.intro": "Introducción",
  "cm.bookIntro": "Introducción al libro",
  "cm.verses": "Versículos {range}",
  "cm.showOriginal": "Mostrar el texto original ({language})",
  "cm.models": "Traducido y revisado por {models}",
  "cm.sourceOnly": "Aún no está traducido a tu idioma; se muestra en el idioma original.",
  "cm.license": "Licencia: {license}",
  "cm.sourceLink": "Fuente",
  "cm.jump": "Comentario sobre este versículo",
  "cm.work.mhc": "Comentario de Matthew Henry a toda la Biblia",
  "set.commentariesHelp": "Cada comentario se puede desactivar. Uno desactivado no aparece en las páginas de capítulos, en los detalles de los versículos ni en la búsqueda.",
  "set.type.commentary": "Comentarios bíblicos",
  "nav.commentaries": "Comentarios bíblicos",
  "about.tool.commentaries": "Comentarios clásicos de cada capítulo, como Matthew Henry, en tu idioma y con el original a un clic",
};

const fi: CommentaryDict = {
  "rd.commentary": "Kommentaari",
  "cm.intro": "Johdanto",
  "cm.bookIntro": "Kirjan johdanto",
  "cm.verses": "Jakeet {range}",
  "cm.showOriginal": "Näytä alkuteksti ({language})",
  "cm.models": "Kääntänyt ja tarkistanut {models}",
  "cm.sourceOnly": "Ei vielä käännetty kielellesi; näytetään alkuperäiskielellä.",
  "cm.license": "Lisenssi: {license}",
  "cm.sourceLink": "Lähde",
  "cm.jump": "Kommentaari tähän jakeeseen",
  "cm.work.mhc": "Matthew Henryn selitys koko Raamattuun",
  "set.commentariesHelp": "Jokaisen selityksen voi kytkeä pois. Pois kytkettyä ei näytetä lukujen sivuilla, jakeiden tiedoissa eikä haussa.",
  "set.type.commentary": "Raamatunselitykset",
  "nav.commentaries": "Raamatunselitykset",
  "about.tool.commentaries": "Klassisia selityksiä jokaiseen lukuun, kuten Matthew Henry, omalla kielelläsi ja alkuteksti yhden napsautuksen päässä",
};

const de: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Einleitung",
  "cm.bookIntro": "Einleitung zum Buch",
  "cm.verses": "Verse {range}",
  "cm.showOriginal": "Originaltext anzeigen ({language})",
  "cm.models": "Übersetzt und geprüft von {models}",
  "cm.sourceOnly": "Noch nicht in deine Sprache übersetzt; wird in der Originalsprache angezeigt.",
  "cm.license": "Lizenz: {license}",
  "cm.sourceLink": "Quelle",
  "cm.jump": "Kommentar zu diesem Vers",
  "cm.work.mhc": "Matthew Henrys Kommentar zur ganzen Bibel",
  "set.commentariesHelp": "Jeder Kommentar lässt sich abschalten. Ein abgeschalteter erscheint weder auf den Kapitelseiten noch in den Versdetails oder in der Suche.",
  "set.type.commentary": "Bibelkommentare",
  "nav.commentaries": "Bibelkommentare",
  "about.tool.commentaries": "Klassische Kommentare zu jedem Kapitel, etwa Matthew Henry, in deiner Sprache und mit dem Original einen Klick entfernt",
};

export const COMMENTARY_DICTS = { nb, nn, sv, fr, es, fi, de };
