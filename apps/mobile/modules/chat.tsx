import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
	ActivityIndicator,
	Alert,
	AppState,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import {
	deleteChatMessage,
	editChatMessage,
	fetchChatMessages,
	sendChatMessage,
	type CollaborationChatMessage,
} from '../utils/collaborationApi';
import { getUserContext, type UserContext } from '../utils/userContext';
import { supabase } from '../utils/supabaseClient';

const formatTime = (value: string): string => {
	const ts = Date.parse(value);
	if (!Number.isFinite(ts)) {
		return '';
	}
	return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function ChatScreen() {
	const { t, i18n } = useTranslation();
	const [context, setContext] = React.useState<UserContext | null>(null);
	const [messages, setMessages] = React.useState<CollaborationChatMessage[]>([]);
	const [presenceSummary, setPresenceSummary] = React.useState({ online: 0, away: 0, offline: 0 });
	const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [text, setText] = React.useState('');
	const [sending, setSending] = React.useState(false);
	const [editingId, setEditingId] = React.useState<string | null>(null);
	const typingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const presenceChannelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);

	const loadMessages = React.useCallback(async (options?: { silent?: boolean }) => {
		const silent = Boolean(options?.silent);
		if (!silent) {
			setLoading(true);
		}

		try {
			const response = await fetchChatMessages(undefined, 80);
			setMessages(response.messages);
		} catch (error) {
			if (!silent) {
				const details = error instanceof Error ? error.message : t('messages.unknownError');
				Alert.alert(t('chat.loadFailedTitle'), details);
			}
		} finally {
			if (!silent) {
				setLoading(false);
			}
		}
	}, [t]);

	React.useEffect(() => {
		let mounted = true;
		getUserContext()
			.then((next) => {
				if (mounted) {
					setContext(next);
				}
			})
			.catch(() => undefined)
			.finally(() => {
				loadMessages().catch(() => undefined);
			});

		return () => {
			mounted = false;
		};
	}, [loadMessages]);

	React.useEffect(() => {
		if (!context?.familyId) {
			return;
		}

		const channel = supabase
			.channel(`chat-${context.familyId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'collaboration_messages',
					filter: `family_id=eq.${context.familyId}`,
				},
				() => {
					loadMessages({ silent: true }).catch(() => undefined);
				},
			)
			.subscribe();

		const presenceChannel = supabase.channel(`chat-presence-${context.familyId}`, {
			config: { presence: { key: context.userId } },
		});
		presenceChannelRef.current = presenceChannel;

		const updatePresenceState = () => {
			const state = presenceChannel.presenceState() as Record<string, Array<{ status?: string; typing?: boolean }>>;
			const typing: string[] = [];
			let online = 0;
			let away = 0;

			for (const [userId, metas] of Object.entries(state)) {
				if (!Array.isArray(metas) || metas.length === 0) {
					continue;
				}
				const latest = metas[metas.length - 1];
				if (latest?.status === 'away') {
					away += 1;
				} else {
					online += 1;
				}
				if (latest?.typing && userId !== context.userId) {
					typing.push(userId);
				}
			}

			const familyCount = Math.max(context.familyMembersCount || 1, online + away);
			const offline = Math.max(familyCount - online - away, 0);
			setPresenceSummary({ online, away, offline });
			setTypingUsers(typing.slice(0, 3));
		};

		const trackPresence = (status: 'online' | 'away', typing: boolean) =>
			presenceChannel.track({ status, typing, at: new Date().toISOString() });

		presenceChannel
			.on('presence', { event: 'sync' }, () => updatePresenceState())
			.on('presence', { event: 'join' }, () => updatePresenceState())
			.on('presence', { event: 'leave' }, () => updatePresenceState())
			.subscribe(async (status) => {
				if (status === 'SUBSCRIBED') {
					await trackPresence('online', false);
				}
			});

		const appStateSub = AppState.addEventListener('change', (nextState) => {
			if (nextState === 'active') {
				trackPresence('online', false).catch(() => undefined);
			} else {
				trackPresence('away', false).catch(() => undefined);
			}
		});

		return () => {
			supabase.removeChannel(channel);
			appStateSub.remove();
			presenceChannel.untrack().catch(() => undefined);
			supabase.removeChannel(presenceChannel);
			presenceChannelRef.current = null;
		};
	}, [context?.familyId, context?.familyMembersCount, context?.userId, loadMessages]);

	React.useEffect(() => () => {
		if (typingTimerRef.current) {
			clearTimeout(typingTimerRef.current);
			typingTimerRef.current = null;
		}
	}, []);

	const setTypingState = React.useCallback((typing: boolean) => {
		const channel = presenceChannelRef.current;
		if (!channel) {
			return;
		}
		channel.track({ status: 'online', typing, at: new Date().toISOString() }).catch(() => undefined);
	}, []);

	const onChangeText = (value: string) => {
		setText(value);
		setTypingState(value.trim().length > 0);

		if (typingTimerRef.current) {
			clearTimeout(typingTimerRef.current);
		}

		typingTimerRef.current = setTimeout(() => {
			setTypingState(false);
		}, 1400);
	};

	const onSend = async () => {
		const content = text.trim();
		if (!content || sending) {
			return;
		}

		setSending(true);
		try {
			if (editingId) {
				await editChatMessage(editingId, content);
			} else {
				await sendChatMessage(content, 'text');
			}
			setText('');
			setTypingState(false);
			setEditingId(null);
			await loadMessages({ silent: true });
		} catch (error) {
			const details = error instanceof Error ? error.message : t('messages.unknownError');
			Alert.alert(t('chat.sendFailedTitle'), details);
		} finally {
			setSending(false);
		}
	};

	const onDelete = (message: CollaborationChatMessage) => {
		Alert.alert(
			t('chat.deleteTitle'),
			t('chat.deleteBody'),
			[
				{ text: t('common.cancel'), style: 'cancel' },
				{
					text: t('chat.deleteConfirm'),
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteChatMessage(message.id);
							await loadMessages({ silent: true });
						} catch (error) {
							const details = error instanceof Error ? error.message : t('messages.unknownError');
							Alert.alert(t('chat.deleteFailedTitle'), details);
						}
					},
				},
			],
		);
	};

	const canEditOrDelete = (message: CollaborationChatMessage): boolean =>
		Boolean(context && (message.senderId === context.userId || context.role === 'admin'));

	if (loading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color={colors.primary} size="large" />
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Text style={styles.title}>{t('chat.title')}</Text>
			<View style={styles.presenceRow}>
				<Text style={styles.presenceText}>{t('chat.presenceOnline', { count: presenceSummary.online })}</Text>
				<Text style={styles.presenceText}>{t('chat.presenceAway', { count: presenceSummary.away })}</Text>
				<Text style={styles.presenceText}>{t('chat.presenceOffline', { count: presenceSummary.offline })}</Text>
			</View>
			{typingUsers.length > 0 ? (
				<Text style={styles.typingText}>
					{typingUsers.length === 1
						? t('chat.typingOne', { user: typingUsers[0] })
						: t('chat.typingMany', { count: typingUsers.length })}
				</Text>
			) : null}

			{messages.length === 0 ? (
				<View style={styles.centered}>
					<Text style={styles.emptyText}>{t('chat.empty')}</Text>
				</View>
			) : (
				<FlatList
					data={messages}
					keyExtractor={(item) => item.id}
					contentContainerStyle={styles.listContent}
					renderItem={({ item }) => (
						<View style={styles.messageCard}>
							<View style={styles.messageHeader}>
								<Text style={styles.senderText}>{item.senderId}</Text>
								<Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
							</View>
							<Text style={[styles.messageText, { textAlign: i18n.language === 'he' ? 'right' : 'left' }]}>
								{item.content}
							</Text>
							{item.editedAt ? <Text style={styles.editedText}>{t('chat.edited')}</Text> : null}
							{canEditOrDelete(item) ? (
								<View style={styles.actionsRow}>
									<Pressable
										onPress={() => {
											setEditingId(item.id);
											setText(item.content);
										}}
									>
										<Text style={styles.actionText}>{t('chat.edit')}</Text>
									</Pressable>
									<Pressable onPress={() => onDelete(item)}>
										<Text style={[styles.actionText, styles.deleteText]}>{t('chat.delete')}</Text>
									</Pressable>
								</View>
							) : null}
						</View>
					)}
				/>
			)}

			<View style={styles.composerCard}>
				<TextInput
					style={styles.input}
					value={text}
					onChangeText={onChangeText}
					placeholder={t('chat.placeholder')}
					placeholderTextColor={colors.placeholder}
					multiline
					maxLength={2000}
					textAlign={i18n.language === 'he' ? 'right' : 'left'}
				/>
				<View style={styles.composerActions}>
					{editingId ? (
						<AppButton
							title={t('chat.cancelEdit')}
							onPress={() => {
								setEditingId(null);
								setText('');
								setTypingState(false);
							}}
							style={[styles.sendButton, styles.cancelButton]}
						/>
					) : null}
					<AppButton
						title={sending ? t('chat.sending') : editingId ? t('chat.saveEdit') : t('chat.send')}
						onPress={onSend}
						loading={sending}
						style={styles.sendButton}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
		padding: spacing.md,
	},
	presenceRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		marginBottom: spacing.xs,
		flexWrap: 'wrap',
	},
	presenceText: {
		color: colors.textSecondary,
		fontSize: 11,
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 999,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
	},
	typingText: {
		color: colors.textSecondary,
		fontSize: 11,
		marginBottom: spacing.xs,
		fontStyle: 'italic',
	},
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: {
		color: colors.text,
		fontSize: fontSizes.large,
		fontWeight: '700',
		marginBottom: spacing.sm,
	},
	emptyText: {
		color: colors.textSecondary,
		fontSize: fontSizes.small,
	},
	listContent: {
		paddingBottom: spacing.md,
	},
	messageCard: {
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: colors.border,
		padding: spacing.sm,
		marginBottom: spacing.sm,
	},
	messageHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: spacing.xs,
	},
	senderText: {
		color: colors.text,
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	timeText: {
		color: colors.textSecondary,
		fontSize: 11,
	},
	messageText: {
		color: colors.text,
		fontSize: fontSizes.small,
	},
	editedText: {
		marginTop: spacing.xs,
		color: colors.textSecondary,
		fontSize: 11,
		fontStyle: 'italic',
	},
	actionsRow: {
		marginTop: spacing.sm,
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.md,
	},
	actionText: {
		color: colors.primary,
		fontSize: fontSizes.small,
		fontWeight: '600',
	},
	deleteText: {
		color: colors.error,
	},
	composerCard: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: spacing.sm,
	},
	input: {
		minHeight: 56,
		maxHeight: 128,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: borderRadius,
		backgroundColor: colors.inputBackground,
		color: colors.text,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		marginBottom: spacing.sm,
	},
	composerActions: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'flex-end',
		gap: spacing.sm,
	},
	sendButton: {
		minWidth: 110,
		marginVertical: 0,
	},
	cancelButton: {
		backgroundColor: colors.secondary,
	},
});
