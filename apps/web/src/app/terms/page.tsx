import type { Metadata } from 'next';
import { LegalPage } from '../../components/LegalPage';

export const metadata: Metadata = { title: 'Terms of Service · Kelmi' };

export default function Page() {
  return <LegalPage doc="terms" />;
}
