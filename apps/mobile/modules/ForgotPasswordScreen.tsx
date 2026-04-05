import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ExpoLinking from 'expo-linking';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import { supabase } from '../utils/supabaseClient';

type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

type ForgotPasswordScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

type FieldErrors = {
  email?: string;
};

const PASSWORD_RESET_SCHEME = 'smarthomegroceries';
const PASSWORD_RESET_PATH = 'reset-password';

const createPasswordResetRedirectUrl = () => {
  // Pass the scheme explicitly so Expo Linking does not rely on inferred build-time config.
  const generated = ExpoLinking.createURL(PASSWORD_RESET_PATH, {
    scheme: PASSWORD_RESET_SCHEME,
  });
  return generated || `${PASSWORD_RESET_SCHEME}://${PASSWORD_RESET_PATH}`;
};

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const clearError = (field: keyof FieldErrors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FieldErrors => {
    const validationErrors: FieldErrors = {};
    if (!email.trim()) {
      validationErrors.email = t('validation.emailRequired');
    } else if (!email.trim().match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      validationErrors.email = t('validation.emailValid');
    }
    return validationErrors;
  };

  const handleSendReset = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const redirectTo = createPasswordResetRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      setLoading(false);

      if (error) {
        Alert.alert(t('messages.resetPassTitle'), error.message);
        return;
      }

      Alert.alert(t('messages.checkEmailTitle'), t('messages.checkEmailBody'), [
        {
          text: t('common.backToLogin'),
          onPress: () => navigation.replace('Login'),
        },
      ]);
    } catch {
      setLoading(false);
      Alert.alert(t('messages.resetPassTitle'), t('messages.resetPassSendFailed'));
    }
  };

  const inputStyle = errors.email ? [styles.input, styles.inputError] : styles.input;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('screens.resetPass')}</Text>
      <Text style={styles.helperText}>{t('messages.resetPassEnterEmail')}</Text>

      <TextInput
        style={inputStyle}
        placeholder={t('placeholders.email')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          clearError('email');
        }}
        placeholderTextColor={colors.placeholder}
        textAlign={i18n.language === 'he' ? 'right' : 'left'}
      />
      {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

      <AppButton
        title={loading ? t('buttons.sendingReset') : t('buttons.sendReset')}
        onPress={handleSendReset}
        loading={loading}
        style={styles.fullWidthButton}
      />
      <AppButton
        title={t('common.backToLogin')}
        onPress={() => navigation.replace('Login')}
        style={[styles.fullWidthButton, styles.secondaryButton]}
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
    marginTop: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.textSecondary,
  },
});
