import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
];

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const [selected, setSelected] = React.useState<string>(i18n.language);
  // Dynamically require Picker only on native platforms
  const Picker = (Platform.OS === 'android' || Platform.OS === 'ios')
    ? require('@react-native-picker/picker').Picker
    : undefined;

  const handleChange = (lang: string) => {
    setSelected(lang);
    i18n.changeLanguage(lang);
    AsyncStorage.setItem('appLanguage', lang);
  };

  React.useEffect(() => {
    AsyncStorage.getItem('appLanguage').then((lang) => {
      if (lang && lang !== i18n.language) {
        i18n.changeLanguage(lang);
        setSelected(lang);
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('language')}:</Text>
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
            style={{ flex: 1 }}
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    marginRight: 8,
    fontSize: 16,
  },
  picker: {
    minWidth: 120,
    fontSize: 16,
  },
});
