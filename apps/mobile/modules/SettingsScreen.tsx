import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LanguageSelector from './LanguageSelector';
import { colors, spacing, borderRadius, fontSizes } from '../ui/theme';
import { getUserContext } from '../utils/userContext';

const NOTIF_PREF_KEY = 'settings:notificationsEnabled';
const APP_VERSION = '0.1.0';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [subscriptionTier, setSubscriptionTier] = React.useState<'Free' | 'Premium'>('Free');

  React.useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((val) => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    });
    getUserContext().then((ctx) => setSubscriptionTier(ctx.subscriptionTier));
  }, []);

  const handleNotificationsToggle = (value: boolean) => {
    setNotificationsEnabled(value);
    AsyncStorage.setItem(NOTIF_PREF_KEY, String(value));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.languageTitle')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('language')}</Text>
          <LanguageSelector />
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.notificationsTitle')}</Text>
        <View style={styles.row}>
          <View style={styles.rowLabelBlock}>
            <Text style={styles.rowLabel}>{t('settings.notificationsEnabled')}</Text>
            <Text style={styles.rowHint}>{t('settings.notificationsEnabledHint')}</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={notificationsEnabled ? colors.card : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Premium */}
      {subscriptionTier === 'Free' ? (
        <View style={[styles.section, styles.premiumSection]}>
          <Text style={[styles.sectionTitle, styles.premiumTitle]}>
            {t('settings.premiumTitle')}
          </Text>
          <Text style={styles.premiumBody}>{t('settings.premiumBody')}</Text>
        </View>
      ) : null}

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.appInfoTitle')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.version')}</Text>
          <Text style={styles.rowValue}>{APP_VERSION}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.plan')}</Text>
          <Text style={[styles.rowValue, subscriptionTier === 'Premium' && styles.premiumBadge]}>
            {subscriptionTier}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: borderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: fontSizes.medium,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  rowLabelBlock: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: fontSizes.small,
    color: colors.text,
    fontWeight: '500',
  },
  rowHint: {
    fontSize: 12,
    color: colors.placeholder,
    marginTop: 2,
  },
  rowValue: {
    fontSize: fontSizes.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  premiumSection: {
    borderWidth: 1.5,
    borderColor: '#FFD600',
    backgroundColor: '#FFFBEA',
  },
  premiumTitle: {
    color: '#7A6000',
  },
  premiumBody: {
    fontSize: fontSizes.small,
    color: '#7A6000',
    lineHeight: 20,
  },
  premiumBadge: {
    color: colors.primary,
  },
});
