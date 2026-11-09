import { useT } from '../i18n';
import { AppText } from './AppText';

// One plain sentence shown wherever Kelmi gives a price, calorie or nutrition number, so no figure reads as exact.
export function EstimateNote({ align }: { align?: 'center' }) {
  const { t } = useT();
  return (
    <AppText variant="footnote" style={align === 'center' ? { textAlign: 'center' } : undefined}>
      {t('Prices, calories, nutrition and cook times are estimates, and Kelmi can make mistakes. Real amounts vary by store, brand and how you cook, so none of it is exact.')}
    </AppText>
  );
}
