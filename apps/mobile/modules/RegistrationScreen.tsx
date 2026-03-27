import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, ScrollView } from 'react-native';

let DateTimePicker: any = null;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch {
    DateTimePicker = null;
  }
}
import { supabase } from '../utils/supabaseClient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { clearDraft, loadDraft, saveDraft } from '../utils/formDraftStorage';

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

type RegistrationScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Login'
>;

interface RegistrationScreenProps {
  navigation: RegistrationScreenNavigationProp;
}

type FieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  birthday?: string;
  phone?: string;
};

export default function RegistrationScreen({ navigation }: RegistrationScreenProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  React.useEffect(() => {
    loadDraft<{ fullName: string; phone: string; city: string; email: string; birthday: string | null }>('register', {
      fullName: '',
      phone: '',
      city: '',
      email: '',
      birthday: null,
    }).then((draft) => {
      setFullName(draft.fullName);
      setPhone(draft.phone);
      setCity(draft.city);
      setEmail(draft.email);
      setBirthday(draft.birthday ? new Date(draft.birthday) : null);
    });
  }, []);

  const persistDraft = (nextDraft: {
    fullName?: string;
    phone?: string;
    city?: string;
    email?: string;
    birthday?: Date | null;
  }) => {
    saveDraft('register', {
      fullName: nextDraft.fullName ?? fullName,
      phone: nextDraft.phone ?? phone,
      city: nextDraft.city ?? city,
      email: nextDraft.email ?? email,
      birthday: (nextDraft.birthday === undefined ? birthday : nextDraft.birthday)?.toISOString() ?? null,
    });
  };

  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev: FieldErrors) => ({ ...prev, [field]: undefined }));

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!fullName.trim()) e.fullName = t('validation.fullNameRequired');
    if (!email.trim()) e.email = t('validation.emailRequired');
    else if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) e.email = t('validation.emailValid');
    if (!password) e.password = t('validation.passwordRequired');
    else if (password.length < 8) e.password = t('validation.passwordMin');
    if (!confirmPassword) e.confirmPassword = t('validation.confirmPasswordRequired');
    else if (password !== confirmPassword) e.confirmPassword = t('validation.passwordsDoNotMatch');
    if (!birthday) e.birthday = t('validation.birthdayRequired');
    if (phone && !phone.match(/^\+?\d{7,15}$/)) e.phone = t('validation.phoneValid');
    return e;
  };

  const handleRegister = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            ...(phone ? { phone } : {}),
            ...(city ? { city } : {}),
            birthday: birthday!.toISOString().split('T')[0],
          },
        },
      });
      setLoading(false);
      if (error) {
        Alert.alert(t('messages.registrationFailedTitle'), error.message);
        return;
      }
      await clearDraft('register');
      Alert.alert(t('messages.successTitle'), t('messages.registrationSuccess'));
      navigation.replace('Login');
    } catch {
      setLoading(false);
      Alert.alert(t('messages.registrationFailedTitle'), t('messages.unexpectedError'));
    }
  };

  const inputStyle = (field: keyof FieldErrors) =>
    errors[field] ? [styles.input, styles.inputError] : styles.input;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('screens.register')}</Text>
      <Text style={styles.legend}>
        <Text style={styles.required}>*</Text> {t('common.requiredFields')}
      </Text>

      {/* Full Name */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.fullName')} <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('fullName')}
          placeholder={t('placeholders.fullName')}
          value={fullName}
          onChangeText={(value: string) => { setFullName(value); clearError('fullName'); persistDraft({ fullName: value }); }}
        />
        {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}
      </View>

      {/* Email */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.email')} <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('email')}
          placeholder={t('placeholders.email')}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(value: string) => { setEmail(value); clearError('email'); persistDraft({ email: value }); }}
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
      </View>

      {/* Password */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.password')} <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('password')}
          placeholder={t('placeholders.passwordMin')}
          secureTextEntry
          value={password}
          onChangeText={(value: string) => { setPassword(value); clearError('password'); clearError('confirmPassword'); }}
        />
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
      </View>

      {/* Confirm Password */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.confirmPassword')} <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('confirmPassword')}
          placeholder={t('placeholders.confirmPassword')}
          secureTextEntry
          value={confirmPassword}
          onChangeText={(value: string) => { setConfirmPassword(value); clearError('confirmPassword'); }}
        />
        {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}
      </View>

      {/* Birthday */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.birthday')} <Text style={styles.required}>*</Text></Text>
        {Platform.OS === 'web' ? (
          <input
            type="date"
            style={{
              width: '100%',
              height: 40,
              borderRadius: 4,
              border: errors.birthday ? '1.5px solid #e53e3e' : '1px solid #ccc',
              padding: '0 8px',
              fontSize: 16,
              boxSizing: 'border-box',
            } as React.CSSProperties}
            value={birthday ? birthday.toISOString().split('T')[0] : ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const val = event.target.value;
              setBirthday(val ? new Date(val) : null);
              clearError('birthday');
              persistDraft({ birthday: val ? new Date(val) : null });
            }}
            max={new Date().toISOString().split('T')[0]}
          />
        ) : (
          <View style={[styles.dateButton, errors.birthday ? styles.dateButtonError : null]}>
            <Button
              title={birthday ? birthday.toLocaleDateString() : t('placeholders.birthday')}
              onPress={() => setShowDatePicker(true)}
            />
            {showDatePicker && DateTimePicker && (
              <DateTimePicker
                value={birthday || new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_event: any, date?: Date) => {
                  setShowDatePicker(false);
                  if (date) { setBirthday(date); clearError('birthday'); persistDraft({ birthday: date }); }
                }}
                maximumDate={new Date()}
              />
            )}
          </View>
        )}
        {errors.birthday ? <Text style={styles.errorText}>{errors.birthday}</Text> : null}
      </View>

      {/* Phone (optional) */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.phoneNumber')} <Text style={styles.optional}>({t('common.optional')})</Text></Text>
        <TextInput
          style={inputStyle('phone')}
          placeholder={t('placeholders.phone')}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(value: string) => { setPhone(value); clearError('phone'); persistDraft({ phone: value }); }}
        />
        {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
      </View>

      {/* City (optional) */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>{t('labels.city')} <Text style={styles.optional}>({t('common.optional')})</Text></Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholders.city')}
          value={city}
          onChangeText={(value: string) => { setCity(value); persistDraft({ city: value }); }}
        />
      </View>

      <Button title={loading ? t('buttons.registering') : t('buttons.register')} onPress={handleRegister} disabled={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  legend: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    color: '#555',
    fontSize: 13,
  },
  fieldWrapper: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  required: {
    color: '#e53e3e',
  },
  optional: {
    color: '#999',
    fontWeight: '400',
    fontSize: 13,
  },
  input: {
    width: '100%',
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
  },
  inputError: {
    borderColor: '#e53e3e',
    borderWidth: 1.5,
  },
  errorText: {
    color: '#e53e3e',
    fontSize: 12,
    marginTop: 4,
  },
  dateButton: {
    width: '100%',
  },
  dateButtonError: {
    borderColor: '#e53e3e',
    borderWidth: 1.5,
    borderRadius: 4,
    padding: 2,
  },
});
