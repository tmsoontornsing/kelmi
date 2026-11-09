import type { Metadata } from 'next';
import { LegalPage } from '../../components/LegalPage';

export const metadata: Metadata = { title: 'Consumer Health Data Privacy Policy · Kelmi' };

export default function Page() {
  return <LegalPage doc="consumer-health-data" />;
}
