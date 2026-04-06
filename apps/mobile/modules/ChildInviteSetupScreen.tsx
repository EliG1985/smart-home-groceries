import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import { claimChildInvite, lookupInviteByToken } from '../utils/collaborationApi';
import { hashChildPin, setChildSession } from '../utils/childSession';
import { clearPendingInviteToken, getPendingInviteToken } from '../utils/inviteLink';
import type { UserContext } from '../utils/userContext';

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

type ChildInviteSetupScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ChildInviteSetup'>;
};

type FieldErrors = {
  displayName?: string;
  birthday?: string;
  phone?: string;
  pin?: string;
  confirmPin?: string;
};

const phonePattern = /^\+?\d{7,15}$/;

const buttonStyle = {
  width: '100%' as const,
  maxWidth: 320,
};

export default function ChildInviteSetupScreen({ navigation }: ChildInviteSetupScreenProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = React.useState('');
  const [birthday, setBirthday] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');
  const [inviteToken, setInviteToken] = React.useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  React.useEffect(() => {
    let mounted = true;

    const loadInvite = async () => {
      const token = await getPendingInviteToken();
      if (!token) {
        Alert.alert(t('childInvite.invalidTitle'), t('childInvite.missingBody'), [
          {
            text: t('common.backToLogin'),
            onPress: () => navigation.replace('Login'),
          },
        ]);
        return;
      }

      try {
        const invite = await lookupInviteByToken(token);
        if (!mounted) {
          return;
        }

        if (invite.joinMode !== 'child') {
          navigation.replace('Login');
          return;
        }

        setInviteToken(token);
      } catch {
        if (mounted) {
          Alert.alert(t('childInvite.invalidTitle'), t('childInvite.invalidBody'), [
            {
              text: t('common.backToLogin'),
              onPress: () => navigation.replace('Login'),
            },
          ]);
        }
      } finally {
        if (mounted) {
          setLoadingInvite(false);
        }
      }
    };

    loadInvite().catch(() => {
      if (mounted) {
        setLoadingInvite(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [navigation, t]);

  const clearError = React.useCallback((field: keyof FieldErrors) => {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return { ...current, [field]: undefined };
    });
  }, []);

  const validate = React.useCallback((): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!displayName.trim()) {
      nextErrors.displayName = t('childInvite.validation.displayNameRequired');
    }

    if (!birthday.trim()) {
      nextErrors.birthday = t('validation.birthdayRequired');
    }

    if (!phonePattern.test(phone.trim())) {
      nextErrors.phone = t('validation.phoneValid');
    }

    if (!/^\d{4}$/.test(pin.trim())) {
      nextErrors.pin = t('childInvite.validation.pinRequired');
    }

    if (confirmPin.trim() !== pin.trim()) {
      nextErrors.confirmPin = t('childInvite.validation.pinMismatch');
    }

    return nextErrors;
  }, [birthday, confirmPin, displayName, phone, pin, t]);

  const handleSubmit = React.useCallback(async () => {
    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.values(validationErrors).some(Boolean) || !inviteToken) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await claimChildInvite(inviteToken, {
        displayName: displayName.trim(),
        birthday: birthday.trim(),
        phone: phone.trim(),
      });

      const context: UserContext = {
        userId: response.childProfile.userId,
        familyId: response.childProfile.familyId,
        fullName: response.childProfile.displayName,
        accountType: 'child',
        role: response.childProfile.role,
        subscriptionTier: 'Free',
        familyMembersCount: 1,
        permissions: response.childProfile.permissions,
      };

      await setChildSession({
        context,
        displayName: response.childProfile.displayName,
        birthday: response.childProfile.birthday,
        phone: response.childProfile.phone,
        pinHash: await hashChildPin(pin.trim()),
        createdAt: new Date().toISOString(),
      });
      await clearPendingInviteToken();
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      Alert.alert(
        t('childInvite.submitFailedTitle'),
        error instanceof Error ? error.message : t('messages.unexpectedError'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [birthday, displayName, inviteToken, navigation, phone, pin, t, validate]);

  if (loadingInvite) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('childInvite.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('childInvite.title')}</Text>
      <Text style={styles.subtitle}>{t('childInvite.subtitle')}</Text>

      <Text style={styles.label}>{t('labels.fullName')}</Text>
      <TextInput
        style={[styles.input, errors.displayName ? styles.inputError : null]}
        value={displayName}
        onChangeText={(value) => {
          setDisplayName(value);
          clearError('displayName');
        }}
        placeholder={t('placeholders.fullName')}
        placeholderTextColor={colors.placeholder}
      />
      {errors.displayName ? <Text style={styles.errorText}>{errors.displayName}</Text> : null}

      <Text style={styles.label}>{t('labels.birthday')}</Text>
      <TextInput
        style={[styles.input, errors.birthday ? styles.inputError : null]}
        value={birthday}
        onChangeText={(value) => {
          setBirthday(value);
          clearError('birthday');
        }}
        placeholder={t('childInvite.birthdayPlaceholder')}
        placeholderTextColor={colors.placeholder}
      />
      {errors.birthday ? <Text style={styles.errorText}>{errors.birthday}</Text> : null}

      <Text style={styles.label}>{t('labels.phoneNumber')}</Text>
      <TextInput
        style={[styles.input, errors.phone ? styles.inputError : null]}
        value={phone}
        onChangeText={(value) => {
          setPhone(value);
          clearError('phone');
        }}
        placeholder={t('placeholders.phone')}
        placeholderTextColor={colors.placeholder}
        keyboardType="phone-pad"
      />
      {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}

      <Text style={styles.label}>{t('childInvite.pinLabel')}</Text>
      <TextInput
        style={[styles.input, errors.pin ? styles.inputError : null]}
        value={pin}
        onChangeText={(value) => {
          setPin(value.replace(/[^0-9]/g, '').slice(0, 4));
          clearError('pin');
        }}
        placeholder={t('childInvite.pinPlaceholder')}
        placeholderTextColor={colors.placeholder}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
      />
      {errors.pin ? <Text style={styles.errorText}>{errors.pin}</Text> : null}

      <Text style={styles.label}>{t('childInvite.confirmPinLabel')}</Text>
      <TextInput
        style={[styles.input, errors.confirmPin ? styles.inputError : null]}
        value={confirmPin}
        onChangeText={(value) => {
          setConfirmPin(value.replace(/[^0-9]/g, '').slice(0, 4));
          clearError('confirmPin');
        }}
        placeholder={t('childInvite.confirmPinPlaceholder')}
        placeholderTextColor={colors.placeholder}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
      />
      {errors.confirmPin ? <Text style={styles.errorText}>{errors.confirmPin}</Text> : null}

      <AppButton
        title={submitting ? t('childInvite.submitting') : t('childInvite.submitButton')}
        onPress={handleSubmit}
        loading={submitting}
        style={buttonStyle}
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
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 320,
    marginBottom: spacing.lg,
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
    lineHeight: 22,
    textAlign: 'center',
  },
  label: {
    width: '100%',
    maxWidth: 320,
    marginBottom: spacing.xs,
    color: colors.text,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: fontSizes.medium,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    width: '100%',
    maxWidth: 320,
    color: colors.error,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
});
