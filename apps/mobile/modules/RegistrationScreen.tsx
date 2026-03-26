import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
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

  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev: FieldErrors) => ({ ...prev, [field]: undefined }));

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!fullName.trim()) e.fullName = 'Full name is required.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) e.email = 'A valid email address is required.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password.';
    else if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    if (!birthday) e.birthday = 'Birthday is required.';
    if (phone && !phone.match(/^\+?\d{7,15}$/)) e.phone = 'Enter a valid phone number (7–15 digits).';
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
        Alert.alert('Registration failed', error.message);
        return;
      }
      Alert.alert('Success', 'Registration successful! Please check your email to verify your account.');
      navigation.replace('Login');
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  const inputStyle = (field: keyof FieldErrors) =>
    errors[field] ? [styles.input, styles.inputError] : styles.input;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Register</Text>
      <Text style={styles.legend}>
        <Text style={styles.required}>*</Text> Required fields
      </Text>

      {/* Full Name */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('fullName')}
          placeholder="Full Name"
          value={fullName}
          onChangeText={(value: string) => { setFullName(value); clearError('fullName'); }}
        />
        {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}
      </View>

      {/* Email */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('email')}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(value: string) => { setEmail(value); clearError('email'); }}
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
      </View>

      {/* Password */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>Password <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('password')}
          placeholder="Password (min. 8 characters)"
          secureTextEntry
          value={password}
          onChangeText={(value: string) => { setPassword(value); clearError('password'); clearError('confirmPassword'); }}
        />
        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
      </View>

      {/* Confirm Password */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>Confirm Password <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={inputStyle('confirmPassword')}
          placeholder="Confirm Password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(value: string) => { setConfirmPassword(value); clearError('confirmPassword'); }}
        />
        {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}
      </View>

      {/* Birthday */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>Birthday <Text style={styles.required}>*</Text></Text>
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
            }}
            max={new Date().toISOString().split('T')[0]}
          />
        ) : (
          <View style={[styles.dateButton, errors.birthday ? styles.dateButtonError : null]}>
            <Button
              title={birthday ? birthday.toLocaleDateString() : 'Select Birthday'}
              onPress={() => setShowDatePicker(true)}
            />
            {showDatePicker && DateTimePicker && (
              <DateTimePicker
                value={birthday || new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_event: any, date?: Date) => {
                  setShowDatePicker(false);
                  if (date) { setBirthday(date); clearError('birthday'); }
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
        <Text style={styles.label}>Phone Number <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={inputStyle('phone')}
          placeholder="e.g. +1234567890"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(value: string) => { setPhone(value); clearError('phone'); }}
        />
        {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
      </View>

      {/* City (optional) */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>City <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="Your city"
          value={city}
          onChangeText={setCity}
        />
      </View>

      <Button title={loading ? 'Registering...' : 'Register'} onPress={handleRegister} disabled={loading} />
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
