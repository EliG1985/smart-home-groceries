import * as React from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppButton from '../ui/AppButton';
import { colors, spacing, borderRadius, fontSizes } from '../ui/theme';
import { supabase } from '../utils/supabaseClient';
import { getUserContext } from '../utils/userContext';
import type { ShoppingPermissions, UserRole } from '../utils/userContext';
import { getChildSession } from '../utils/childSession';

let DateTimePicker: any = null;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch {
    DateTimePicker = null;
  }
}

type FieldErrors = {
  fullName?: string;
  phone?: string;
};

export default function AccountProfileScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [birthday, setBirthday] = React.useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [fetching, setFetching] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saved, setSaved] = React.useState(false);
  const [role, setRole] = React.useState<UserRole>('viewer');
  const [isChildAccount, setIsChildAccount] = React.useState(false);
  const [permissions, setPermissions] = React.useState<ShoppingPermissions>({
    create: false,
    edit: false,
    delete: false,
    markDone: true,
    viewProgress: true,
  });

  React.useEffect(() => {
    Promise.all([supabase.auth.getUser(), getUserContext(), getChildSession()]).then(([{ data, error }, context, childSession]) => {
      if (!error && data?.user) {
        const meta = data.user.user_metadata ?? {};
        setEmail(data.user.email ?? '');
        setFullName(String(meta.full_name ?? ''));
        setPhone(String(meta.phone ?? ''));
        setCity(String(meta.city ?? ''));
        if (meta.birthday) {
          setBirthday(new Date(meta.birthday));
        }
      } else if (context.accountType === 'child' && childSession) {
        setEmail('');
        setFullName(childSession.displayName);
        setPhone(childSession.phone);
        setCity('');
        setBirthday(childSession.birthday ? new Date(childSession.birthday) : null);
      }
      setIsChildAccount(context.accountType === 'child');
      setRole(context.role);
      setPermissions(context.permissions);
      setFetching(false);
    });
  }, []);

  const roleLabel =
    role === 'admin'
      ? t('members.roleAdmin')
      : role === 'editor'
      ? t('members.roleEditor')
      : t('members.roleViewer');

  const permissionLabels = [
    permissions.create ? t('members.permCreate') : null,
    permissions.edit ? t('members.permEdit') : null,
    permissions.delete ? t('members.permDelete') : null,
    permissions.markDone ? t('members.permMarkDone') : null,
    permissions.viewProgress ? t('members.permViewProgress') : null,
  ].filter((label): label is string => Boolean(label));

  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!fullName.trim()) e.fullName = t('validation.fullNameRequired');
    if (phone && !phone.match(/^\+?\d{7,15}$/)) e.phone = t('validation.phoneValid');
    return e;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaved(false);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone: phone || null,
          city: city || null,
          birthday: birthday ? birthday.toISOString().split('T')[0] : null,
        },
      });
      setLoading(false);
      if (error) {
        Alert.alert(t('profile.saveFailedTitle'), error.message);
        return;
      }
      setSaved(true);
    } catch {
      setLoading(false);
      Alert.alert(t('profile.saveFailedTitle'), t('messages.unexpectedError'));
    }
  };

  const inputStyle = (field: keyof FieldErrors) =>
    errors[field] ? [styles.input, styles.inputError] : [styles.input];

  if (fetching) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.legend}>
        <Text style={styles.required}>*</Text> {t('common.requiredFields')}
      </Text>

      {isChildAccount ? (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerTitle}>{t('childAccount.profileTitle')}</Text>
          <Text style={styles.infoBannerBody}>{t('childAccount.profileBody')}</Text>
        </View>
      ) : (
        <View style={styles.fieldWrapper}>
          <Text style={styles.label}>{t('labels.email')}</Text>
          <TextInput
            style={[styles.input, styles.readOnly]}
            value={email}
            editable={false}
            placeholderTextColor={colors.placeholder}
          />
        </View>
      )}

      <View style={styles.roleCard}>
        <Text style={styles.roleTitle}>{t('profile.roleTitle')}</Text>
        <Text style={styles.roleValue}>{roleLabel}</Text>
        <Text style={styles.permissionsSummary}>
          {permissionLabels.length > 0
            ? permissionLabels.join(' • ')
            : t('members.noPermissions')}
        </Text>
      </View>

      {/* Full Name */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>
          {t('labels.fullName')} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={isChildAccount ? [styles.input, styles.readOnly] : inputStyle('fullName')}
          value={fullName}
          onChangeText={(v) => { setFullName(v); clearError('fullName'); setSaved(false); }}
          placeholder={t('placeholders.fullName')}
          placeholderTextColor={colors.placeholder}
          editable={!isChildAccount}
        />
        {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}
      </View>

      {/* Birthday */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>
          {t('labels.birthday')}{' '}
          <Text style={styles.optional}>({t('common.optional')})</Text>
        </Text>
        {Platform.OS === 'web' ? (
          <input
            type="date"
            style={{
              width: '100%',
              height: 48,
              borderRadius: borderRadius,
              border: '1px solid #B0A4FD',
              padding: '0 16px',
              fontSize: 16,
              boxSizing: 'border-box',
              backgroundColor: colors.inputBackground,
              color: colors.text,
            } as React.CSSProperties}
            value={birthday ? birthday.toISOString().split('T')[0] : ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const val = event.target.value;
              setBirthday(val ? new Date(val) : null);
              setSaved(false);
            }}
            max={new Date().toISOString().split('T')[0]}
            disabled={isChildAccount}
          />
        ) : (
          <View>
            <AppButton
              title={birthday ? birthday.toLocaleDateString() : t('placeholders.birthday')}
              onPress={() => setShowDatePicker(true)}
              style={styles.datePickerBtn}
              disabled={isChildAccount}
            />
            {showDatePicker && DateTimePicker ? (
              <DateTimePicker
                value={birthday ?? new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_evt: any, date?: Date) => {
                  setShowDatePicker(false);
                  if (date) { setBirthday(date); setSaved(false); }
                }}
                maximumDate={new Date()}
              />
            ) : null}
          </View>
        )}
      </View>

      {/* Phone */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>
          {t('labels.phoneNumber')}{' '}
          <Text style={styles.optional}>({t('common.optional')})</Text>
        </Text>
        <TextInput
          style={isChildAccount ? [styles.input, styles.readOnly] : inputStyle('phone')}
          value={phone}
          onChangeText={(v) => { setPhone(v); clearError('phone'); setSaved(false); }}
          placeholder={t('placeholders.phone')}
          placeholderTextColor={colors.placeholder}
          keyboardType="phone-pad"
          editable={!isChildAccount}
        />
        {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
      </View>

      {/* City */}
      <View style={styles.fieldWrapper}>
        <Text style={styles.label}>
          {t('labels.city')}{' '}
          <Text style={styles.optional}>({t('common.optional')})</Text>
        </Text>
        <TextInput
          style={isChildAccount ? [styles.input, styles.readOnly] : styles.input}
          value={city}
          onChangeText={(v) => { setCity(v); setSaved(false); }}
          placeholder={t('placeholders.city')}
          placeholderTextColor={colors.placeholder}
          editable={!isChildAccount}
        />
      </View>

      {saved ? (
        <View style={styles.savedBanner}>
          <Text style={styles.savedText}>{t('profile.saveSuccess')}</Text>
        </View>
      ) : null}

      {!isChildAccount ? (
        <AppButton
          title={loading ? t('profile.saving') : t('profile.save')}
          onPress={handleSave}
          loading={loading}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  legend: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontSize: 13,
  },
  fieldWrapper: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSizes.small,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  optional: {
    color: colors.placeholder,
    fontWeight: '400',
    fontSize: 13,
  },
  input: {
    height: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: fontSizes.medium,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  readOnly: {
    backgroundColor: '#F0EEF8',
    color: colors.placeholder,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  infoBanner: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFD600',
    borderWidth: 1,
    borderRadius: borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  infoBannerTitle: {
    color: '#7A6000',
    fontSize: fontSizes.small,
    fontWeight: '700',
  },
  infoBannerBody: {
    color: '#7A6000',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  datePickerBtn: {
    marginVertical: 0,
    backgroundColor: colors.secondary,
  },
  savedBanner: {
    backgroundColor: '#E6FFF5',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  savedText: {
    color: '#00664A',
    fontSize: fontSizes.small,
    fontWeight: '600',
  },
  roleCard: {
    borderRadius: borderRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  roleTitle: {
    fontSize: fontSizes.small,
    fontWeight: '700',
    color: colors.text,
  },
  roleValue: {
    marginTop: spacing.xs,
    color: colors.primary,
    fontSize: fontSizes.medium,
    fontWeight: '700',
  },
  permissionsSummary: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
