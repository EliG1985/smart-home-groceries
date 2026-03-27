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
	View,
} from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import type { ShoppingListItem } from '../../../shared/types';
import {
	ApiRequestError,
	batchBuyShoppingListItems,
	batchDeleteShoppingListItems,
	createShoppingListItem,
	deleteShoppingListItem,
	fetchShoppingListItems,
	markItemAsBought,
	replayPendingInventoryWrites,
	subscribeInventoryLiveUpdates,
	updateInventoryItem,
	type InventoryLiveEvent,
} from '../utils/inventoryApi';
import { addNetInfoListener } from '../utils/netInfoSafe';
import { getUserContext } from '../utils/userContext';

type GroupedSection = {
	title: string;
	data: ShoppingListItem[];
};

type NewItemForm = {
	productName: string;
	category: string;
	expiryDate: string;
	price: string;
	quantity: string;
};

const CACHE_KEY = 'shoppingListCache';

const initialForm: NewItemForm = {
	productName: '',
	category: '',
	expiryDate: '',
	price: '0',
	quantity: '1',
};

const initialEditForm: NewItemForm = {
	productName: '',
	category: '',
	expiryDate: '',
	price: '',
	quantity: '',
};

const isValidDate = (value: string): boolean => {
	if (!value) {
		return false;
	}
	return !Number.isNaN(Date.parse(value));
};

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

const totalPrice = (items: ShoppingListItem[]): number =>
	items.reduce((acc, item) => acc + item.price * item.quantity, 0);

export default function ShoppingListScreen() {
	const { t, i18n } = useTranslation();
	const [items, setItems] = React.useState<ShoppingListItem[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [refreshing, setRefreshing] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const [batchLoading, setBatchLoading] = React.useState(false);
	const [showAddForm, setShowAddForm] = React.useState(false);
	const [form, setForm] = React.useState<NewItemForm>(initialForm);
	const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
	const [editForm, setEditForm] = React.useState<NewItemForm>(initialEditForm);
	const [detailsOpen, setDetailsOpen] = React.useState<Record<string, boolean>>({});
	const [selectedIds, setSelectedIds] = React.useState<Record<string, boolean>>({});
	const [canWrite, setCanWrite] = React.useState(true);
	const [writeBlockedMessage, setWriteBlockedMessage] = React.useState<string | null>(null);

	const sections = React.useMemo(() => groupByCategory(items), [items]);
	const selectedCount = React.useMemo(
		() => Object.values(selectedIds).filter(Boolean).length,
		[selectedIds],
	);

	const selectedItemIds = React.useMemo(
		() => Object.entries(selectedIds)
			.filter(([, selected]) => selected)
			.map(([id]) => id),
		[selectedIds],
	);

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
			t('shoppingList.updateFailedTitle'),
			writeBlockedMessage ?? t('permissions.viewerWriteBlocked'),
		);
		return false;
	}, [canWrite, t, writeBlockedMessage]);

	const persistCache = React.useCallback(async (nextItems: ShoppingListItem[]) => {
		await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextItems));
	}, []);

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

	const loadList = React.useCallback(async (options?: { silent?: boolean }) => {
		const silent = Boolean(options?.silent);
		try {
			const fetched = await fetchShoppingListItems();
			setItems(fetched);
			await persistCache(fetched);
		} catch (error) {
			const cached = await AsyncStorage.getItem(CACHE_KEY);
			if (cached) {
				try {
					const parsed = JSON.parse(cached) as ShoppingListItem[];
					setItems(parsed);
					if (!silent) {
						Alert.alert(
							t('shoppingList.offlineTitle'),
							t('shoppingList.offlineBody'),
						);
					}
					return;
				} catch {
					// Ignore cache parse errors and show request failure below.
				}
			}

			if (!silent) {
				Alert.alert(t('shoppingList.loadFailedTitle'), getActionErrorMessage(error));
			}
		}
	}, [getActionErrorMessage, persistCache, t]);

	React.useEffect(() => {
		refreshWriteAccess().catch(() => undefined);
		loadList()
			.finally(() => setLoading(false));
	}, [loadList, refreshWriteAccess]);

	const handleLiveEvent = React.useCallback((event: InventoryLiveEvent) => {
		if (event.type === 'reload') {
			loadList({ silent: true }).catch(() => undefined);
			return;
		}
		if (event.type === 'delete') {
			setItems((prev) => prev.filter((i) => i.id !== event.id));
			return;
		}
		if (event.type === 'upsert') {
			if (event.item.status !== 'In_List') {
				// Item moved to At_Home — remove from list
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
	}, [loadList]);

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
						loadList({ silent: true }).catch(() => undefined);
					}
				}).catch(() => undefined);
				refreshWriteAccess().catch(() => undefined);
				resubscribe();
			}
		});
		return () => sub.remove();
	}, [loadList, refreshWriteAccess, resubscribe]);

	React.useEffect(() => {
		const unsubscribe = addNetInfoListener((state) => {
			if (state.isConnected && state.isInternetReachable !== false) {
				replayPendingInventoryWrites().then((count) => {
					if (count > 0) {
						loadList({ silent: true }).catch(() => undefined);
					}
				}).catch(() => undefined);
			}
		});

		return unsubscribe;
	}, [loadList]);

	const onRefresh = async () => {
		setRefreshing(true);
		await loadList();
		setRefreshing(false);
	};

	const onToggleSelect = (itemId: string) => {
		setSelectedIds((previous) => ({
			...previous,
			[itemId]: !previous[itemId],
		}));
	};

	const onSelectAll = () => {
		if (selectedCount === items.length) {
			setSelectedIds({});
			return;
		}

		const next: Record<string, boolean> = {};
		for (const item of items) {
			next[item.id] = true;
		}
		setSelectedIds(next);
	};

	const onToggleDetails = (itemId: string) => {
		setDetailsOpen((previous) => ({
			...previous,
			[itemId]: !previous[itemId],
		}));
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
		setEditForm(initialEditForm);
	};

	const updateForm = (field: keyof NewItemForm, value: string) => {
		setForm((previous) => ({ ...previous, [field]: value }));
	};

	const onSubmitNewItem = async () => {
		if (!ensureCanWrite()) {
			return;
		}

		const price = Number(form.price);
		const quantity = Number(form.quantity);

		if (!form.productName.trim() || !form.category.trim() || !isValidDate(form.expiryDate)) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationRequired'));
			return;
		}

		if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationNumbers'));
			return;
		}

		setSubmitting(true);
		try {
			const created = await createShoppingListItem({
				productName: form.productName.trim(),
				category: form.category.trim(),
				expiryDate: form.expiryDate,
				status: 'In_List',
				price,
				quantity,
			});

			const nextItems = [created, ...items];
			setItems(nextItems);
			await persistCache(nextItems);
			setForm(initialForm);
			setShowAddForm(false);
		} catch (error) {
			Alert.alert(t('shoppingList.createFailedTitle'), getActionErrorMessage(error));
		} finally {
			setSubmitting(false);
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

		if (!editForm.productName.trim() || !editForm.category.trim() || !isValidDate(editForm.expiryDate)) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationRequired'));
			return;
		}

		if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationNumbers'));
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
			Alert.alert(t('shoppingList.updateFailedTitle'), getActionErrorMessage(error));
		}
	};

	const onMarkBought = async (item: ShoppingListItem) => {
		if (!ensureCanWrite()) {
			return;
		}

		const previousItems = items;
		const nextItems = items.filter((entry) => entry.id !== item.id);
		setItems(nextItems);
		setSelectedIds((previous) => {
			const copy = { ...previous };
			delete copy[item.id];
			return copy;
		});

		try {
			await markItemAsBought(item.id);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('shoppingList.updateFailedTitle'), getActionErrorMessage(error));
		}
	};

	const onDeleteItem = async (item: ShoppingListItem) => {
		if (!ensureCanWrite()) {
			return;
		}

		const previousItems = items;
		const nextItems = items.filter((entry) => entry.id !== item.id);
		setItems(nextItems);
		setSelectedIds((previous) => {
			const copy = { ...previous };
			delete copy[item.id];
			return copy;
		});

		try {
			await deleteShoppingListItem(item.id);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('shoppingList.deleteFailedTitle'), getActionErrorMessage(error));
		}
	};

	const onBatchBuy = async () => {
		if (!ensureCanWrite()) {
			return;
		}

		if (selectedItemIds.length === 0) {
			return;
		}

		const previousItems = items;
		const selectedSet = new Set(selectedItemIds);
		const nextItems = items.filter((item) => !selectedSet.has(item.id));
		setItems(nextItems);
		setSelectedIds({});
		setBatchLoading(true);

		try {
			await batchBuyShoppingListItems(selectedItemIds);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('shoppingList.batchFailedTitle'), getActionErrorMessage(error));
		} finally {
			setBatchLoading(false);
		}
	};

	const onBatchDelete = async () => {
		if (!ensureCanWrite()) {
			return;
		}

		if (selectedItemIds.length === 0) {
			return;
		}

		const previousItems = items;
		const selectedSet = new Set(selectedItemIds);
		const nextItems = items.filter((item) => !selectedSet.has(item.id));
		setItems(nextItems);
		setSelectedIds({});
		setBatchLoading(true);

		try {
			await batchDeleteShoppingListItems(selectedItemIds);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			Alert.alert(t('shoppingList.batchFailedTitle'), getActionErrorMessage(error));
		} finally {
			setBatchLoading(false);
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
			<View style={styles.topBar}>
				<Text style={styles.totalText}>
					{t('shoppingList.totalPrefix')}: ₪{totalPrice(items).toFixed(2)}
				</Text>
				<AppButton
					title={showAddForm ? t('shoppingList.closeAdd') : t('shoppingList.openAdd')}
					onPress={() => setShowAddForm((previous) => !previous)}
					disabled={!canWrite}
					style={styles.topButton}
				/>
			</View>

			{showAddForm ? (
				<View style={styles.formCard}>
					<TextInput
						style={styles.input}
						placeholder={t('shoppingList.form.productName')}
						value={form.productName}
						onChangeText={(value) => updateForm('productName', value)}
						placeholderTextColor={colors.placeholder}
						textAlign={i18n.language === 'he' ? 'right' : 'left'}
					/>
					<TextInput
						style={styles.input}
						placeholder={t('shoppingList.form.category')}
						value={form.category}
						onChangeText={(value) => updateForm('category', value)}
						placeholderTextColor={colors.placeholder}
						textAlign={i18n.language === 'he' ? 'right' : 'left'}
					/>
					<TextInput
						style={styles.input}
						placeholder={t('shoppingList.form.expiryDate')}
						value={form.expiryDate}
						onChangeText={(value) => updateForm('expiryDate', value)}
						placeholderTextColor={colors.placeholder}
						textAlign={i18n.language === 'he' ? 'right' : 'left'}
					/>
					<TextInput
						style={styles.input}
						placeholder={t('shoppingList.form.price')}
						value={form.price}
						onChangeText={(value) => updateForm('price', value)}
						placeholderTextColor={colors.placeholder}
						keyboardType="decimal-pad"
						textAlign={i18n.language === 'he' ? 'right' : 'left'}
					/>
					<TextInput
						style={styles.input}
						placeholder={t('shoppingList.form.quantity')}
						value={form.quantity}
						onChangeText={(value) => updateForm('quantity', value)}
						placeholderTextColor={colors.placeholder}
						keyboardType="number-pad"
						textAlign={i18n.language === 'he' ? 'right' : 'left'}
					/>
					<AppButton
						title={submitting ? t('shoppingList.saving') : t('shoppingList.save')}
						onPress={onSubmitNewItem}
						loading={submitting}
						disabled={!canWrite}
						style={styles.saveButton}
					/>
				</View>
			) : null}

			{items.length > 0 ? (
				<View style={styles.batchBar}>
					<Pressable onPress={canWrite ? onSelectAll : undefined} style={styles.batchSelectButton}>
						<Text style={styles.batchSelectText}>
							{selectedCount === items.length
								? t('shoppingList.clearSelection')
								: t('shoppingList.selectAll')}
						</Text>
					</Pressable>
					<Text style={styles.selectedCountText}>
						{t('shoppingList.selectedPrefix')}: {selectedCount}
					</Text>
					<AppButton
						title={t('shoppingList.batchBuy')}
						onPress={onBatchBuy}
						loading={batchLoading}
						disabled={!canWrite || batchLoading || selectedCount === 0}
						style={styles.batchButton}
					/>
					<AppButton
						title={t('shoppingList.batchDelete')}
						onPress={onBatchDelete}
						loading={batchLoading}
						disabled={!canWrite || batchLoading || selectedCount === 0}
						style={[styles.batchButton, styles.batchDeleteButton]}
					/>
				</View>
			) : null}

			{items.length === 0 ? (
				<View style={styles.centered}>
					<Text style={styles.infoText}>{t('shoppingList.empty')}</Text>
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
					renderItem={({ item }) => (
						<View style={styles.itemCard}>
							<View style={styles.itemTopRow}>
								<Pressable onPress={() => onToggleSelect(item.id)} style={styles.checkbox}>
									<Text style={styles.checkboxText}>{selectedIds[item.id] ? 'x' : ''}</Text>
								</Pressable>
								<Text style={styles.itemName}>{item.productName}</Text>
								<Text style={styles.itemPrice}>₪{(item.price * item.quantity).toFixed(2)}</Text>
							</View>

							{editingItemId === item.id ? (
								<View style={styles.editCard}>
									<TextInput
										style={styles.input}
										placeholder={t('shoppingList.form.productName')}
										value={editForm.productName}
										onChangeText={(value) => setEditForm((previous) => ({ ...previous, productName: value }))}
										placeholderTextColor={colors.placeholder}
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
									<TextInput
										style={styles.input}
										placeholder={t('shoppingList.form.category')}
										value={editForm.category}
										onChangeText={(value) => setEditForm((previous) => ({ ...previous, category: value }))}
										placeholderTextColor={colors.placeholder}
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
									<TextInput
										style={styles.input}
										placeholder={t('shoppingList.form.expiryDate')}
										value={editForm.expiryDate}
										onChangeText={(value) => setEditForm((previous) => ({ ...previous, expiryDate: value }))}
										placeholderTextColor={colors.placeholder}
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
									<View style={styles.rowGap}>
										<TextInput
											style={[styles.input, styles.halfInput]}
											placeholder={t('shoppingList.form.price')}
											value={editForm.price}
											onChangeText={(value) => setEditForm((previous) => ({ ...previous, price: value }))}
											placeholderTextColor={colors.placeholder}
											keyboardType="decimal-pad"
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
										<TextInput
											style={[styles.input, styles.halfInput]}
											placeholder={t('shoppingList.form.quantity')}
											value={editForm.quantity}
											onChangeText={(value) => setEditForm((previous) => ({ ...previous, quantity: value }))}
											placeholderTextColor={colors.placeholder}
											keyboardType="number-pad"
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
									</View>
									<View style={styles.rowGap}>
										<AppButton title={t('shoppingList.saveEdit')} onPress={onSaveEdit} disabled={!canWrite} style={styles.actionButton} />
										<AppButton
											title={t('shoppingList.cancelEdit')}
											onPress={closeEdit}
											style={[styles.actionButton, styles.cancelButton]}
										/>
									</View>
								</View>
							) : (
								<View style={styles.itemActions}>
									<Pressable onPress={() => onToggleDetails(item.id)}>
										<Text style={styles.linkAction}>{t('shoppingList.details')}</Text>
									</Pressable>
									<Pressable onPress={canWrite ? () => openEdit(item) : undefined}>
										<Text style={styles.linkAction}>{t('shoppingList.edit')}</Text>
									</Pressable>
									<Pressable onPress={canWrite ? () => onMarkBought(item) : undefined}>
										<Text style={styles.linkAction}>{t('shoppingList.markBought')}</Text>
									</Pressable>
									<Pressable onPress={canWrite ? () => onDeleteItem(item) : undefined}>
										<Text style={[styles.linkAction, styles.deleteAction]}>{t('shoppingList.delete')}</Text>
									</Pressable>
								</View>
							)}

							{detailsOpen[item.id] ? (
								<Text style={styles.detailsText}>
									{t('shoppingList.detailsTemplate', {
										category: item.category,
										quantity: item.quantity,
										expiryDate: item.expiryDate,
									})}
								</Text>
							) : null}
						</View>
					)}
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
	topBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: spacing.md,
		gap: spacing.sm,
	},
	totalText: {
		color: colors.text,
		fontWeight: '700',
		fontSize: fontSizes.medium,
	},
	topButton: {
		minWidth: 120,
	},
	formCard: {
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		padding: spacing.md,
		marginBottom: spacing.md,
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
	},
	editCard: {
		marginTop: spacing.sm,
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: spacing.sm,
	},
	rowGap: {
		marginTop: spacing.sm,
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	halfInput: {
		flex: 1,
	},
	actionButton: {
		flex: 1,
		minWidth: 90,
	},
	cancelButton: {
		backgroundColor: colors.secondary,
	},
	saveButton: {
		marginTop: spacing.sm,
	},
	batchBar: {
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		padding: spacing.sm,
		marginBottom: spacing.md,
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	batchSelectButton: {
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: colors.border,
	},
	batchSelectText: {
		color: colors.text,
		fontSize: fontSizes.small,
	},
	selectedCountText: {
		color: colors.textSecondary,
		flex: 1,
		fontSize: fontSizes.small,
	},
	batchButton: {
		paddingHorizontal: spacing.sm,
		minWidth: 88,
	},
	batchDeleteButton: {
		backgroundColor: colors.textSecondary,
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
	itemTopRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	checkbox: {
		width: 20,
		height: 20,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: spacing.sm,
	},
	checkboxText: {
		color: colors.text,
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	itemName: {
		flex: 1,
		color: colors.text,
		fontSize: fontSizes.medium,
		fontWeight: '600',
	},
	itemPrice: {
		color: colors.textSecondary,
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	itemActions: {
		marginTop: spacing.sm,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	linkAction: {
		color: colors.primary,
		fontSize: fontSizes.small,
		fontWeight: '600',
	},
	deleteAction: {
		color: colors.error,
	},
	detailsText: {
		marginTop: spacing.sm,
		color: colors.textSecondary,
		fontSize: fontSizes.small,
	},
});
