// src/services/companion/chat/bubbleTags.ts
// Des icônes du jeu dans la bulle du companion.
//
// Le jeu accepte un champ `tags` à côté de `message` dans `npcChatBubblesAtom`,
// et seulement pour les PNJ : le chemin des bulles de joueurs ne le transmet
// pas. Le companion en étant un, il y a droit.
//
// Le balisage est `<0/>` pour une icône en ligne, `<0>texte</0>` pour styler un
// fragment, et `tags` est un objet indexé par ce numéro. C'est ce que le jeu
// utilise lui-même : « With all this Rain, your crops are gonna get soaking
// <0/>! » avec `{ 0: { mutation: "Wet", backgroundColor } }`.
//
// Module PUR : il fabrique la ligne, il ne parle pas. Les lectures de
// catalogue vivent dans `bubbleIcons.ts`, qui lui n'est pas importable hors
// navigateur — c'est ce qui garde le composeur verifiable.

/**
 * Une pastille de mutation, telle que le jeu la dessine dans ses propres
 * répliques météo. `icon: false` donne le nom sans la pastille.
 */
export type MutationTag = {
  mutation: string;
  backgroundColor?: number;
  icon?: boolean;
  iconSizePx?: number;
};

/**
 * N'importe quel sprite du jeu, désigné par sa clé d'atlas.
 *
 * Le rendu fait `Sprite.from(sprite)`, donc tout ce que les atlas chargés
 * connaissent passe. Un `name` vide donne l'icône seule, sans libellé.
 */
export type GameThingTag = {
  gameThing: { name: string; sprite: string };
  iconSizePx?: number;
  /**
   * Le fil sait dessiner cette clé, le jeu non.
   *
   * Deux vocabulaires portent le même sens : `tileRef` désigne un sprite dans
   * les atlas que le mod charge lui-même, `sprite` désigne une entrée du cache
   * de textures du jeu. Envoyer le premier au jeu donne un carré vide, parce
   * que `Sprite.from` ne trouve rien.
   *
   * Ces tags-là sont donc retirés du message envoyé au jeu. Le balisage reste :
   * le jeu saute une balise dont le tag manque, sans laisser de trou.
   */
  modOnly?: boolean;
};

/**
 * Un animal précis, tel que le jeu le dessine partout ailleurs.
 *
 * `pet` est l'objet d'inventaire, pas un nom : c'est le seul tag qui passe par
 * le moteur de rendu d'animal, donc le seul qui compose réellement ses
 * mutations. Un nom vide donne l'icône seule.
 */
export type PetThingTag = {
  petThing: { name: string; pet: unknown };
  iconSizePx?: number;
};

export type BubbleTag = MutationTag | GameThingTag | PetThingTag;

export type BubbleLine = { message: string; tags?: Record<number, BubbleTag> };

/** Un morceau de phrase : du texte, une icône, ou rien. */
export type Fragment = string | BubbleTag | null | undefined;

/**
 * Assemble une phrase et ses icônes, en numérotant les balises.
 *
 * Les fragments nuls disparaissent sans laisser de trou : c'est ce qui permet
 * aux fabricants ci-dessous de rendre `null` quand le catalogue ne connaît pas
 * l'objet. Une clé d'atlas inconnue ne lèverait pas d'erreur, elle dessinerait
 * un carré vide — pire qu'une phrase sans image.
 */
export function compose(...fragments: Fragment[]): BubbleLine {
  const tags: Record<number, BubbleTag> = {};
  let message = "";
  let next = 0;

  for (const fragment of fragments) {
    if (fragment === null || fragment === undefined) continue;
    if (typeof fragment === "string") {
      message += fragment;
      continue;
    }
    tags[next] = fragment;
    message += `<${next}/>`;
    next += 1;
  }

  // Un objet vide est « truthy » : le laisser passer basculerait le jeu sur son
  // rendu balisé pour une phrase qui n'a aucune balise.
  const tidy = tidySpacing(message);
  return next === 0 ? { message: tidy } : { message: tidy, tags };
}

/**
 * Rattrape les blancs laissés par un fragment absent.
 *
 * Les phrases sont écrites en supposant l'icône présente ; quand le catalogue
 * ne la connaît pas, elle disparaît et laisse « 12  ready » ou « 12 . Pick ».
 * Nettoyer ici plutôt qu'à chaque appel évite que le prochain point d'appel
 * réintroduise le même défaut.
 *
 * On ne touche jamais aux balises : `<0/>` n'a ni espace ni ponctuation.
 */
function tidySpacing(message: string): string {
  return message
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/**
 * Sépare des icônes par une espace, pour les poser à la suite dans une phrase.
 *
 * `compose` ne devine pas où couper : sans ça, deux tags collés donnent
 * `<0/><1/>`, et le jeu dessine deux sprites l'un contre l'autre.
 */
export function spaced(tags: BubbleTag[]): Fragment[] {
  return tags.flatMap((tag, index) => (index === 0 ? [tag] : [" ", tag]));
}

/**
 * La pastille d'une mutation.
 *
 * `backgroundColor` est la couleur de bulle du PNJ dans les répliques du jeu,
 * pour que la pastille s'accorde au fond. On la laisse optionnelle : sans elle
 * le jeu retombe sur sa valeur par défaut.
 */
export function mutationChip(mutation: string, backgroundColor?: number): MutationTag {
  return { mutation, ...(backgroundColor === undefined ? {} : { backgroundColor }) };
}

/**
 * La version d'une ligne que le jeu saura dessiner.
 *
 * Les tags qu'il ne peut pas résoudre partent, **et leur balise avec**. Retirer
 * le seul tag ne suffisait pas : le jeu saute bien la balise orpheline, mais le
 * texte se refermait mal et donnait « 2 . Pick them? ». On recolle donc la
 * phrase et on rend les espaces.
 *
 * Les numéros des tags restants ne bougent pas : ce sont eux que les balises
 * survivantes désignent.
 */
export function forGame(line: BubbleLine): BubbleLine {
  if (!line.tags) return line;

  const kept: Record<number, BubbleTag> = {};
  const dropped = new Set<number>();
  for (const [index, tag] of Object.entries(line.tags)) {
    if ("gameThing" in tag && tag.modOnly === true) dropped.add(Number(index));
    else kept[Number(index)] = tag;
  }
  if (dropped.size === 0) return line;

  const message = tidySpacing(
    line.message.replace(/<(\d+)\/>/g, (marker, index) => (dropped.has(Number(index)) ? "" : marker))
  );
  return Object.keys(kept).length > 0 ? { message, tags: kept } : { message };
}
