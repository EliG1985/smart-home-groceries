
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform } from 'react-native';

let DateTimePicker: any = null;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    // Dynamically require only on native platforms
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (e) {
    DateTimePicker = null;
  }
}
import AppButton from '../ui/AppButton';
import { colors, spacing, borderRadius, fontSizes } from '../ui/theme';
import { supabase } from '../utils/supabaseClient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

interface RegistrationScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

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

  const handleRegister = async () => {
    if (!fullName.trim()) {
      Alert.alert('Missing name', 'Please enter your full name.');
      return;
    }
    if (!phone.match(/^\+?\d{7,15}$/)) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Missing city', 'Please enter your city.');
      return;
    }
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }
    if (!birthday) {
      Alert.alert('Missing birthday', 'Please select your birthday.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          city,
          birthday: birthday.toISOString().split('T')[0],
        },
      },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Registration failed', error.message);
      return;
    }
    Alert.alert('Success', 'Registration successful! Please log in.');
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>
      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={fullName}
        onChangeText={setFullName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="City"
        value={city}
        onChangeText={setCity}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <View style={{ width: '100%', maxWidth: 320, marginBottom: 16 }}>
        <Text style={{ marginBottom: 4 }}>Birthday</Text>
        {Platform.OS === 'web' ? (
          <input
            type="date"
            style={{
              width: '100%',
              height: 40,
              borderRadius: 8,
              border: '1px solid #ccc',
              padding: 8,
              fontSize: 16,
            }}
            value={birthday ? birthday.toISOString().split('T')[0] : ''}
            onChange={e => {
              const val = e.target.value;
              setBirthday(val ? new Date(val) : null);
            }}
            max={new Date().toISOString().split('T')[0]}
          />
        ) : (
          <>
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
                  if (date) setBirthday(date);
                }}
                maximumDate={new Date()}
              />
            )}
          </>
        )}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <Button title={loading ? 'Registering...' : 'Register'} onPress={handleRegister} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    maxWidth: 320,
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
});
