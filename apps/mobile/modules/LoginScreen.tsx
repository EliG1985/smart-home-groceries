
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import LanguageSelector from './LanguageSelector';
import AppButton from '../ui/AppButton';
import { colors, spacing, borderRadius, fontSizes } from '../ui/theme';
import { loadDraft, saveDraft } from '../utils/formDraftStorage';
import { getPendingInviteToken } from '../utils/inviteLink';
import { supabase } from '../utils/supabaseClient';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  Main: undefined;
};

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

const buttonStyle = {
  width: '100%' as const,
  maxWidth: 320,
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);

  React.useEffect(() => {
    loadDraft<{ email: string }>('login', { email: '' }).then((draft) => {
      setEmail(draft.email);
    });

    getPendingInviteToken().then((token) => {
      setHasPendingInvite(Boolean(token));
    });
  }, []);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    saveDraft('login', { email: value });
  };

  const handleLogin = async () => {
    setLoading(true);
    let supabaseError: any = null;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        await AsyncStorage.setItem('supabaseSession', JSON.stringify(data.session));
        const hashed = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${email}:${password}`,
        );
        await AsyncStorage.setItem('localAuth', JSON.stringify({ email, hash: hashed }));
        setLoading(false);
        navigation.replace('Main');
        return;
      }
      if (error) {
        supabaseError = error;
      }
    } catch (err) {
      supabaseError = err;
    }

    const isNetworkError =
      supabaseError &&
      ((typeof supabaseError.status === 'number' && supabaseError.status === 0) ||
        (typeof supabaseError.message === 'string' && supabaseError.message.includes('Network')));

    if (isNetworkError) {
      try {
        const localAuth = await AsyncStorage.getItem('localAuth');
        if (localAuth) {
          if (hasPendingInvite) {
            setLoading(false);
            Alert.alert(t('members.pendingInviteOfflineTitle'), t('members.pendingInviteOfflineBody'));
            return;
          }

          const { email: savedEmail, hash } = JSON.parse(localAuth);
          const inputHash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${email}:${password}`,
          );
          if (email === savedEmail && hash === inputHash) {
            setLoading(false);
            Alert.alert(t('messages.offlineModeTitle'), t('messages.offlineModeBody'));
            navigation.replace('Main');
            return;
          }
        }
        setLoading(false);
        Alert.alert(t('messages.loginFailedTitle'), t('messages.networkLoginFailed'));
      } catch {
        setLoading(false);
        Alert.alert(t('messages.loginFailedTitle'), t('messages.networkLoginFailed'));
      }
    } else {
      setLoading(false);
      const errorMsg =
        supabaseError && typeof supabaseError.message === 'string'
          ? supabaseError.message
          : t('messages.unknownError');
      Alert.alert(t('messages.loginFailedTitle'), errorMsg);
    }
  };

  const handlePasswordRecovery = () => {
    navigation.navigate('ForgotPassword');
  };

  return (
    <View style={styles.container}>
      <View style={styles.languageSelectorContainer}>
        <LanguageSelector />
      </View>
      <Text style={styles.title}>{t('screens.login')}</Text>
      {hasPendingInvite ? (
        <View style={styles.inviteHintBox}>
          <Text style={styles.inviteHintText}>{t('members.pendingInviteBody')}</Text>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder={t('placeholders.email')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={handleEmailChange}
        placeholderTextColor={colors.placeholder}
        textAlign={i18n.language === 'he' ? 'right' : 'left'}
      />
      <TextInput
        style={styles.input}
        placeholder={t('placeholders.password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={colors.placeholder}
        textAlign={i18n.language === 'he' ? 'right' : 'left'}
      />
      <AppButton
        title={loading ? t('buttons.loggingIn') : t('buttons.login')}
        onPress={handleLogin}
        loading={loading}
        style={buttonStyle}
      />
      <AppButton
        title={t('buttons.register')}
        onPress={() => navigation.navigate('Register')}
        style={[buttonStyle, { backgroundColor: colors.secondary }]}
      />
      <AppButton
        title={t('buttons.sendReset')}
        onPress={handlePasswordRecovery}
        style={[buttonStyle, styles.recoveryButton]}
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
    marginBottom: spacing.lg,
    color: colors.text,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  input: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: fontSizes.medium,
  },
  languageSelectorContainer: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.md,
    left: 'auto',
    zIndex: 2,
  },
  recoveryButton: {
    backgroundColor: colors.textSecondary,
  },
  inviteHintBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: borderRadius,
    borderWidth: 1,
    borderColor: '#B8E2D2',
    backgroundColor: '#F1FFF8',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  inviteHintText: {
    color: '#1F6A4D',
    fontSize: fontSizes.small,
    lineHeight: 20,
    textAlign: 'center',
  },
});
