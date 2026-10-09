/**
 * Le moteur : il interprète le document, et rien d'autre.
 *
 * Deux écarts assumés avec la version d'origine :
 *
 * 1. Elle tournait dans un requestAnimationFrame inconditionnel qui recalculait
 *    chaque scène à chaque frame, pour toujours, même à l'arrêt. Ici la boucle
 *    est pilotée par l'événement scroll (une frame en vol au plus) et ne touche
 *    au DOM que pour les scènes réellement visibles. Quand rien ne défile, rien
 *    ne tourne.
 *
 * 2. Le calcul d'opacité y était faux et à moitié mort : le `|| 1` final
 *    retransformait en 1 toute valeur nulle, si bien que le fondu n'atteignait
 *    jamais zéro. Il est ici une fonction pure, testable isolément.
 */

export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Fraction de la scène consacrée au fondu d'entrée depuis le noir minéral. */
const FONDU = 0.12;

/**
 * Opacité du média d'une scène, à sa progression donnée.
 * Les scènes collantes ne se recouvrent jamais : le fondu se fait donc depuis
 * le fond de l'écran, ce que le commentaire d'origine appelait déjà
 * « fondu au noir minéral entre scènes ».
 */
export function sceneOpacity(transition, progress) {
  if (transition !== "crossfade") return 1;
  return clamp01(progress / FONDU);
}

/** Ken Burns : translation et zoom linéaires sur la progression, adoucis. */
export function kenburnsTransform(treatment, progress) {
  const t = ease(progress);
  return {
    x: lerp(treatment.from[0], treatment.to[0], t),
    y: lerp(treatment.from[1], treatment.to[1], t),
    zoom: lerp(1.04, treatment.zoom, t),
  };
}

/**
 * Focus : zoom avant puis arrière, en cloche écrêtée — le plateau au sommet
 * laisse le temps de lire le détail visé avant de reculer.
 */
export function focusTransform(treatment, progress) {
  const cloche = Math.min(1, Math.sin(Math.PI * progress) * 1.4);
  return { zoom: lerp(1.03, treatment.zoom, ease(cloche)) };
}

/** Marge de déclenchement d'un bloc, en fraction de scène, avant son ancre. */
const AVANCE_BLOC = 0.04;

export function createEngine({ screen, scenes, bar, onActive, reduced }) {
  let frameEnVol = false;

  /**
   * Mesure et positionne. Les écritures et les lectures sont séparées :
   * l'original lisait sec.offsetTop pendant qu'il écrivait sec.style.height
   * dans la même boucle, forçant un reflow synchrone par scène.
   */
  function layout() {
    const sh = screen.clientHeight;
    document.documentElement.style.setProperty("--sh", `${sh}px`);

    // 1. écritures : hauteurs
    for (const scene of scenes) {
      scene.sh = sh;
      scene.height = Math.round(sh * scene.doc.span);
      scene.span = scene.height - sh;
      scene.node.style.height = `${scene.height}px`;
    }

    // 2. lectures : positions, une fois toutes les hauteurs posées
    const tops = scenes.map((scene) => scene.node.offsetTop);

    // 3. écritures : positions des blocs
    scenes.forEach((scene, i) => {
      scene.top = tops[i];
      for (const block of scene.blocks) {
        const base = block.isOutro ? 0.42 : 0.52;
        block.node.style.top = `${Math.round(block.anchor * scene.span + sh * base)}px`;
      }
    });
  }

  function progressionDe(scene, y) {
    return scene.span > 0 ? clamp01((y - scene.top) / scene.span) : 1;
  }

  function update() {
    const y = screen.scrollTop;
    const total = screen.scrollHeight - screen.clientHeight;
    bar.style.width = `${total > 0 ? (y / total) * 100 : 0}%`;

    let active = scenes[0];
    let indexActif = 0;

    scenes.forEach((scene, i) => {
      const progress = progressionDe(scene, y);

      // Arithmétique pour toutes les scènes ; DOM seulement pour les visibles.
      if (y >= scene.top - scene.sh * 0.5) {
        active = scene;
        indexActif = i;
      }
      if (!scene.visible) return;

      const traitement = scene.doc.media.treatment;
      if (traitement && !reduced) {
        if (traitement.type === "kenburns") {
          const { x, y: ty, zoom } = kenburnsTransform(traitement, progress);
          scene.frame.style.transform = `translate(${x}%, ${ty}%) scale(${zoom})`;
        } else if (traitement.type === "focus") {
          const { zoom } = focusTransform(traitement, progress);
          scene.frame.style.transformOrigin = `${traitement.point[0]}% ${traitement.point[1]}%`;
          scene.frame.style.transform = `scale(${zoom})`;
        }
      }

      scene.media.style.opacity = sceneOpacity(scene.doc.transition, progress);

      const depassee = y > scene.top + scene.height;
      for (const block of scene.blocks) {
        const visible = progress >= block.anchor - AVANCE_BLOC || depassee;
        if (block.revele === visible) continue;
        block.revele = visible;
        block.node.classList.toggle("on", visible);
        // Un bloc invisible reste sinon lisible par un lecteur d'écran et
        // focusable au clavier : le lien de la dernière scène était atteignable
        // par Tab avant même d'être apparu.
        block.node.setAttribute("aria-hidden", String(!visible));
        block.node.inert = !visible;
      }
    });

    onActive(active, indexActif);
  }

  function planifier() {
    if (frameEnVol) return;
    frameEnVol = true;
    requestAnimationFrame(() => {
      frameEnVol = false;
      update();
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const scene = scenes.find((s) => s.node === entry.target);
        if (scene) scene.visible = entry.isIntersecting;
      }
      planifier();
    },
    { root: screen, rootMargin: "60% 0px" },
  );
  for (const scene of scenes) observer.observe(scene.node);

  screen.addEventListener("scroll", planifier, { passive: true });
  window.addEventListener("resize", () => {
    layout();
    planifier();
  });

  layout();
  update();

  return { layout, update, destroy: () => observer.disconnect() };
}
