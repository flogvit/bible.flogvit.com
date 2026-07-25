import { DEFAULT_LOCALE, href } from '../src/lib/i18n.ts';

/**
 * Alle sideruter bor under `/<lang>/` (I18N.md §2). Testene bryr seg sjelden om
 * HVILKET språk, bare om at ruta virker — så de kjører på basespråket via
 * denne. Ett sted å endre om prefikset noen gang gjør det.
 *
 * `/api/*` og statiske filer ligger UTENFOR prefikset og skal ikke gjennom L().
 */
export const L = (path: string) => href(DEFAULT_LOCALE, path);
