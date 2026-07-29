
import { lhref, tCtx } from '../lib/i18n.ts';
// Brødsmulesti — port av React-appens Breadcrumbs (samme markup-kontrakt:
// nav > ol > li med lenker, siste element uten lenke).

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav class="breadcrumbs" aria-label={tCtx()('common.breadcrumbAria')}>
      <ol>
        {items.map((item, i) => (
          <li>
            {item.href && i < items.length - 1 ? (
              <a href={lhref(item.href)}>{item.label}</a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
