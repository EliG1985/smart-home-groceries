import * as React from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { ShoppingPermissions, UserRole } from '../utils/userContext';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import {
  acceptInviteToken,
  declineInviteToken,
  lookupInviteByToken,
} from '../utils/collaborationApi';
import { clearPendingInviteToken, getPendingInviteToken } from '../utils/inviteLink';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  Main: undefined;
  InviteReview: undefined;
  BarcodeScanner: undefined;
};

type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

type InviteDetails = {
  email: string;
  invitedBy?: string;
  role: UserRole;
  permissions: ShoppingPermissions;
  expiresAt: string;
  status: InviteStatus;
};

type InviteReviewScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'InviteReview'>;
};

const permissionKeys: Array<keyof ShoppingPermissions> = [
  'create',
  'edit',
  'delete',
  'markDone',
  'viewProgress',
];

export default function InviteReviewScreen({ navigation }: InviteReviewScreenProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [token, setToken] = React.useState('');
  const [invite, setInvite] = React.useState<InviteDetails | null>(null);

  const loadInvite = React.useCallback(async () => {
    setLoading(true);
    try {
      const pendingToken = await getPendingInviteToken();
      if (!pendingToken) {
        navigation.replace('Main');
        return;
      }

      setToken(pendingToken);
      const response = await lookupInviteByToken(pendingToken);
      setInvite(response);

      if (response.status !== 'pending') {
        await clearPendingInviteToken();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('members.reviewLoadFailedBody');
      Alert.alert(t('members.reviewLoadFailedTitle'), message, [
        {
          text: t('common.continue'),
          onPress: () => navigation.replace('Main'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [navigation, t]);

  React.useEffect(() => {
    loadInvite().catch(() => undefined);
  }, [loadInvite]);

  const permissionsSummary = permissionKeys
    .filter((key) => invite?.permissions[key])
    .map((key) => t(`members.permissionLabels.${key}`));

  const handleAccept = async () => {
    if (!token) {
      return;
    }

    setProcessing(true);
    try {
      await acceptInviteToken(token);
      await clearPendingInviteToken();
      Alert.alert(t('members.acceptSuccessTitle'), t('members.acceptSuccessBody'));
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('members.acceptFailedBody');
      Alert.alert(t('members.acceptFailedTitle'), message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!token) {
      return;
    }

    setProcessing(true);
    try {
      await declineInviteToken(token);
      await clearPendingInviteToken();
      Alert.alert(t('members.declineSuccessTitle'), t('members.declineSuccessBody'));
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('members.declineFailedBody');
      Alert.alert(t('members.declineFailedTitle'), message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!invite) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t('members.reviewMissing')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('members.reviewTitle')}</Text>
        <Text style={styles.body}>{t('members.reviewBody')}</Text>

        <View style={styles.detailRow}>
          <Text style={styles.label}>{t('members.reviewInviteeLabel')}</Text>
          <Text style={styles.value}>{invite.email}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>{t('members.reviewRoleLabel')}</Text>
          <Text style={styles.value}>{t(`members.role${invite.role.charAt(0).toUpperCase()}${invite.role.slice(1)}`)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>{t('members.reviewStatusLabel')}</Text>
          <Text style={styles.value}>{t(`members.inviteStatus.${invite.status}`)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>{t('members.reviewExpiresLabel')}</Text>
          <Text style={styles.value}>{new Date(invite.expiresAt).toLocaleString()}</Text>
        </View>

        <Text style={styles.permissionsTitle}>{t('members.reviewPermissionsTitle')}</Text>
        <Text style={styles.permissionsValue}>
          {permissionsSummary.length > 0 ? permissionsSummary.join(' • ') : t('members.noPermissions')}
        </Text>

        <AppButton
          title={processing ? t('members.accepting') : t('members.reviewAcceptBtn')}
          onPress={handleAccept}
          loading={processing}
          style={styles.acceptBtn}
        />
        <AppButton
          title={processing ? '...' : t('members.reviewDeclineBtn')}
          onPress={handleDecline}
          disabled={processing}
          style={styles.declineBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  card: {
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#D9D0F2',
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.xlarge,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  detailRow: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  value: {
    color: colors.text,
    fontSize: fontSizes.medium,
  },
  permissionsTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    color: colors.text,
    fontWeight: '700',
    fontSize: fontSizes.small,
  },
  permissionsValue: {
    color: colors.textSecondary,
    fontSize: fontSizes.small,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  acceptBtn: {
    minHeight: 52,
    borderRadius: 18,
  },
  declineBtn: {
    minHeight: 52,
    borderRadius: 18,
    marginTop: spacing.sm,
    backgroundColor: '#F3F0FF',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
    textAlign: 'center',
  },
});