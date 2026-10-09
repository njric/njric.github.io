/**
 * Résolution des médias.
 *
 * Le moteur ne connaît aucun média : il reçoit un media_id et demande au
 * manifeste ce qu'il y a derrière. En production ce manifeste est la table
 * `medias` servie par l'API ; ici c'est media/index.json.
 *
 * Un id introuvable ne doit jamais faire tomber la page — c'est ce qui arrivait
 * avec la table de fonctions en dur, où MEDIA[id]() levait un TypeError et
 * laissait un écran vide. On rend une ardoise de repli nommée à la place.
 */

/** @returns {Map<number, {name, kind, src, alt}>} */
export async function loadManifest(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `manifeste médias illisible (${response.status} sur ${url})`,
    );
  const raw = await response.json();
  const entries = Object.entries(raw)
    .filter(([id]) => /^\d+$/.test(id))
    .map(([id, entry]) => [Number(id), entry]);
  return new Map(entries);
}

export function resolve(manifest, mediaId) {
  return manifest.get(mediaId) || null;
}

/** Ardoise minérale portant l'id manquant, pour que l'auteur voie ce qui manque. */
function createFallback(mediaId) {
  const el = document.createElement("div");
  el.className = "media-absent";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `Média ${mediaId} introuvable`);
  const label = document.createElement("span");
  label.textContent = `média ${mediaId} introuvable`;
  el.appendChild(label);
  return el;
}

/**
 * Construit l'élément correspondant à un média.
 * La nature de l'asset vient du manifeste, jamais du document : c'est ce qui
 * évite la dérive d'origine, où le document annonçait kind "clip" et le moteur
 * affichait un SVG sans que rien ne le signale.
 *
 * @param {object|null} entry  entrée de manifeste, ou null si non résolue
 * @param {object} sceneMedia  le bloc `media` du document (pour `loop`)
 * @param {number} mediaId
 */
export function createMediaElement(entry, sceneMedia, mediaId) {
  if (!entry) return createFallback(mediaId);

  if (entry.kind === "clip") {
    const video = document.createElement("video");
    video.src = entry.src;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.loop = sceneMedia.loop !== false;
    video.setAttribute("aria-label", entry.alt || "");
    // Un clip illisible (codec, 404) laisserait un rectangle noir muet :
    // on bascule sur l'ardoise nommée, comme pour un id introuvable.
    video.addEventListener(
      "error",
      () => {
        video.replaceWith(createFallback(mediaId));
      },
      { once: true },
    );
    return video;
  }

  const img = document.createElement("img");
  img.src = entry.src;
  img.alt = entry.alt || "";
  img.decoding = "async";
  img.addEventListener(
    "error",
    () => {
      img.replaceWith(createFallback(mediaId));
    },
    { once: true },
  );
  return img;
}

/**
 * Avertissements non bloquants : le document est conforme au schéma, mais il
 * demande quelque chose que les médias ne peuvent pas honorer.
 */
export function auditDocumentMedia(doc, manifest) {
  const warnings = [];
  for (const scene of doc.scenes) {
    const { media_id: mediaId, loop } = scene.media;
    const entry = resolve(manifest, mediaId);
    if (!entry) {
      warnings.push(`${scene.id} : média ${mediaId} absent du manifeste`);
      continue;
    }
    if (loop !== undefined && entry.kind !== "clip") {
      warnings.push(
        `${scene.id} : "loop" n'a pas d'effet sur le média ${mediaId}, qui est de type ${entry.kind}`,
      );
    }
  }
  return warnings;
}
