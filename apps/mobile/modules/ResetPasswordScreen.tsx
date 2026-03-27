import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import { supabase } from '../utils/supabaseClient';

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

type ResetPasswordScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

type FieldErrors = {
  password?: string;
  confirmPassword?: string;
};

export default function ResetPasswordScreen({ navigation }: ResetPasswordScreenProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setHasRecoverySession(Boolean(session));
      setCheckingSession(false);
    };

    loadSession().catch(() => {
      if (mounted) {
        setHasRecoverySession(false);
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const clearError = (field: keyof FieldErrors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FieldErrors => {
    const validationErrors: FieldErrors = {};

    if (!password) {
      validationErrors.password = t('validation.newPasswordRequired');
    } else if (password.length < 8) {
      validationErrors.password = t('validation.passwordMin');
    }

    if (!confirmPassword) {
      validationErrors.confirmPassword = t('validation.confirmNewPasswordRequired');
    } else if (confirmPassword !== password) {
      validationErrors.confirmPassword = t('validation.passwordsDoNotMatch');
    }

    return validationErrors;
  };

  const inputStyle = (field: keyof FieldErrors) =>
    errors[field] ? [styles.input, styles.inputError] : styles.input;

  const handleUpdatePassword = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setLoading(false);
        Alert.alert(t('messages.passwordResetFailedTitle'), error.message);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        await AsyncStorage.setItem('supabaseSession', JSON.stringify(session));
      }

      if (user?.email) {
        const hashed = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${user.email}:${password}`,
        );
        await AsyncStorage.setItem('localAuth', JSON.stringify({ email: user.email, hash: hashed }));
      }

      setLoading(false);
      Alert.alert(t('messages.passwordUpdatedTitle'), t('messages.passwordUpdatedBody'), [
        {
          text: t('common.continue'),
          onPress: () => navigation.replace('Main'),
        },
      ]);
    } catch {
      setLoading(false);
      Alert.alert(t('messages.passwordResetFailedTitle'), t('messages.passwordResetFailedBody'));
    }
  };

  if (checkingSession) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('screens.resetPass')}</Text>
        <Text style={styles.helperText}>{t('messages.verifyingRecovery')}</Text>
      </View>
    );
  }

  if (!hasRecoverySession) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('screens.resetPass')}</Text>
        <Text style={styles.helperText}>{t('messages.openRecoveryEmail')}</Text>
        <AppButton
          title={t('common.backToLogin')}
          onPress={() => navigation.replace('Login')}
          style={styles.fullWidthButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('messages.createNewPassword')}</Text>
      <Text style={styles.helperText}>{t('messages.resetPassIntro')}</Text>
      <TextInput
        style={inputStyle('password')}
        placeholder={t('placeholders.newPassword')}
        secureTextEntry
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          clearError('password');
          clearError('confirmPassword');
        }}
        placeholderTextColor={colors.placeholder}
      />
      {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
      <TextInput
        style={inputStyle('confirmPassword')}
        placeholder={t('placeholders.confirmNewPassword')}
        secureTextEntry
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          clearError('confirmPassword');
        }}
        placeholderTextColor={colors.placeholder}
      />
      {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}
      <AppButton
        title={loading ? t('buttons.updatingPassword') : t('buttons.updatePassword')}
        onPress={handleUpdatePassword}
        loading={loading}
        style={styles.fullWidthButton}
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
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  helperText: {
    width: '100%',
    maxWidth: 320,
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius,
    marginBottom: spacing.sm,
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
    fontSize: fontSizes.small,
    marginBottom: spacing.sm,
  },
  fullWidthButton: {
    width: '100%',
    maxWidth: 320,
  },
});
