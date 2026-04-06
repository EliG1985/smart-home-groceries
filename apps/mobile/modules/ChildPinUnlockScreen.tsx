import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import { clearChildSession, getChildSession, verifyChildPin } from '../utils/childSession';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  ChildInviteSetup: undefined;
  ChildPinUnlock: undefined;
  Main: undefined;
  InviteReview: undefined;
  BarcodeScanner: undefined;
};

type ChildPinUnlockScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ChildPinUnlock'>;
};

const buttonStyle = {
  width: '100%' as const,
  maxWidth: 320,
};

export default function ChildPinUnlockScreen({ navigation }: ChildPinUnlockScreenProps) {
  const { t } = useTranslation();
  const [pin, setPin] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    getChildSession().then((session) => {
      if (!session) {
        navigation.replace('Login');
        return;
      }

      setDisplayName(session.displayName);
    });
  }, [navigation]);

  const handleUnlock = React.useCallback(async () => {
    if (!/^\d{4}$/.test(pin.trim())) {
      Alert.alert(t('childPin.invalidTitle'), t('childPin.invalidBody'));
      return;
    }

    setSubmitting(true);
    try {
      const valid = await verifyChildPin(pin.trim());
      if (!valid) {
        Alert.alert(t('childPin.invalidTitle'), t('childPin.invalidBody'));
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } finally {
      setSubmitting(false);
    }
  }, [navigation, pin, t]);

  const handleUseAdultAccount = React.useCallback(async () => {
    await clearChildSession();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('childPin.title')}</Text>
      <Text style={styles.subtitle}>{t('childPin.subtitle', { name: displayName || t('screens.login') })}</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(value) => setPin(value.replace(/[^0-9]/g, '').slice(0, 4))}
        placeholder={t('childPin.placeholder')}
        placeholderTextColor={colors.placeholder}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
      />
      <AppButton
        title={submitting ? t('childPin.unlocking') : t('childPin.unlockButton')}
        onPress={handleUnlock}
        loading={submitting}
        style={buttonStyle}
      />
      <AppButton
        title={t('childPin.useAdultAccount')}
        onPress={handleUseAdultAccount}
        style={[buttonStyle, styles.secondaryButton]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSizes.xlarge,
    marginBottom: spacing.sm,
    color: colors.text,
    fontWeight: 'bold',
  },
  subtitle: {
    maxWidth: 320,
    marginBottom: spacing.lg,
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
    lineHeight: 22,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: fontSizes.medium,
    textAlign: 'center',
    letterSpacing: 8,
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
  },
});
