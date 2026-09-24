import MoscollectorApp from '../moscollector-app';
import { demoStaticRoutes } from '@/lib/app-routes';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return demoStaticRoutes.map((path) => ({ route: path.split('/') }));
}

export default function AppDeepLink() {
  return <MoscollectorApp />;
}
