// Server-rendrede sider. Hvert domene bor i sin egen fil under pages/ —
// URL-ene er identiske med react-router-rutene i gamle App.tsx.
// VIKTIG rekkefølge: reading (/:book/:chapter) monteres SIST så den ikke
// sluker statiske stier; 404 håndteres i misc via app.notFound i app.ts.

import { Hono } from 'hono';
import type { AppEnv } from '../lib/session.ts';
import { Layout } from '../views/layout.tsx';
import homeSearch from './pages/home-search.tsx';
import persons from './pages/persons.tsx';
import themes from './pages/themes.tsx';
import overview from './pages/overview.tsx';
import user from './pages/user.tsx';
import contrib from './pages/contrib.tsx';
import misc from './pages/misc.tsx';
import changes from './pages/changes.tsx';
import reading from './pages/reading.tsx';

const pages = new Hono<AppEnv>();

pages.route('/', homeSearch);
pages.route('/', persons);
pages.route('/', themes);
pages.route('/', overview);
pages.route('/', user);
pages.route('/', contrib);
pages.route('/', changes);
pages.route('/', misc);
pages.route('/', reading);

export default pages;
