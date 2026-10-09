/**
 * Document -> DOM.
 *
 * Aucune chaîne HTML n'est construite ici : tout passe par createElement et
 * textContent. La version d'origine assemblait de l'innerHTML avec un échappeur
 * qui ne traitait que & et <, et interpolait l'URL des liens sans échappement
 * du tout. Inoffensif tant que le document était écrit à la main ; XSS stocké
 * dès lors qu'il vient d'un back-office, ce qui est précisément le but.
 */

import { createMediaElement, resolve } from "./media.js";

const SCHEMAS_AUTORISES = new Set(["http:", "https:", "mailto:"]);

/** @returns {string|null} l'URL si son schéma est autorisé, sinon null. Exporté pour être testé sans DOM. */
export function urlSure(brut) {
  try {
    const url = new URL(brut, document.baseURI);
    return SCHEMAS_AUTORISES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderBlock(block, warnings) {
  switch (block.type) {
    case "heading": {
      const fragment = document.createDocumentFragment();
      if (block.eyebrow) {
        const eyebrow = document.createElement("div");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = block.eyebrow;
        fragment.appendChild(eyebrow);
      }
      const titre = document.createElement(block.level === 1 ? "h2" : "h3");
      titre.textContent = block.text;
      fragment.appendChild(titre);
      return fragment;
    }

    case "paragraph": {
      const p = document.createElement("p");
      p.textContent = block.text;
      return p;
    }

    case "link": {
      const href = urlSure(block.url);
      if (!href) {
        // Neutralisé : on montre le libellé, jamais le lien.
        warnings.push(
          `lien "${block.text}" : schéma d'URL refusé, rendu en texte simple`,
        );
        const span = document.createElement("span");
        span.className = "lien-refuse";
        span.textContent = block.text;
        return span;
      }
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = block.text;
      return a;
    }

    case "outro": {
      const wrap = document.createElement("div");
      wrap.className = "outro-inner";
      const mark = document.createElement("div");
      mark.className = "mark";
      mark.append(block.mark || "grenouille");
      const point = document.createElement("i");
      point.textContent = ".";
      mark.appendChild(point);
      wrap.appendChild(mark);
      if (block.text) {
        const small = document.createElement("small");
        small.textContent = block.text;
        wrap.appendChild(small);
      }
      return wrap;
    }

    default:
      // Inatteignable si le document a été validé ; filet pour les appels directs.
      warnings.push(`bloc de type "${block.type}" ignoré`);
      return document.createComment(`bloc inconnu : ${block.type}`);
  }
}

/**
 * Construit les scènes dans `screen` et renvoie le modèle que l'engine consomme.
 * Le modèle est un objet à part entière : l'original planquait l'état sur le
 * nœud DOM (`sec._sc = sc`), faute d'avoir un modèle.
 *
 * @returns {{scenes: Array, warnings: string[]}}
 */
export function render(doc, manifest, screen) {
  const warnings = [];
  const scenes = doc.scenes.map((scene) => {
    const section = document.createElement("section");
    section.className = "scene";
    section.dataset.id = scene.id;

    const media = document.createElement("div");
    media.className = "media";

    const frame = document.createElement("div");
    frame.className = "frame";
    frame.appendChild(
      createMediaElement(
        resolve(manifest, scene.media.media_id),
        scene.media,
        scene.media.media_id,
      ),
    );
    media.appendChild(frame);

    for (const nom of ["grain", "scrim"]) {
      const couche = document.createElement("div");
      couche.className = nom;
      media.appendChild(couche);
    }

    const blocks = scene.blocks.map((block) => {
      const node = document.createElement("div");
      node.className = "block";
      node.appendChild(renderBlock(block, warnings));
      media.appendChild(node);
      return { node, anchor: block.anchor, isOutro: block.type === "outro" };
    });

    section.appendChild(media);
    screen.appendChild(section);

    return {
      id: scene.id,
      doc: scene,
      node: section,
      media,
      frame,
      blocks,
      top: 0,
      height: 0,
      span: 0,
      visible: false,
    };
  });

  return { scenes, warnings };
}
