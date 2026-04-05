import React from 'react';
import { Alert, I18nManager, View, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
];

const normalizeLanguage = (lang: string) => lang.split('-')[0];

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const [selected, setSelected] = React.useState<string>(normalizeLanguage(i18n.language));
  // Dynamically require Picker only on native platforms
  const Picker = (Platform.OS === 'android' || Platform.OS === 'ios')
    ? require('@react-native-picker/picker').Picker
    : undefined;

  const handleChange = (lang: string) => {
    const currentIsRTL = I18nManager.isRTL;
    const nextIsRTL = lang === 'he';
    setSelected(lang);
    i18n.changeLanguage(lang);
    AsyncStorage.setItem('appLanguage', lang);
    if (currentIsRTL !== nextIsRTL) {
      Alert.alert(t('settings.rtlRestartTitle'), t('settings.rtlRestartBody'));
    }
  };

  React.useEffect(() => {
    AsyncStorage.getItem('appLanguage').then((lang) => {
      const resolvedLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
      if (lang) {
        const normalizedStoredLanguage = normalizeLanguage(lang);
        if (normalizedStoredLanguage !== resolvedLanguage) {
          i18n.changeLanguage(normalizedStoredLanguage);
        }
        setSelected(normalizedStoredLanguage);
      } else {
        setSelected(resolvedLanguage);
      }
    });
  }, [i18n]);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <select
          value={selected}
          onChange={(e) => handleChange(e.target.value)}
          style={{ ...styles.picker, padding: 4 }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      ) : Platform.OS === 'android' || Platform.OS === 'ios' ? (
        Picker ? (
          <Picker
            selectedValue={selected}
            onValueChange={handleChange}
            style={styles.nativePicker}
          >
            {LANGUAGES.map((lang) => (
              <Picker.Item key={lang.code} label={lang.label} value={lang.code} />
            ))}
          </Picker>
        ) : null
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    width: 160,
  },
  picker: {
    minWidth: 140,
    fontSize: 16,
  },
  nativePicker: {
    width: 160,
    height: 42,
    color: '#261E58',
  },
});
