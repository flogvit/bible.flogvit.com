// Bibelkommentarene (#269): blokka på kapittelsiden, lenka fra versdetaljene og
// innstillingen. Egen fil som dictionaries-mcp.ts: `en` spres inn i den
// engelske ordboka og blir del av nøkkelsettet, og de sju andre typer mot den,
// så en nøkkel som mangler her er en kompileringsfeil der.
//
// {placeholders} fylles av t(): {range} er en versrekke («1–15», «7:26–8:11»),
// {models} er modellnavnene som de står i kilden, {language} et språknavn.

export const COMMENTARY_EN = {
  "rd.commentary": "Commentary",
  "cm.intro": "Introduction",
  "cm.verses": "Verses {range}",
  "cm.original": "Original",
  "cm.models": "Translated and checked by {models}",
  "cm.sourceOnly": "Not yet translated into your language; shown in the original language.",
  "cm.license": "Licence: {license}",
  "cm.sourceLink": "Source",
  "cm.jump": "Commentary on this verse",
  "set.showCommentary": "Show Bible commentaries",
  "set.type.commentary": "Bible commentaries",
  "nav.commentaries": "Bible commentaries",
  "about.tool.commentaries": "Classic commentaries on each chapter, such as Matthew Henry, with the original beside the translation",
};

type CommentaryDict = Record<keyof typeof COMMENTARY_EN, string>;

const nb: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Innledning",
  "cm.verses": "Vers {range}",
  "cm.original": "Original",
  "cm.models": "Oversatt og kontrollert av {models}",
  "cm.sourceOnly": "Ikke oversatt til ditt språk ennå; vises på originalspråket.",
  "cm.license": "Lisens: {license}",
  "cm.sourceLink": "Kilde",
  "cm.jump": "Kommentar til dette verset",
  "set.showCommentary": "Vis bibelkommentarer",
  "set.type.commentary": "Bibelkommentarer",
  "nav.commentaries": "Bibelkommentarer",
  "about.tool.commentaries": "Klassiske kommentarer til hvert kapittel, som Matthew Henry, med originalen ved siden av oversettelsen",
};

const nn: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Innleiing",
  "cm.verses": "Vers {range}",
  "cm.original": "Original",
  "cm.models": "Omsett og kontrollert av {models}",
  "cm.sourceOnly": "Ikkje omsett til språket ditt enno; vert vist på originalspråket.",
  "cm.license": "Lisens: {license}",
  "cm.sourceLink": "Kjelde",
  "cm.jump": "Kommentar til dette verset",
  "set.showCommentary": "Vis bibelkommentarar",
  "set.type.commentary": "Bibelkommentarar",
  "nav.commentaries": "Bibelkommentarar",
  "about.tool.commentaries": "Klassiske kommentarar til kvart kapittel, som Matthew Henry, med originalen ved sida av omsetjinga",
};

const sv: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Inledning",
  "cm.verses": "Vers {range}",
  "cm.original": "Original",
  "cm.models": "Översatt och kontrollerad av {models}",
  "cm.sourceOnly": "Ännu inte översatt till ditt språk; visas på originalspråket.",
  "cm.license": "Licens: {license}",
  "cm.sourceLink": "Källa",
  "cm.jump": "Kommentar till denna vers",
  "set.showCommentary": "Visa bibelkommentarer",
  "set.type.commentary": "Bibelkommentarer",
  "nav.commentaries": "Bibelkommentarer",
  "about.tool.commentaries": "Klassiska kommentarer till varje kapitel, som Matthew Henry, med originalet bredvid översättningen",
};

const fr: CommentaryDict = {
  "rd.commentary": "Commentaire",
  "cm.intro": "Introduction",
  "cm.verses": "Versets {range}",
  "cm.original": "Original",
  "cm.models": "Traduit et vérifié par {models}",
  "cm.sourceOnly": "Pas encore traduit dans votre langue ; affiché dans la langue d’origine.",
  "cm.license": "Licence : {license}",
  "cm.sourceLink": "Source",
  "cm.jump": "Commentaire sur ce verset",
  "set.showCommentary": "Afficher les commentaires bibliques",
  "set.type.commentary": "Commentaires bibliques",
  "nav.commentaries": "Commentaires bibliques",
  "about.tool.commentaries": "Des commentaires classiques de chaque chapitre, comme Matthew Henry, avec l’original à côté de la traduction",
};

const es: CommentaryDict = {
  "rd.commentary": "Comentario",
  "cm.intro": "Introducción",
  "cm.verses": "Versículos {range}",
  "cm.original": "Original",
  "cm.models": "Traducido y revisado por {models}",
  "cm.sourceOnly": "Aún no está traducido a tu idioma; se muestra en el idioma original.",
  "cm.license": "Licencia: {license}",
  "cm.sourceLink": "Fuente",
  "cm.jump": "Comentario sobre este versículo",
  "set.showCommentary": "Mostrar comentarios bíblicos",
  "set.type.commentary": "Comentarios bíblicos",
  "nav.commentaries": "Comentarios bíblicos",
  "about.tool.commentaries": "Comentarios clásicos de cada capítulo, como Matthew Henry, con el original junto a la traducción",
};

const fi: CommentaryDict = {
  "rd.commentary": "Kommentaari",
  "cm.intro": "Johdanto",
  "cm.verses": "Jakeet {range}",
  "cm.original": "Alkuperäinen",
  "cm.models": "Kääntänyt ja tarkistanut {models}",
  "cm.sourceOnly": "Ei vielä käännetty kielellesi; näytetään alkuperäiskielellä.",
  "cm.license": "Lisenssi: {license}",
  "cm.sourceLink": "Lähde",
  "cm.jump": "Kommentaari tähän jakeeseen",
  "set.showCommentary": "Näytä raamatunselitykset",
  "set.type.commentary": "Raamatunselitykset",
  "nav.commentaries": "Raamatunselitykset",
  "about.tool.commentaries": "Klassisia selityksiä jokaiseen lukuun, kuten Matthew Henry, alkuteksti käännöksen vieressä",
};

const de: CommentaryDict = {
  "rd.commentary": "Kommentar",
  "cm.intro": "Einleitung",
  "cm.verses": "Verse {range}",
  "cm.original": "Original",
  "cm.models": "Übersetzt und geprüft von {models}",
  "cm.sourceOnly": "Noch nicht in deine Sprache übersetzt; wird in der Originalsprache angezeigt.",
  "cm.license": "Lizenz: {license}",
  "cm.sourceLink": "Quelle",
  "cm.jump": "Kommentar zu diesem Vers",
  "set.showCommentary": "Bibelkommentare anzeigen",
  "set.type.commentary": "Bibelkommentare",
  "nav.commentaries": "Bibelkommentare",
  "about.tool.commentaries": "Klassische Kommentare zu jedem Kapitel, etwa Matthew Henry, mit dem Original neben der Übersetzung",
};

export const COMMENTARY_DICTS = { nb, nn, sv, fr, es, fi, de };
