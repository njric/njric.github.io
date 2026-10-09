/**
 * Interpréteur d'un sous-ensemble de JSON Schema draft-07, sans dépendance.
 *
 * Il ne cherche pas à être complet : il couvre exactement les mots-clés employés
 * par content/schema.json, de façon que le schéma reste la seule source de vérité.
 * Ajouter une contrainte au schéma sans l'implémenter ici la rendrait silencieuse —
 * d'où `assertSupported()`, qui refuse tout mot-clé inconnu au chargement.
 *
 * Les messages sont rédigés pour un auteur de contenu, pas pour un développeur.
 */

const TYPES = {
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
};

const SUPPORTED = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "$defs",
  "$ref",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "oneOf",
]);

/** Refuse un schéma employant un mot-clé que cet interpréteur ignorerait en silence. */
export function assertSupported(schema, path = "#") {
  if (!TYPES.object(schema)) return;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) {
      throw new Error(
        `${path} : mot-clé JSON Schema "${key}" non pris en charge par validate.js. ` +
          `Implémentez-le avant de l'employer, sinon la contrainte serait ignorée sans bruit.`,
      );
    }
  }
  for (const k of ["properties", "$defs"]) {
    if (TYPES.object(schema[k])) {
      for (const [name, sub] of Object.entries(schema[k]))
        assertSupported(sub, `${path}/${k}/${name}`);
    }
  }
  if (schema.items) assertSupported(schema.items, `${path}/items`);
  if (Array.isArray(schema.oneOf))
    schema.oneOf.forEach((s, i) => assertSupported(s, `${path}/oneOf/${i}`));
}

function deref(schema, root) {
  let s = schema;
  for (let guard = 0; s && s.$ref && guard < 16; guard += 1) {
    s = s.$ref
      .replace(/^#\/?/, "")
      .split("/")
      .reduce((o, k) => (o ? o[k] : undefined), root);
  }
  return s;
}

function show(value) {
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (TYPES.object(value)) return "un objet";
  return String(value);
}

/**
 * Sur un oneOf, choisit la branche dont properties.type.const correspond au
 * champ `type` de la donnée, pour rapporter des erreurs utiles plutôt que
 * « aucune des 4 variantes ne correspond ».
 */
function pickBranch(branches, data, root) {
  if (!TYPES.object(data) || typeof data.type !== "string") return null;
  return (
    branches
      .map((b) => deref(b, root))
      .find(
        (b) =>
          b &&
          b.properties &&
          b.properties.type &&
          b.properties.type.const === data.type,
      ) || null
  );
}

/**
 * @returns {string[]} liste d'erreurs ; vide si le document est conforme.
 */
export function validate(data, schema, root = schema, path = "document") {
  const s = deref(schema, root);
  if (!s) return [`${path} : référence de schéma non résolue`];

  const errors = [];

  if (s.type && !TYPES[s.type](data)) {
    errors.push(`${path} : attendu ${s.type}, reçu ${show(data)}`);
    return errors; // inutile de poursuivre sur un type erroné
  }

  if ("const" in s && data !== s.const) {
    errors.push(`${path} : attendu ${show(s.const)}, reçu ${show(data)}`);
  }

  if (s.enum && !s.enum.includes(data)) {
    errors.push(
      `${path} : ${show(data)} n'est pas une valeur admise (${s.enum.map(show).join(", ")})`,
    );
  }

  if (typeof data === "number") {
    if ("minimum" in s && data < s.minimum)
      errors.push(`${path} : ${data} est inférieur au minimum ${s.minimum}`);
    if ("maximum" in s && data > s.maximum)
      errors.push(`${path} : ${data} dépasse le maximum ${s.maximum}`);
    if ("exclusiveMinimum" in s && data <= s.exclusiveMinimum) {
      errors.push(
        `${path} : ${data} doit être strictement supérieur à ${s.exclusiveMinimum}`,
      );
    }
  }

  if (Array.isArray(data)) {
    if ("minItems" in s && data.length < s.minItems) {
      errors.push(
        `${path} : ${data.length} élément(s), il en faut au moins ${s.minItems}`,
      );
    }
    if ("maxItems" in s && data.length > s.maxItems) {
      errors.push(
        `${path} : ${data.length} élément(s), il en faut au plus ${s.maxItems}`,
      );
    }
    if (s.items) {
      data.forEach((item, i) =>
        errors.push(...validate(item, s.items, root, `${path}[${i}]`)),
      );
    }
  }

  if (TYPES.object(data)) {
    for (const key of s.required || []) {
      if (!(key in data))
        errors.push(`${path} : champ obligatoire "${key}" manquant`);
    }
    if (s.properties) {
      for (const [key, sub] of Object.entries(s.properties)) {
        if (key in data)
          errors.push(...validate(data[key], sub, root, `${path}.${key}`));
      }
    }
    if (s.additionalProperties === false && s.properties) {
      for (const key of Object.keys(data)) {
        if (!(key in s.properties))
          errors.push(`${path} : champ "${key}" inconnu à cet endroit`);
      }
    }
  }

  if (s.oneOf) {
    const branch = pickBranch(s.oneOf, data, root);
    if (branch) {
      errors.push(...validate(data, branch, root, path));
    } else {
      const noms = s.oneOf
        .map((b) => deref(b, root))
        .map((b) => (b && b.title) || "?");
      const recu = TYPES.object(data) ? show(data.type) : show(data);
      errors.push(
        `${path} : type ${recu} inconnu, attendu l'un de : ${noms.join(", ")}`,
      );
    }
  }

  return errors;
}
