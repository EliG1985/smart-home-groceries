import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
	AppState,
	Alert,
	Pressable,
	SectionList,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native';
import type { ShoppingListItem } from '../../../shared/types';
import {
	ApiRequestError,
	deleteShoppingListItem,
	fetchAtHomeItems,
	moveItemBackToList,
	replayPendingInventoryWrites,
	subscribeInventoryLiveUpdates,
	updateInventoryItem,
	type InventoryLiveEvent,
} from '../utils/inventoryApi';
import { addNetInfoListener } from '../utils/netInfoSafe';
import { getUserContext } from '../utils/userContext';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';

type GroupedSection = {
	title: string;
	data: ShoppingListItem[];
};

const CACHE_KEY = 'inventoryAtHomeCache';

const groupByCategory = (items: ShoppingListItem[]): GroupedSection[] => {
	const map = new Map<string, ShoppingListItem[]>();

	for (const item of items) {
		const category = item.category || 'Other';
		const current = map.get(category) || [];
		current.push(item);
		map.set(category, current);
	}

	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([title, data]) => ({ title, data }));
};

const totalValue = (items: ShoppingListItem[]): number =>
	items.reduce((acc, item) => acc + item.price * item.quantity, 0);

const getExpiryStatus = (expiryDate: string): 'expired' | 'warning' | 'ok' => {
	const expiryTimestamp = Date.parse(expiryDate);
	if (Number.isNaN(expiryTimestamp)) {
		return 'ok';
	}

	const now = Date.now();
	if (expiryTimestamp < now) {
		return 'expired';
	}

	const hoursLeft = (expiryTimestamp - now) / (1000 * 60 * 60);
	if (hoursLeft <= 48) {
		return 'warning';
	}

	return 'ok';
};

const getExpiryTone = (status: 'expired' | 'warning' | 'ok') => {
	if (status === 'expired') {
		return { text: '#B00020', background: '#FFE4E9' };
	}

	if (status === 'warning') {
		return { text: '#8A5200', background: '#FFEFD6' };
	}

	return { text: '#1F5E37', background: '#E6F8EE' };
};

export default function InventoryScreen() {
	const { t, i18n } = useTranslation();
	const { width } = useWindowDimensions();
	const compactActions = width < 420;
	const [items, setItems] = React.useState<ShoppingListItem[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [refreshing, setRefreshing] = React.useState(false);
	const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
	const [canWrite, setCanWrite] = React.useState(true);
	const [writeBlockedMessage, setWriteBlockedMessage] = React.useState<string | null>(null);
	const [editForm, setEditForm] = React.useState({
		productName: '',
		category: '',
		expiryDate: '',
		price: '',
		quantity: '',
	});

	const sections = React.useMemo(() => groupByCategory(items), [items]);

	const refreshWriteAccess = React.useCallback(async () => {
		const context = await getUserContext();
		if (context.role === 'viewer') {
			setCanWrite(false);
			setWriteBlockedMessage(t('permissions.viewerWriteBlocked'));
			return;
		}
		if (context.familyMembersCount > 1 && context.subscriptionTier !== 'Premium') {
			setCanWrite(false);
			setWriteBlockedMessage(t('permissions.premiumRequired'));
			return;
		}

		setCanWrite(true);
		setWriteBlockedMessage(null);
	}, [t]);

	const ensureCanWrite = React.useCallback(() => {
		if (canWrite) {
			return true;
		}

		Alert.alert(
			t('inventory.updateFailedTitle'),
			writeBlockedMessage ?? t('permissions.viewerWriteBlocked'),
		);
		return false;
	}, [canWrite, t, writeBlockedMessage]);

	const getActionErrorMessage = React.useCallback(
		(error: unknown): string => {
			if (error instanceof ApiRequestError) {
				if (error.code === 'FORBIDDEN_ROLE') {
					return t('permissions.viewerWriteBlocked');
				}
				if (error.code === 'PREMIUM_REQUIRED') {
					return t('permissions.premiumRequired');
				}
				return error.message;
			}

			return error instanceof Error ? error.message : t('messages.unknownError');
		},
		[t],
	);

	const persistCache = React.useCallback(async (nextItems: ShoppingListItem[]) => {
		await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextItems));
	}, []);

	const hydrateFromCache = React.useCallback(async (): Promise<boolean> => {
		const cached = await AsyncStorage.getItem(CACHE_KEY);
		if (!cached) {
			return false;
		}

		try {
			const parsed = JSON.parse(cached) as ShoppingListItem[];
			setItems(parsed);
			return true;
		} catch {
			return false;
		}
	}, []);

	const loadInventory = React.useCallback(async (options?: { silent?: boolean }) => {
		const silent = Boolean(options?.silent);
		try {
			const fetched = await fetchAtHomeItems();
			setItems(fetched);
			await persistCache(fetched);
		} catch (error) {
			const hydrated = await hydrateFromCache();
			if (hydrated) {
				return;
			}

			if (!silent) {
				Alert.alert(t('inventory.loadFailedTitle'), getActionErrorMessage(error));
			}
		}
	}, [getActionErrorMessage, hydrateFromCache, persistCache, t]);

	React.useEffect(() => {
		let isMounted = true;
		refreshWriteAccess().catch(() => undefined);
		hydrateFromCache()
			.finally(() => {
				if (isMounted) {
					setLoading(false);
				}
				loadInventory({ silent: true }).catch(() => undefined);
			});

		return () => {
			isMounted = false;
		};
	}, [hydrateFromCache, loadInventory, refreshWriteAccess]);

	const handleLiveEvent = React.useCallback((event: InventoryLiveEvent) => {
		if (event.type === 'reload') {
			loadInventory({ silent: true }).catch(() => undefined);
			return;
		}
		if (event.type === 'delete') {
			setItems((prev) => prev.filter((i) => i.id !== event.id));
			return;
		}
		if (event.type === 'upsert') {
			if (event.item.status !== 'At_Home') {
				// Item moved back to list — remove from At_Home view
				setItems((prev) => prev.filter((i) => i.id !== event.item.id));
				return;
			}
			setItems((prev) => {
				const idx = prev.findIndex((i) => i.id === event.item.id);
				if (idx >= 0) {
					const next = [...prev];
					next[idx] = event.item;
					return next;
				}
				return [event.item, ...prev];
			});
		}
	}, [loadInventory]);

	const subscriptionRef = React.useRef<(() => void) | null>(null);

	const resubscribe = React.useCallback(() => {
		subscriptionRef.current?.();
		subscriptionRef.current = subscribeInventoryLiveUpdates(handleLiveEvent, 12000);
	}, [handleLiveEvent]);

	React.useEffect(() => {
		resubscribe();
		return () => {
			subscriptionRef.current?.();
			subscriptionRef.current = null;
		};
	}, [resubscribe]);

	React.useEffect(() => {
		const sub = AppState.addEventListener('change', (nextState) => {
			if (nextState === 'active') {
				replayPendingInventoryWrites().then((count) => {
					if (count > 0) {
						loadInventory({ silent: true }).catch(() => undefined);
					}
				}).catch(() => undefined);
				refreshWriteAccess().catch(() => undefined);
				resubscribe();
			}
		});
		return () => sub.remove();
	}, [loadInventory, refreshWriteAccess, resubscribe]);

	React.useEffect(() => {
		const unsubscribe = addNetInfoListener((state) => {
			if (state.isConnected && state.isInternetReachable !== false) {
				replayPendingInventoryWrites().then((count) => {
					if (count > 0) {
						loadInventory({ silent: true }).catch(() => undefined);
					}
				}).catch(() => undefined);
			}
		});

		return unsubscribe;
	}, [loadInventory]);

	const onRefresh = async () => {
		setRefreshing(true);
		await loadInventory();
		setRefreshing(false);
	};

	const openEdit = (item: ShoppingListItem) => {
		setEditingItemId(item.id);
		setEditForm({
			productName: item.productName,
			category: item.category,
			expiryDate: item.expiryDate,
			price: String(item.price),
			quantity: String(item.quantity),
		});
	};

	const closeEdit = () => {
		setEditingItemId(null);
		setEditForm({
			productName: '',
			category: '',
			expiryDate: '',
			price: '',
			quantity: '',
		});
	};

	const onMoveBackToList = async (item: ShoppingListItem) => {
		if (!ensureCanWrite()) {
			return;
		}

		const previousItems = items;
		const nextItems = items.filter((entry) => entry.id !== item.id);
		setItems(nextItems);

		try {
			await moveItemBackToList(item.id);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('inventory.updateFailedTitle'), getActionErrorMessage(error));
		}
	};

	const onDelete = async (item: ShoppingListItem) => {
		if (!ensureCanWrite()) {
			return;
		}

		const previousItems = items;
		const nextItems = items.filter((entry) => entry.id !== item.id);
		setItems(nextItems);

		try {
			await deleteShoppingListItem(item.id);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('inventory.deleteFailedTitle'), getActionErrorMessage(error));
		}
	};

	const onSaveEdit = async () => {
		if (!ensureCanWrite()) {
			return;
		}

		if (!editingItemId) {
			return;
		}

		const price = Number(editForm.price);
		const quantity = Number(editForm.quantity);
		if (!editForm.productName.trim() || !editForm.category.trim()) {
			Alert.alert(t('inventory.validationTitle'), t('inventory.validationRequired'));
			return;
		}
		if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
			Alert.alert(t('inventory.validationTitle'), t('inventory.validationNumbers'));
			return;
		}

		const previousItems = items;
		const nextItems = items.map((item) =>
			item.id === editingItemId
				? {
						...item,
						productName: editForm.productName.trim(),
						category: editForm.category.trim(),
						expiryDate: editForm.expiryDate,
						price,
						quantity,
					}
				: item,
		);
		setItems(nextItems);

		try {
			await updateInventoryItem(editingItemId, {
				productName: editForm.productName.trim(),
				category: editForm.category.trim(),
				expiryDate: editForm.expiryDate,
				price,
				quantity,
			});
			await persistCache(nextItems);
			closeEdit();
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('inventory.updateFailedTitle'), getActionErrorMessage(error));
		}
	};

	if (loading) {
		return (
			<View style={styles.centered}>
				<Text style={styles.infoText}>{t('common.loading')}</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<View style={styles.summaryCard}>
				<Text style={styles.summaryTitle}>{t('inventory.totalValuePrefix')}</Text>
				<Text style={styles.summaryValue}>₪{totalValue(items).toFixed(2)}</Text>
			</View>

			{items.length === 0 ? (
				<View style={styles.centered}>
					<Text style={styles.infoText}>{t('inventory.empty')}</Text>
				</View>
			) : (
				<SectionList
					sections={sections}
					keyExtractor={(item) => item.id}
					refreshing={refreshing}
					onRefresh={onRefresh}
					stickySectionHeadersEnabled={false}
					contentContainerStyle={styles.listContainer}
					renderSectionHeader={({ section }) => (
						<Text style={styles.sectionHeader}>{section.title}</Text>
					)}
					renderItem={({ item }) => {
						const expiryStatus = getExpiryStatus(item.expiryDate);
						const tone = getExpiryTone(expiryStatus);

						return (
							<View style={styles.itemCard}>
								<View style={styles.rowBetween}>
									<Text style={styles.itemName}>{item.productName}</Text>
									<Text style={styles.itemPrice}>₪{(item.price * item.quantity).toFixed(2)}</Text>
								</View>

								<View style={[styles.expiryBadge, { backgroundColor: tone.background }]}>
									<Text style={[styles.expiryText, { color: tone.text }]}>
										{t(`inventory.expiry.${expiryStatus}`)}: {item.expiryDate}
									</Text>
								</View>

								<Text style={styles.metaText}>
									{t('inventory.detailsTemplate', {
										category: item.category,
										quantity: item.quantity,
									})}
								</Text>

								{editingItemId === item.id ? (
									<View style={styles.editCard}>
										<TextInput
											style={styles.input}
											placeholder={t('inventory.form.productName')}
											value={editForm.productName}
											onChangeText={(value) => setEditForm((p) => ({ ...p, productName: value }))}
											placeholderTextColor={colors.placeholder}
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
										<TextInput
											style={styles.input}
											placeholder={t('inventory.form.category')}
											value={editForm.category}
											onChangeText={(value) => setEditForm((p) => ({ ...p, category: value }))}
											placeholderTextColor={colors.placeholder}
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
										<TextInput
											style={styles.input}
											placeholder={t('inventory.form.expiryDate')}
											value={editForm.expiryDate}
											onChangeText={(value) => setEditForm((p) => ({ ...p, expiryDate: value }))}
											placeholderTextColor={colors.placeholder}
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
										<View style={styles.rowGap}>
											<TextInput
												style={[styles.input, styles.halfInput]}
												placeholder={t('inventory.form.price')}
												value={editForm.price}
												onChangeText={(value) => setEditForm((p) => ({ ...p, price: value }))}
												placeholderTextColor={colors.placeholder}
												keyboardType="decimal-pad"
												textAlign={i18n.language === 'he' ? 'right' : 'left'}
											/>
											<TextInput
												style={[styles.input, styles.halfInput]}
												placeholder={t('inventory.form.quantity')}
												value={editForm.quantity}
												onChangeText={(value) => setEditForm((p) => ({ ...p, quantity: value }))}
												placeholderTextColor={colors.placeholder}
												keyboardType="number-pad"
												textAlign={i18n.language === 'he' ? 'right' : 'left'}
											/>
										</View>
										<View style={[styles.rowGap, compactActions && styles.actionColumn]}>
											<AppButton
												title={t('inventory.saveEdit')}
												onPress={onSaveEdit}
												disabled={!canWrite}
												style={[styles.actionButton, compactActions && styles.actionButtonCompact]}
											/>
											<AppButton
												title={t('inventory.cancelEdit')}
												onPress={closeEdit}
												style={[styles.actionButton, compactActions && styles.actionButtonCompact, styles.cancelButton]}
											/>
										</View>
									</View>
								) : (
									<View style={[styles.rowGap, compactActions && styles.actionColumn]}>
										<AppButton
											title={t('inventory.moveToList')}
											onPress={() => onMoveBackToList(item)}
											disabled={!canWrite}
											style={[styles.actionButton, compactActions && styles.actionButtonCompact]}
										/>
										<AppButton
											title={t('inventory.edit')}
											onPress={() => openEdit(item)}
											disabled={!canWrite}
											style={[styles.actionButton, compactActions && styles.actionButtonCompact, styles.editButton]}
										/>
										<AppButton
											title={t('inventory.delete')}
											onPress={() => onDelete(item)}
											disabled={!canWrite}
											style={[styles.actionButton, compactActions && styles.actionButtonCompact, styles.deleteButton]}
										/>
									</View>
								)}
							</View>
						);
					}}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
		padding: spacing.md,
	},
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	infoText: {
		color: colors.textSecondary,
		fontSize: fontSizes.medium,
	},
	summaryCard: {
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		padding: spacing.md,
		marginBottom: spacing.md,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	summaryTitle: {
		color: colors.textSecondary,
		fontSize: fontSizes.small,
		fontWeight: '600',
	},
	summaryValue: {
		color: colors.text,
		fontSize: fontSizes.large,
		fontWeight: '700',
	},
	listContainer: {
		paddingBottom: spacing.xl,
	},
	sectionHeader: {
		fontWeight: '700',
		color: colors.text,
		marginBottom: spacing.sm,
		marginTop: spacing.sm,
	},
	itemCard: {
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		padding: spacing.md,
		marginBottom: spacing.sm,
	},
	rowBetween: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	itemName: {
		flex: 1,
		color: colors.text,
		fontSize: fontSizes.medium,
		fontWeight: '600',
		marginEnd: spacing.sm,
	},
	itemPrice: {
		color: colors.textSecondary,
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	expiryBadge: {
		marginTop: spacing.sm,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.sm,
		borderRadius: 999,
		alignSelf: 'flex-start',
	},
	expiryText: {
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	metaText: {
		marginTop: spacing.sm,
		color: colors.textSecondary,
		fontSize: fontSizes.small,
	},
	editCard: {
		marginTop: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: spacing.sm,
	},
	input: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: borderRadius,
		backgroundColor: colors.inputBackground,
		color: colors.text,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		marginBottom: spacing.sm,
		flex: 1,
	},
	rowGap: {
		marginTop: spacing.sm,
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	actionColumn: {
		flexDirection: 'column',
		alignItems: 'stretch',
		gap: spacing.xs,
	},
	halfInput: {
		flex: 1,
	},
	actionButton: {
		flex: 1,
		minWidth: 0,
		marginVertical: 0,
		paddingHorizontal: spacing.sm,
	},
	actionButtonCompact: {
		width: '100%',
	},
	editButton: {
		backgroundColor: colors.secondary,
	},
	cancelButton: {
		backgroundColor: colors.secondary,
	},
	deleteButton: {
		backgroundColor: colors.textSecondary,
	},
});
