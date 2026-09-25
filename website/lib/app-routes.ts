export const sections = [
  'dashboard',
  'map',
  'predictions',
  'incidents',
  'equipment',
  'maintenance',
  'schedule',
  'analytics',
] as const;

export type Section = (typeof sections)[number];

export type AppRoute = {
  kind: 'login' | 'admin' | 'section';
  section: Section;
  detail: string | null;
};

export function parseAppPath(pathname: string, basePath = ''): AppRoute {
  const path = basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
    ? pathname.slice(basePath.length)
    : pathname;
  const [first, second] = path.split('/').filter(Boolean);
  if (first === 'login') return { kind: 'login', section: 'dashboard', detail: null };
  if (first === 'admin') return { kind: 'admin', section: 'dashboard', detail: null };
  const section = sections.find((item) => item === first) || 'dashboard';
  const detail = ['predictions', 'equipment', 'map', 'maintenance'].includes(section)
    ? second || null
    : null;
  return { kind: 'section', section, detail };
}

export function sectionPath(section: Section, detail?: string | null) {
  return `/${section}/${detail ? `${encodeURIComponent(detail)}/` : ''}`;
}

// These routes are exported as actual HTML pages for refresh/deep links on static hosting.
// Unknown IDs still reach the client router through the hosting 404 fallback.
export const demoStaticRoutes = [
  'login', 'admin', ...sections,
  ...['PR-2491', 'PR-2490', 'PR-2489', 'PR-2488', 'PR-2487'].map((id) => `predictions/${id}`),
  ...['EQ-1034', 'EQ-2088', 'EQ-1541', 'EQ-3102', 'EQ-912'].map((id) => `equipment/${id}`),
  ...['OBJ-101', 'OBJ-184', 'OBJ-017', 'OBJ-207', 'OBJ-312', 'OBJ-409', 'OBJ-511', 'OBJ-608'].map((id) => `map/${id}`),
];
