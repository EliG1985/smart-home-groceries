
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import AppButton from '../ui/AppButton';
import { colors, spacing, borderRadius, fontSizes } from '../ui/theme';
import { supabase } from '../utils/supabaseClient';
import LanguageSelector from './LanguageSelector';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: undefined;
};

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    let supabaseError: any = null;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        // Success: store session and hashed credentials locally
        await AsyncStorage.setItem('supabaseSession', JSON.stringify(data.session));
        const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email + ':' + password);
        await AsyncStorage.setItem('localAuth', JSON.stringify({ email, hash: hashed }));
        setLoading(false);
        navigation.replace('Main');
        return;
      } else if (error) {
        supabaseError = error;
      }
    } catch (err) {
      supabaseError = err;
    }

    // If Supabase failed due to network, try local fallback
    const isNetworkError =
      supabaseError &&
      ((typeof supabaseError.status === 'number' && supabaseError.status === 0) ||
        (typeof supabaseError.message === 'string' && supabaseError.message.includes('Network')));

    if (isNetworkError) {
      try {
        const localAuth = await AsyncStorage.getItem('localAuth');
        if (localAuth) {
          const { email: savedEmail, hash } = JSON.parse(localAuth);
          const inputHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email + ':' + password);
          if (email === savedEmail && hash === inputHash) {
            setLoading(false);
            Alert.alert('Offline mode', 'Logged in with local credentials. Some features may be unavailable.');
            navigation.replace('Main');
            return;
          }
        }
        setLoading(false);
        Alert.alert('Login failed', 'Unable to login. Please check your connection.');
      } catch (err) {
        setLoading(false);
        Alert.alert('Login failed', 'Unable to login. Please check your connection.');
      }
    } else {
      setLoading(false);
      const errorMsg = (supabaseError && typeof supabaseError.message === 'string') ? supabaseError.message : 'Unknown error';
      Alert.alert('Login failed', errorMsg);
    }
  };

  return (
    <View style={styles.container}>
      <LanguageSelector />
      <Text style={styles.title}>Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholderTextColor={colors.placeholder}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={colors.placeholder}
      />
      <AppButton title={loading ? 'Logging in...' : 'Login'} onPress={handleLogin} loading={loading} />
      <AppButton title="Register" onPress={() => navigation.navigate('Register')} style={{ backgroundColor: colors.secondary }} />
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
});
