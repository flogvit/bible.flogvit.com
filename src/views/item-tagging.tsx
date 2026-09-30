import { tCtx } from '../lib/i18n.ts';
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
}

export function ItemTagging({ itemType, itemId }: ItemTaggingProps) {
  return (
    <div class="item-tagging" data-item-type={itemType} data-item-id={itemId}>
      {/* Tom tilstand uten JS: emner er en lokal (localStorage) funksjon. */}
      <noscript>
        <span class="item-tagging-empty">{tCtx()('tag.needsJs')}</span>
      </noscript>
    </div>
  );
}
