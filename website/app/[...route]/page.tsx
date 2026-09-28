import MoscollectorApp from '../moscollector-app';
import { staticRoutes } from '@/lib/app-routes';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return staticRoutes.map((path) => ({ route: path.split('/') }));
}

export default function AppDeepLink() {
  return <MoscollectorApp />;
}
