// ItemTagging-skall — port av bibel/src/components/ItemTagging.tsx.
// Selve tagge-UI-et er klientside (localStorage) og bygges av øya
// public/js/tagging.js, som leser data-item-type/data-item-id herfra og
// bruker samme lagringsformat som gamle appen ('bible-topics' i localStorage:
// { topics, verseTopics, itemTopics }).
// TODO(#12): sync-kobling

// Samme typer som gamle lib/offline/userData.ts
export type ItemType =
  | 'verse'
  | 'note'
  | 'prophecy'
  | 'timeline'
  | 'person'
  | 'readingplan'
  | 'theme'
  | 'number-symbolism'
  | 'day';

export interface ItemTaggingProps {
  itemType: ItemType;
  itemId: string;
  /** Kompakt visning (🏷-knapp med nedtrekk) — som i gamle appen */
  compact?: boolean;
  className?: string;
}

export function ItemTagging({ itemType, itemId, compact = false, className }: ItemTaggingProps) {
  const classes = ['item-tagging', compact ? 'compact' : '', className || ''].filter(Boolean).join(' ');
  return (
    <div class={classes} data-item-type={itemType} data-item-id={itemId}>
      {/* Tom tilstand uten JS: emner er en lokal (localStorage) funksjon. */}
      <noscript>
        <span class="item-tagging-empty">Emner krever JavaScript.</span>
      </noscript>
    </div>
  );
}
