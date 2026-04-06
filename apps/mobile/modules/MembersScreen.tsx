import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppButton from '../ui/AppButton';
import { colors, spacing, borderRadius, fontSizes } from '../ui/theme';
import { supabase } from '../utils/supabaseClient';
import { getUserContext } from '../utils/userContext';
import type { ShoppingPermissions, UserRole } from '../utils/userContext';
import {
  fetchCollaborationActivity,
  fetchParticipants,
  fetchInvites,
  generateInviteLink,
  inviteMember,
  resendInvite,
  revokeInvite,
  removeMember,
  type CollaborationActivityEvent,
  type CollabMember,
} from '../utils/collaborationApi';
import {
  deleteShoppingListItem,
  fetchShoppingListItems,
  markItemAsBought,
} from '../utils/inventoryApi';
import type { ShoppingListItem } from '../../../shared/types';

type Member = CollabMember & { isSelf: boolean };
type InviteItem = {
  id: string;
  token: string;
  email: string;
  role: UserRole;
  permissions: ShoppingPermissions;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'declined';
};

const ROLE_BADGE_COLOR: Record<UserRole, string> = {
  admin: colors.primary,
  editor: '#00AAFF',
  viewer: '#9DA3AE',
};

const roleDefaults = (role: UserRole): ShoppingPermissions => {
  if (role === 'viewer') {
    return {
      create: false,
      edit: false,
      delete: false,
      markDone: true,
      viewProgress: true,
    };
  }

  return {
    create: true,
    edit: true,
    delete: true,
    markDone: true,
    viewProgress: true,
  };
};

const permissionsSummary = (t: (key: string) => string, p: ShoppingPermissions): string => {
  const enabled: string[] = [];
  if (p.create) enabled.push(t('members.permCreate'));
  if (p.edit) enabled.push(t('members.permEdit'));
  if (p.delete) enabled.push(t('members.permDelete'));
  if (p.markDone) enabled.push(t('members.permMarkDone'));
  if (p.viewProgress) enabled.push(t('members.permViewProgress'));
  return enabled.length ? enabled.join(' • ') : t('members.noPermissions');
};

export default function MembersScreen() {
  const { t } = useTranslation();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [myRole, setMyRole] = React.useState<UserRole>('admin');
  const [isChildAccount, setIsChildAccount] = React.useState(false);
  const [fetching, setFetching] = React.useState(true);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteEmailError, setInviteEmailError] = React.useState('');
  const [inviting, setInviting] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [inviteRole, setInviteRole] = React.useState<UserRole>('viewer');
  const [invitePermissions, setInvitePermissions] = React.useState<ShoppingPermissions>(
    roleDefaults('viewer'),
  );
  const [pendingInvites, setPendingInvites] = React.useState<InviteItem[]>([]);
  const [inviteActionId, setInviteActionId] = React.useState<string | null>(null);
  const [inviteLink, setInviteLink] = React.useState('');
  const [generatingLink, setGeneratingLink] = React.useState(false);
  const [activityEvents, setActivityEvents] = React.useState<CollaborationActivityEvent[]>([]);
  const [liveControlItems, setLiveControlItems] = React.useState<ShoppingListItem[]>([]);
  const [liveControlLoading, setLiveControlLoading] = React.useState(false);
  const [liveControlActionId, setLiveControlActionId] = React.useState<string | null>(null);

  const loadMembers = React.useCallback(async (options?: { background?: boolean }) => {
    const background = Boolean(options?.background);
    if (!background) {
      setFetching(true);
    }

    try {
      const [ctx, { data: userData }] = await Promise.all([
        getUserContext(),
        supabase.auth.getUser(),
      ]);
      setMyRole(ctx.role);
      setIsChildAccount(ctx.accountType === 'child');

      if (ctx.accountType === 'child') {
        setMembers([]);
        setPendingInvites([]);
        setActivityEvents([]);
        setLiveControlItems([]);
        if (!background) {
          setFetching(false);
        }
        return;
      }

      const selfMember: Member = {
        id: ctx.userId,
        email: userData?.user?.email ?? '',
        fullName: String(
          userData?.user?.user_metadata?.full_name ?? t('members.unknownMember'),
        ),
        role: ctx.role,
        permissions: ctx.permissions,
        isSelf: true,
      };

      // Render immediately with local self-member data, then hydrate remote data.
      setMembers([selfMember]);
      if (!background) {
        setFetching(false);
      }

      const [participantsResult, invitesResult] = await Promise.allSettled([
        fetchParticipants(),
        ctx.role === 'admin' ? fetchInvites('pending') : Promise.resolve({ invites: [] }),
      ]);

      if (participantsResult.status === 'fulfilled') {
        const others: Member[] = (participantsResult.value.participants ?? [])
          .filter((p) => p.id !== ctx.userId)
          .map((p) => ({ ...p, isSelf: false }));
        setMembers([selfMember, ...others]);
      }

      if (invitesResult.status === 'fulfilled') {
        setPendingInvites(invitesResult.value.invites ?? []);
      } else {
        setPendingInvites([]);
      }

      if (ctx.role === 'admin') {
        const [activityResult, shoppingListResult] = await Promise.all([
          fetchCollaborationActivity(undefined, 12),
          fetchShoppingListItems(),
        ]);
        setActivityEvents(activityResult.events ?? []);
        setLiveControlItems((shoppingListResult ?? []).slice(0, 8));
      } else {
        setActivityEvents([]);
        setLiveControlItems([]);
      }
    } catch {
      if (!background) {
        setMembers([]);
        setFetching(false);
      }
    }
  }, [t]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const onInviteRoleChange = (role: UserRole) => {
    setInviteRole(role);
    setInvitePermissions(roleDefaults(role));
  };

  const setPermission = (key: keyof ShoppingPermissions, value: boolean) => {
    setInvitePermissions((prev) => ({ ...prev, [key]: value }));
  };

  const handleInvite = async () => {
    if (
      !inviteEmail.trim() ||
      !inviteEmail.trim().match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
    ) {
      setInviteEmailError(t('validation.emailValid'));
      return;
    }
    setInviteEmailError('');
    setInviting(true);
    try {
      const response = await inviteMember(
        inviteEmail.trim(),
        inviteRole,
        invitePermissions,
      );
      Alert.alert(
        t('members.inviteSentTitle'),
        t('members.inviteSentBody', { email: inviteEmail.trim() }),
      );
      setMembers((prev) => [
        ...prev.filter((entry) => entry.id !== response.member.id),
        { ...response.member, isSelf: false },
      ]);
      setInviteEmail('');
      setInviteRole('viewer');
      setInvitePermissions(roleDefaults('viewer'));
      await loadMembers();
    } catch (error) {
      const details = error instanceof Error ? error.message : t('messages.unexpectedError');
      Alert.alert(t('members.inviteFailedTitle'), details);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = (member: Member) => {
    Alert.alert(
      t('members.removeTitle'),
      t('members.removeConfirm', { name: member.fullName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('members.removeConfirmBtn'),
          style: 'destructive',
          onPress: async () => {
            setRemovingId(member.id);
            try {
              await removeMember(member.id);
              setMembers((prev) => prev.filter((m) => m.id !== member.id));
            } catch {
              Alert.alert(
                t('members.removeFailedTitle'),
                t('messages.unexpectedError'),
              );
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  };

  const roleLabel = (r: UserRole) => {
    const labels: Record<UserRole, string> = {
      admin: t('members.roleAdmin'),
      editor: t('members.roleEditor'),
      viewer: t('members.roleViewer'),
    };
    return labels[r];
  };

  const activityLabel = (eventType: string): string => {
    const labels: Record<string, string> = {
      member_invited: t('members.activity.memberInvited'),
      invite_accepted: t('members.activity.inviteAccepted'),
      invite_revoked: t('members.activity.inviteRevoked'),
      member_removed: t('members.activity.memberRemoved'),
      chat_message_sent: t('members.activity.chatMessageSent'),
      chat_message_edited: t('members.activity.chatMessageEdited'),
      chat_message_deleted: t('members.activity.chatMessageDeleted'),
      shopping_item_updated: t('members.activity.shoppingItemUpdated'),
    };
    return labels[eventType] ?? eventType;
  };

  if (fetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isChildAccount) {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.blockedCard}>
          <Text style={styles.blockedTitle}>{t('childAccount.membersTitle')}</Text>
          <Text style={styles.blockedBody}>{t('childAccount.membersBody')}</Text>
        </View>
      </View>
    );
  }

  const canInvite = myRole === 'admin';
  const canRemove = myRole === 'admin';

  const handleGenerateInviteLink = async () => {
    setGeneratingLink(true);
    try {
      const response = await generateInviteLink(inviteRole, invitePermissions);
      setInviteLink(response.inviteLink);
      Alert.alert(t('members.linkGeneratedTitle'), t('members.linkGeneratedBody'));
      await loadMembers();
    } catch (error) {
      const details = error instanceof Error ? error.message : t('messages.unexpectedError');
      Alert.alert(t('members.linkGenerateFailedTitle'), details);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleShareGeneric = async () => {
    if (!inviteLink) {
      Alert.alert(t('members.linkMissingTitle'), t('members.linkMissingBody'));
      return;
    }
    try {
      await Share.share({
        message: t('members.shareMessage', { link: inviteLink }),
      });
    } catch {
      Alert.alert(t('members.shareFailedTitle'), t('messages.unexpectedError'));
    }
  };

  const handleShareSms = async () => {
    if (!inviteLink) {
      Alert.alert(t('members.linkMissingTitle'), t('members.linkMissingBody'));
      return;
    }
    const smsUrl = `sms:?body=${encodeURIComponent(t('members.shareMessage', { link: inviteLink }))}`;
    const supported = await Linking.canOpenURL(smsUrl);
    if (!supported) {
      Alert.alert(t('members.shareUnavailableTitle'), t('members.shareUnavailableBody'));
      return;
    }
    await Linking.openURL(smsUrl);
  };

  const handleShareWhatsapp = async () => {
    if (!inviteLink) {
      Alert.alert(t('members.linkMissingTitle'), t('members.linkMissingBody'));
      return;
    }
    const waUrl = `whatsapp://send?text=${encodeURIComponent(t('members.shareMessage', { link: inviteLink }))}`;
    const webFallback = `https://wa.me/?text=${encodeURIComponent(t('members.shareMessage', { link: inviteLink }))}`;
    const nativeSupported = await Linking.canOpenURL(waUrl);
    if (nativeSupported) {
      await Linking.openURL(waUrl);
      return;
    }
    await Linking.openURL(webFallback);
  };

  const handleResendInvite = async (invite: InviteItem) => {
    setInviteActionId(invite.id);
    try {
      const response = await resendInvite(invite.id);
      setPendingInvites((prev) =>
        prev.map((entry) =>
          entry.id === invite.id ? response.invite : entry,
        ),
      );
      Alert.alert(t('members.resendSuccessTitle'), t('members.resendSuccessBody'));
    } catch {
      Alert.alert(t('members.resendFailedTitle'), t('messages.unexpectedError'));
    } finally {
      setInviteActionId(null);
    }
  };

  const handleRevokeInvite = async (invite: InviteItem) => {
    setInviteActionId(invite.id);
    try {
      await revokeInvite(invite.id);
      setPendingInvites((prev) => prev.filter((entry) => entry.id !== invite.id));
      Alert.alert(t('members.revokeSuccessTitle'), t('members.revokeSuccessBody'));
    } catch {
      Alert.alert(t('members.revokeFailedTitle'), t('messages.unexpectedError'));
    } finally {
      setInviteActionId(null);
    }
  };

  const refreshLiveControlItems = async () => {
    setLiveControlLoading(true);
    try {
      const nextItems = await fetchShoppingListItems();
      setLiveControlItems((nextItems ?? []).slice(0, 8));
    } catch {
      Alert.alert(t('members.liveControl.failedTitle'), t('shoppingList.loadFailedTitle'));
    } finally {
      setLiveControlLoading(false);
    }
  };

  const handleLiveMarkBought = async (item: ShoppingListItem) => {
    setLiveControlActionId(`buy:${item.id}`);
    try {
      await markItemAsBought(item.id);
      await refreshLiveControlItems();
    } catch {
      Alert.alert(t('members.liveControl.failedTitle'), t('messages.unexpectedError'));
    } finally {
      setLiveControlActionId(null);
    }
  };

  const handleLiveDelete = async (item: ShoppingListItem) => {
    setLiveControlActionId(`delete:${item.id}`);
    try {
      await deleteShoppingListItem(item.id);
      await refreshLiveControlItems();
    } catch {
      Alert.alert(t('members.liveControl.failedTitle'), t('messages.unexpectedError'));
    } finally {
      setLiveControlActionId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {canInvite ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('members.inviteTitle')}</Text>
          <TextInput
            style={inviteEmailError ? [styles.input, styles.inputError] : styles.input}
            value={inviteEmail}
            onChangeText={(v) => {
              setInviteEmail(v);
              setInviteEmailError('');
            }}
            placeholder={t('members.invitePlaceholder')}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {inviteEmailError ? (
            <Text style={styles.errorText}>{inviteEmailError}</Text>
          ) : null}

          <Text style={styles.subTitle}>{t('members.roleTitle')}</Text>
          <View style={styles.roleRow}>
            <Pressable
              onPress={() => onInviteRoleChange('admin')}
              style={inviteRole === 'admin' ? styles.roleOptionActive : styles.roleOption}
            >
              <Text style={inviteRole === 'admin' ? styles.roleOptionTextActive : styles.roleOptionText}>
                {t('members.roleAdmin')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onInviteRoleChange('viewer')}
              style={inviteRole === 'viewer' ? styles.roleOptionActive : styles.roleOption}
            >
              <Text style={inviteRole === 'viewer' ? styles.roleOptionTextActive : styles.roleOptionText}>
                {t('members.roleViewer')}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.subTitle}>{t('members.permissionsTitle')}</Text>
          <View style={styles.permissionsBox}>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionLabel}>{t('members.permCreate')}</Text>
              <Switch
                value={invitePermissions.create}
                onValueChange={(value) => setPermission('create', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionLabel}>{t('members.permEdit')}</Text>
              <Switch
                value={invitePermissions.edit}
                onValueChange={(value) => setPermission('edit', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionLabel}>{t('members.permDelete')}</Text>
              <Switch
                value={invitePermissions.delete}
                onValueChange={(value) => setPermission('delete', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionLabel}>{t('members.permMarkDone')}</Text>
              <Switch
                value={invitePermissions.markDone}
                onValueChange={(value) => setPermission('markDone', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionLabel}>{t('members.permViewProgress')}</Text>
              <Switch
                value={invitePermissions.viewProgress}
                onValueChange={(value) => setPermission('viewProgress', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>

          <AppButton
            title={inviting ? t('members.inviting') : t('members.invite')}
            onPress={handleInvite}
            loading={inviting}
            style={styles.primaryCta}
          />

          <AppButton
            title={generatingLink ? t('members.generatingLink') : t('members.generateLinkBtn')}
            onPress={handleGenerateInviteLink}
            loading={generatingLink}
            style={[styles.primaryCta, styles.linkCta]}
          />

          {inviteLink ? (
            <View style={styles.linkBox}>
              <Text style={styles.tokenTitle}>{t('members.generatedLinkTitle')}</Text>
              <Text style={styles.linkValue}>{inviteLink}</Text>
              <View style={styles.shareRow}>
                <Pressable style={styles.shareBtn} onPress={handleShareSms}>
                  <Text style={styles.shareBtnText}>{t('members.shareSmsBtn')}</Text>
                </Pressable>
                <Pressable style={styles.shareBtn} onPress={handleShareWhatsapp}>
                  <Text style={styles.shareBtnText}>{t('members.shareWhatsappBtn')}</Text>
                </Pressable>
                <Pressable style={styles.shareBtn} onPress={handleShareGeneric}>
                  <Text style={styles.shareBtnText}>{t('members.shareMoreBtn')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

        </View>
      ) : null}

      {canInvite ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('members.pendingInvitesTitle')}</Text>
          {pendingInvites.length === 0 ? (
            <Text style={styles.emptyText}>{t('members.pendingInvitesEmpty')}</Text>
          ) : (
            pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteRow}>
                <View style={styles.inviteInfo}>
                  <Text style={styles.memberName}>{invite.email}</Text>
                  <Text style={styles.memberPermissions}>
                    {roleLabel(invite.role)} • {permissionsSummary(t, invite.permissions)}
                  </Text>
                  <Text style={styles.inviteExpiryText}>
                    {t('members.expiresAt')}: {new Date(invite.expiresAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.inviteActions}>
                  <Pressable
                    onPress={() => handleResendInvite(invite)}
                    disabled={inviteActionId !== null}
                    style={styles.inlineActionBtn}
                  >
                    <Text style={styles.inlineActionText}>
                      {inviteActionId === invite.id ? '...' : t('members.resendBtn')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRevokeInvite(invite)}
                    disabled={inviteActionId !== null}
                    style={[styles.inlineActionBtn, styles.inlineDangerBtn]}
                  >
                    <Text style={[styles.inlineActionText, styles.inlineDangerText]}>
                      {t('members.revokeBtn')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

      {canInvite ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('members.activity.title')}</Text>
          {activityEvents.length === 0 ? (
            <Text style={styles.emptyText}>{t('members.activity.empty')}</Text>
          ) : (
            activityEvents.map((event) => (
              <View key={event.id} style={styles.activityRow}>
                <Text style={styles.activityEventText}>{activityLabel(event.eventType)}</Text>
                <Text style={styles.activityMetaText}>
                  {event.actorId} • {new Date(event.createdAt).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {canInvite ? (
        <View style={styles.section}>
          <View style={styles.liveHeaderRow}>
            <Text style={styles.sectionTitle}>{t('members.liveControl.title')}</Text>
            <Pressable onPress={refreshLiveControlItems} disabled={liveControlLoading} style={styles.inlineActionBtn}>
              <Text style={styles.inlineActionText}>
                {liveControlLoading ? '...' : t('members.liveControl.refreshBtn')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.liveSubtitle}>{t('members.liveControl.subtitle')}</Text>

          {liveControlLoading && liveControlItems.length === 0 ? (
            <Text style={styles.emptyText}>{t('members.liveControl.loading')}</Text>
          ) : liveControlItems.length === 0 ? (
            <Text style={styles.emptyText}>{t('members.liveControl.empty')}</Text>
          ) : (
            liveControlItems.map((item) => (
              <View key={item.id} style={styles.liveRow}>
                <View style={styles.liveInfo}>
                  <Text style={styles.memberName}>{item.productName}</Text>
                  <Text style={styles.memberPermissions}>
                    {item.category} • {item.quantity} • ₪{item.price.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.liveActions}>
                  <Pressable
                    onPress={() => handleLiveMarkBought(item)}
                    disabled={Boolean(liveControlActionId)}
                    style={styles.inlineActionBtn}
                  >
                    <Text style={styles.inlineActionText}>
                      {liveControlActionId === `buy:${item.id}` ? '...' : t('shoppingList.markBought')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleLiveDelete(item)}
                    disabled={Boolean(liveControlActionId)}
                    style={[styles.inlineActionBtn, styles.inlineDangerBtn]}
                  >
                    <Text style={[styles.inlineActionText, styles.inlineDangerText]}>
                      {liveControlActionId === `delete:${item.id}` ? '...' : t('shoppingList.delete')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('members.listTitle')}</Text>
        {members.length === 0 ? (
          <Text style={styles.emptyText}>{t('members.empty')}</Text>
        ) : (
          members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {member.fullName}
                  {member.isSelf ? ` (${t('members.you')})` : ''}
                </Text>
                {member.email ? (
                  <Text style={styles.memberEmail}>{member.email}</Text>
                ) : null}
                <Text style={styles.memberPermissions}>
                  {permissionsSummary(t, member.permissions)}
                </Text>
              </View>
              <View style={styles.memberRight}>
                <View
                  style={[
                    styles.roleBadge,
                    { backgroundColor: ROLE_BADGE_COLOR[member.role] },
                  ]}
                >
                  <Text style={styles.roleBadgeText}>{roleLabel(member.role)}</Text>
                </View>
                {canRemove && !member.isSelf ? (
                  <AppButton
                    title={removingId === member.id ? '...' : t('members.remove')}
                    onPress={() => handleRemove(member)}
                    disabled={removingId !== null}
                    style={styles.removeBtn}
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      {myRole === 'viewer' ? (
        <View style={styles.viewerNote}>
          <Text style={styles.viewerNoteText}>{t('permissions.viewerWriteBlocked')}</Text>
        </View>
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
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  blockedCard: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFD600',
    borderWidth: 1,
    borderRadius: borderRadius,
    padding: spacing.md,
  },
  blockedTitle: {
    color: '#7A6000',
    fontSize: fontSizes.medium,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  blockedBody: {
    color: '#7A6000',
    fontSize: fontSizes.small,
    lineHeight: 20,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#D9D0F2',
    shadowColor: '#5E4CD8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: fontSizes.large,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  subTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    color: colors.text,
    fontWeight: '600',
    fontSize: fontSizes.small,
  },
  input: {
    height: 52,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: fontSizes.medium,
    marginBottom: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 1.5,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  roleOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#EFEAFE',
  },
  roleOptionActive: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  roleOptionText: {
    color: '#3D2F80',
    fontWeight: '700',
    fontSize: fontSizes.medium,
  },
  roleOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: fontSizes.medium,
  },
  permissionsBox: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: '#FBFAFF',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  permissionLabel: {
    color: colors.text,
    fontSize: fontSizes.small,
    flex: 1,
    marginRight: spacing.sm,
  },
  primaryCta: {
    minHeight: 54,
    borderRadius: 20,
    marginTop: spacing.xs,
  },
  linkCta: {
    backgroundColor: '#2B8E6A',
  },
  emptyText: {
    color: colors.placeholder,
    fontSize: fontSizes.small,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  memberName: {
    fontSize: fontSizes.small,
    fontWeight: '600',
    color: colors.text,
  },
  memberEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  memberPermissions: {
    marginTop: 4,
    color: colors.placeholder,
    fontSize: 11,
    lineHeight: 17,
  },
  memberRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  roleBadge: {
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  removeBtn: {
    backgroundColor: colors.error,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginVertical: 0,
    borderRadius: 12,
  },
  viewerNote: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFD600',
    borderWidth: 1,
    borderRadius: borderRadius,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  viewerNoteText: {
    color: '#7A6000',
    fontSize: fontSizes.small,
  },
  tokenTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  linkBox: {
    marginTop: spacing.sm,
    borderRadius: borderRadius,
    borderWidth: 1,
    borderColor: '#B8E2D2',
    backgroundColor: '#F1FFF8',
    padding: spacing.sm,
  },
  linkValue: {
    color: colors.text,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  shareRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  shareBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B8E2D2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  shareBtnText: {
    color: '#1F6A4D',
    fontWeight: '700',
    fontSize: 12,
  },
  inviteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteActions: {
    width: 110,
    gap: spacing.xs,
  },
  inlineActionBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F1FF',
    paddingHorizontal: spacing.xs,
  },
  inlineActionText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  inlineDangerBtn: {
    borderColor: '#E7B6B6',
    backgroundColor: '#FFF5F5',
  },
  inlineDangerText: {
    color: '#B63B3B',
  },
  inviteExpiryText: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 11,
  },
  activityRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs + 2,
  },
  activityEventText: {
    color: colors.text,
    fontSize: fontSizes.small,
    fontWeight: '600',
  },
  activityMetaText: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
  },
  liveHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveSubtitle: {
    marginTop: -4,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: 12,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  liveInfo: {
    flex: 1,
  },
  liveActions: {
    width: 124,
    gap: spacing.xs,
  },
});
