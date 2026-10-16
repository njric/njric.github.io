/**
 * Amorçage : charge le document, le valide, le rend.
 *
 * Le document est désormais un vrai fichier JSON chargé par fetch, et non plus
 * un littéral JS inscrit dans la page. C'est ce qui rend vérifiable la thèse
 * affichée par le HUD — « le back-office éditera ce document, le moteur restera
 * le même » : on change de document par ?doc=…, sans toucher une ligne de code.
 */

import { assertSupported } from "./validate.js";
import { trier } from "./document.js";
import { loadManifest, auditDocumentMedia } from "./media.js";
import { render } from "./render.js";
import { createEngine } from "./engine.js";

const DOSSIER = "content/";
const CATALOGUE = `${DOSSIER}index.json`;
const SCHEMA = `${DOSSIER}schema.json`;
const MANIFESTE = "media/index.json";

const $ = (id) => document.getElementById(id);

const screen = $("screen");
const bar = $("bar");
const hudScene = $("r-scene");
const hudTotal = $("r-total");
const hudTraitement = $("r-treatment");
const hudMedia = $("r-media");
const hudTheme = $("r-theme");
const hudPoi = $("r-poi");
const diagnostics = $("diagnostics");

/** Les erreurs vont au HUD : le destinataire est un rédacteur, pas un développeur. */
function signaler(messages, gravite) {
  if (!messages.length) return;
  const bloc = document.createElement("div");
  bloc.className = `diag diag-${gravite}`;
  const titre = document.createElement("b");
  titre.textContent =
    gravite === "erreur"
      ? `${messages.length} erreur${messages.length > 1 ? "s" : ""} dans le document`
      : `${messages.length} avertissement${messages.length > 1 ? "s" : ""}`;
  bloc.appendChild(titre);
  const liste = document.createElement("ul");
  for (const message of messages) {
    const li = document.createElement("li");
    li.textContent = message;
    liste.appendChild(li);
  }
  bloc.appendChild(liste);
  diagnostics.appendChild(bloc);
}

/** Rend le JSON en parcourant l'objet. L'original coloriait au regex sur du
 *  JSON.stringify, ce qui cassait dès qu'une valeur contenait " ou :. */
function ecrireJson(valeur, parent, niveau = 0) {
  const pad = "  ".repeat(niveau);
  const padInterne = "  ".repeat(niveau + 1);

  if (Array.isArray(valeur)) {
    if (valeur.length === 0) return void parent.append("[]");
    parent.append("[\n");
    valeur.forEach((v, i) => {
      parent.append(padInterne);
      ecrireJson(v, parent, niveau + 1);
      parent.append(i < valeur.length - 1 ? ",\n" : "\n");
    });
    return void parent.append(`${pad}]`);
  }

  if (valeur && typeof valeur === "object") {
    const cles = Object.keys(valeur);
    if (cles.length === 0) return void parent.append("{}");
    parent.append("{\n");
    cles.forEach((cle, i) => {
      parent.append(padInterne);
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = JSON.stringify(cle);
      parent.appendChild(k);
      parent.append(": ");
      ecrireJson(valeur[cle], parent, niveau + 1);
      parent.append(i < cles.length - 1 ? ",\n" : "\n");
    });
    return void parent.append(`${pad}}`);
  }

  const span = document.createElement("span");
  span.className = typeof valeur === "string" ? "s" : "n";
  span.textContent = JSON.stringify(valeur);
  parent.appendChild(span);
}

function brancherPanneau(doc) {
  const panneau = $("jsonpanel");
  const dump = $("jsondump");
  $("jsonbtn").addEventListener("click", () => {
    dump.replaceChildren();
    ecrireJson(doc, dump);
    panneau.classList.add("open");
    $("jsonclose").focus();
  });
  const fermer = () => panneau.classList.remove("open");
  $("jsonclose").addEventListener("click", fermer);
  panneau.addEventListener("click", (e) => {
    if (e.target === panneau) fermer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panneau.classList.contains("open")) fermer();
  });
}

async function charger(url, quoi) {
  const reponse = await fetch(url);
  if (!reponse.ok)
    throw new Error(`${quoi} illisible (${reponse.status} sur ${url})`);
  return reponse.json();
}

/**
 * Remplit le sélecteur de document du HUD.
 *
 * Un site statique ne sait pas lister un dossier : le catalogue est donc une
 * donnée comme une autre, content/index.json. C'est ce que l'API servira un
 * jour — les POI d'une institution — et la mécanique ne changera pas.
 */
function brancherSelecteur(catalogue, docUrl) {
  const select = $("r-doc");

  for (const { fichier, titre } of catalogue.documents) {
    const option = document.createElement("option");
    option.value = DOSSIER + fichier;
    option.textContent = titre;
    select.appendChild(option);
  }

  // Un brouillon ou le document d'essai ne figurent pas au catalogue : plutôt
  // que de les faire disparaître du sélecteur, on les y ajoute le temps de la
  // visite, pour que le rédacteur voie ce qu'il est en train de regarder.
  if (!catalogue.documents.some((d) => DOSSIER + d.fichier === docUrl)) {
    const option = document.createElement("option");
    option.value = docUrl;
    option.textContent = `hors catalogue · ${docUrl.replace(DOSSIER, "")}`;
    select.appendChild(option);
  }

  select.value = docUrl;
  // Rechargement plutôt que remplacement à chaud : l'URL devient partageable,
  // et le moteur repart d'une page propre sans démontage à orchestrer.
  select.addEventListener("change", () => {
    location.search = `?doc=${select.value}`;
  });
}

async function demarrer() {
  const params = new URLSearchParams(location.search);

  let catalogue;
  let schema;
  let manifeste;
  try {
    [catalogue, schema, manifeste] = await Promise.all([
      charger(CATALOGUE, "catalogue"),
      charger(SCHEMA, "schéma"),
      loadManifest(MANIFESTE),
    ]);
    assertSupported(schema);
  } catch (erreur) {
    signaler([erreur.message], "erreur");
    return;
  }

  const docUrl = params.get("doc") || DOSSIER + catalogue.defaut;
  brancherSelecteur(catalogue, docUrl);

  let doc;
  try {
    doc = await charger(docUrl, "document");
  } catch (erreur) {
    signaler([erreur.message], "erreur");
    return;
  }

  const { scenes: valides, fatales, rejets } = trier(doc, schema);
  signaler(fatales, "erreur");
  signaler(rejets, "erreur");
  if (valides.length === 0) {
    hudTotal.textContent = "00";
    return;
  }

  const docValide = { ...doc, scenes: valides };
  signaler(auditDocumentMedia(docValide, manifeste), "avertissement");

  hudPoi.textContent = doc.poi || "—";
  hudTheme.textContent = doc.theme || "—";
  hudTotal.textContent = String(valides.length).padStart(2, "0");

  const { scenes, warnings } = render(docValide, manifeste, screen);
  signaler(warnings, "avertissement");

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  createEngine({
    screen,
    scenes,
    bar,
    reduced,
    onActive: (scene, index) => {
      const traitement = scene.doc.media.treatment;
      const entree = manifeste.get(scene.doc.media.media_id);
      hudScene.textContent = String(index + 1).padStart(2, "0");
      hudTraitement.textContent = traitement ? traitement.type : "—";
      hudMedia.textContent = entree
        ? entree.kind + (scene.doc.media.loop ? " · loop" : "")
        : "absent";
    },
  });

  brancherPanneau(doc);
}

demarrer();
