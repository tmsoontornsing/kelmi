import type { Metadata } from 'next';
import { LegalShell } from '../../components/LegalPage';
import { CONTACT_EMAIL } from '../../links';

export const metadata: Metadata = { title: 'Delete your account · Kelmi' };

export default function Page() {
  // While CONTACT_EMAIL is empty, show the bracket placeholder as plain text so it cannot be missed before launch.
  const email = CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <>[CONTACT EMAIL]</>;
  return (
    <LegalShell title="Delete your Kelmi account" summary="You can delete your account and its data yourself, inside the app.">
      <h2>In the app</h2>
      <ol>
        <li>Open Kelmi and go to Settings.</li>
        <li>Tap Delete account and confirm.</li>
      </ol>
      <p>
        Deleting your account is permanent. It removes your account, household profile (including your diet, allergies and food notes), pantry,
        meal plans, grocery lists and ratings from our active systems. We cannot bring them back. Copies in backups are removed on our
        database provider’s backup cycle, which we expect to be up to about 30 days.
      </p>
      <h2>Subscriptions</h2>
      <p>
        If you bought Kelmi Plus through the App Store or Google Play, deleting your account or the app does not cancel it. Cancel it in
        your App Store or Google Play subscription settings. When you delete your account we also ask RevenueCat, our subscription
        provider, to delete its record of you.
      </p>
      <h2>Can’t get into the app?</h2>
      <p>
        Email {email} from the address on your account and ask us to delete it. We may ask you to confirm it is you. We will reply within
        45 days.
      </p>
      <p>
        Waitlist only? Email the same address and we will remove your email from the list. You can read more in the <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalShell>
  );
}
