# njric.github.io

Prototypes, servis par GitHub Pages sur <https://njric.github.io/>.

Toute poussée sur `main` part en ligne automatiquement, en 30 à 60 secondes.
Il n'y a pas d'étape de build à lancer : le site est statique.

## ⚠️ `grenouille/` est généré — ne pas l'éditer ici

Ce dossier est **écrasé à chaque publication**. Il est produit par la CI d'un
dépôt privé, qui le reconstruit intégralement :

```bash
rm -rf public/grenouille   # puis recopie complète
```

Une modification faite directement ici part bien en ligne, puis **disparaît
sans avertissement** à la publication suivante. Le travail est perdu.

La source est `prototypes/renderer/` dans le dépôt privé `njric/grenouille`.
C'est là qu'on modifie la démonstration ; le merge sur `master` republie.

Chaque publication est estampillée du commit source — `renderer: 7633527`
renvoie au commit `7633527` de `njric/grenouille` — de quoi remonter de
n'importe quel état en ligne au code qui l'a produit.

## Ce qui s'édite à la main

| Chemin | Statut |
|---|---|
| `index.html` | **Manuel.** Redirection vers `/grenouille/`. Jamais touché par la CI. |
| `README.md` | **Manuel.** Ce fichier. |
| `grenouille/**` | **Généré.** Voir ci-dessus. |

Tout ce qui n'est pas sous `grenouille/` est à toi : la CI n'y touche jamais.

## Bon à savoir

Le site est construit par Jekyll (mode *legacy*, branche `main`, racine `/`).
Jekyll **ignore les fichiers et dossiers dont le nom commence par `_`** : un
`_assets/` renverrait des 404 sans la moindre explication. Ajoute un fichier
`.nojekyll` à la racine si tu as besoin de ces noms-là.
