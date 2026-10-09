/**
 * Tri d'un document au regard du schéma.
 *
 * Un document imparfait doit rester consultable : on écarte ce qui est fautif
 * et on rend le reste, plutôt que de renvoyer une page blanche à un auteur qui
 * ne saurait alors pas où il en est. C'est du code pur, sans DOM, pour être
 * testable — et c'est aussi la logique que le backend devra rejouer à l'écriture.
 */

import { validate } from "./validate.js";

const REF_SCENE = { $ref: "#/$defs/scene" };
const REF_BLOC = { $ref: "#/$defs/block" };

/**
 * @returns {{scenes: Array, fatales: string[], rejets: string[]}}
 *   `fatales` empêche tout rendu ; `rejets` liste ce qui a été écarté.
 */
export function trier(doc, schema) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return {
      scenes: [],
      fatales: ["document : un objet JSON est attendu"],
      rejets: [],
    };
  }

  const fatales = [];
  if (doc.type !== "multimedia") {
    fatales.push(
      `document.type : attendu "multimedia", reçu ${JSON.stringify(doc.type)}`,
    );
  }
  if (!Array.isArray(doc.scenes) || doc.scenes.length === 0) {
    fatales.push("document.scenes : au moins une scène est attendue");
  }
  if (fatales.length) return { scenes: [], fatales, rejets: [] };

  const scenes = [];
  const rejets = [];

  doc.scenes.forEach((scene, i) => {
    const chemin = `scenes[${i}]`;
    const erreurs = validate(scene, REF_SCENE, schema, chemin);
    if (erreurs.length === 0) {
      scenes.push(scene);
      return;
    }

    // Sauvetage : on retire les blocs fautifs et on revalide la scène.
    if (Array.isArray(scene.blocks)) {
      const bons = scene.blocks.filter(
        (bloc, j) =>
          validate(bloc, REF_BLOC, schema, `${chemin}.blocks[${j}]`).length ===
          0,
      );
      const reduite = { ...scene, blocks: bons };
      if (
        bons.length > 0 &&
        validate(reduite, REF_SCENE, schema, chemin).length === 0
      ) {
        rejets.push(...erreurs);
        scenes.push(reduite);
        return;
      }
    }

    rejets.push(...erreurs, `${chemin} : scène entièrement ignorée`);
  });

  return { scenes, fatales, rejets };
}
