import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
	AppState,
	Alert,
	Pressable,
	ScrollView,
	SectionList,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import type { ShoppingListItem, SmartSuggestion } from '../../../shared/types';
import { trackEvent, newTraceId } from '../utils/telemetry';
import {
	ApiRequestError,
	batchBuyShoppingListItems,
	batchDeleteShoppingListItems,
	createShoppingListItem,
	deleteShoppingListItem,
	enrichBarcodeMapping,
	fetchShoppingListItems,
	lookupBarcode,
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

const isValidOptionalDate = (value: string): boolean => !value || isValidDate(value);

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

const normalizeBarcode = (value: string): string => value.replace(/\D/g, '').trim();

const suggestionToNumber = (
	suggestions: SmartSuggestion[],
	field: 'price' | 'quantity',
): number | undefined => {
	const match = suggestions.find((entry) => entry.field === field);
	if (!match) {
		return undefined;
	}
	if (typeof match.value === 'number' && Number.isFinite(match.value)) {
		return match.value;
	}
	if (typeof match.value === 'string' && match.value.trim() !== '') {
		const parsed = Number(match.value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
};

export default function ShoppingListScreen() {
	const { t, i18n } = useTranslation();
	const navigation = useNavigation<any>();
	const route = useRoute<any>();
	const { width, height } = useWindowDimensions();
	const compactTopBar = width < 380;
	const compactAddForm = width < 420 || height < 860;
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
	const [barcodeInput, setBarcodeInput] = React.useState('');
	const [barcodeLoading, setBarcodeLoading] = React.useState(false);
	const [barcodeStatus, setBarcodeStatus] = React.useState<string | null>(null);
	const [pendingEnrichBarcode, setPendingEnrichBarcode] = React.useState<string | null>(null);
	const [lastSuggestions, setLastSuggestions] = React.useState<SmartSuggestion[]>([]);
	const [lookupNotFound, setLookupNotFound] = React.useState(false);
	const scanTraceIdRef = React.useRef<string | null>(null);
	const scanStartedAtRef = React.useRef<number | null>(null);
	const lookupCompletedAtRef = React.useRef<number | null>(null);
	const formAtLookupRef = React.useRef<NewItemForm | null>(null);

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

	const onToggleAddForm = React.useCallback(() => {
		setShowAddForm((previous) => !previous);
		setLastSuggestions([]);
		setLookupNotFound(false);
		setBarcodeInput('');
		setBarcodeStatus(null);
		formAtLookupRef.current = null;
	}, []);

	const resetAddFlow = React.useCallback((closeForm = true) => {
		setForm(initialForm);
		setBarcodeInput('');
		setBarcodeStatus(null);
		setPendingEnrichBarcode(null);
		setLastSuggestions([]);
		setLookupNotFound(false);
		scanTraceIdRef.current = null;
		scanStartedAtRef.current = null;
		lookupCompletedAtRef.current = null;
		formAtLookupRef.current = null;
		if (closeForm) {
			setShowAddForm(false);
		}
	}, []);

	const applyLookupToForm = React.useCallback((lookup: {
		found: boolean;
		product?: { productName: string; category?: string };
		suggestions: SmartSuggestion[];
		source: string;
	}) => {
		const suggestedPrice = suggestionToNumber(lookup.suggestions, 'price');
		const suggestedQuantity = suggestionToNumber(lookup.suggestions, 'quantity');
		let resolvedForm = initialForm;

		setForm((previous) => {
			resolvedForm = {
				...previous,
				productName: lookup.product?.productName ?? previous.productName,
				category: lookup.product?.category ?? previous.category,
				price: suggestedPrice !== undefined ? String(suggestedPrice) : previous.price,
				quantity: suggestedQuantity !== undefined ? String(suggestedQuantity) : previous.quantity,
			};
			formAtLookupRef.current = resolvedForm;
			return resolvedForm;
		});

		setLastSuggestions(lookup.suggestions);
		setLookupNotFound(!lookup.found);
		setBarcodeStatus(
			lookup.found
				? t('shoppingList.barcodeLookupFound', { source: lookup.source })
				: t('shoppingList.barcodeLookupMiss'),
		);

		return resolvedForm;
	}, [t]);

	const saveFormToShoppingList = React.useCallback(async (
		nextForm: NewItemForm,
		options?: { closeForm?: boolean; enrichBarcode?: string | null },
	) => {
		if (submitting) {
			return false;
		}

		if (!ensureCanWrite()) {
			return false;
		}

		const price = Number(nextForm.price);
		const quantity = Number(nextForm.quantity);

		if (!nextForm.productName.trim() || !nextForm.category.trim()) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationRequired'));
			return false;
		}

		if (!isValidOptionalDate(nextForm.expiryDate)) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationExpiry'));
			return false;
		}

		if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationNumbers'));
			return false;
		}

		setSubmitting(true);
		const traceId = scanTraceIdRef.current ?? undefined;
		const lookupForm = formAtLookupRef.current;
		if (lastSuggestions.length > 0 && lookupForm) {
			const accepted: string[] = [];
			const edited: string[] = [];
			for (const s of lastSuggestions) {
				const key = s.field === 'price' ? 'price' : s.field === 'quantity' ? 'quantity' : 'category';
				if (nextForm[key] === lookupForm[key]) {
					accepted.push(key);
				} else {
					edited.push(key);
				}
			}
			if (accepted.length > 0) {
				trackEvent('suggestion_accepted', traceId, { fields: accepted });
			}
			if (edited.length > 0) {
				trackEvent('suggestion_edited', traceId, { fields: edited });
			}
		}

		try {
			const created = await createShoppingListItem({
				productName: nextForm.productName.trim(),
				category: nextForm.category.trim(),
				expiryDate: nextForm.expiryDate,
				status: 'In_List',
				price,
				quantity,
			});

			const nextItems = [created, ...items];
			setItems(nextItems);
			await persistCache(nextItems);

			const barcodeToEnrich = options?.enrichBarcode ?? pendingEnrichBarcode;
			if (barcodeToEnrich) {
				try {
					await enrichBarcodeMapping({
						barcode: barcodeToEnrich,
						productName: nextForm.productName.trim(),
						category: nextForm.category.trim(),
						typicalPrice: price,
						defaultQuantity: quantity,
					});
				} catch {
					// Do not fail item creation when enrichment is unavailable.
				}
			}

			const saveNow = Date.now();
			const lookupTs = lookupCompletedAtRef.current;
			const scanTs = scanStartedAtRef.current;
			trackEvent('save_success', traceId, {
				scan_to_lookup_ms: (lookupTs && scanTs) ? lookupTs - scanTs : null,
				lookup_to_save_ms: lookupTs ? saveNow - lookupTs : null,
			});
			resetAddFlow(options?.closeForm ?? true);
			return true;
		} catch (error) {
			trackEvent('save_failure', traceId, { error: getActionErrorMessage(error) });
			Alert.alert(t('shoppingList.createFailedTitle'), getActionErrorMessage(error));
			return false;
		} finally {
			setSubmitting(false);
		}
	}, [ensureCanWrite, getActionErrorMessage, items, lastSuggestions, pendingEnrichBarcode, persistCache, resetAddFlow, submitting, t]);

	const runLookupByBarcode = React.useCallback(async (
		value: string,
		options?: { autoAddOnFound?: boolean },
	) => {
		const barcode = normalizeBarcode(value);
		if (!barcode || barcode.length < 8 || barcode.length > 14) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.barcodeValidation'));
			return;
		}

		const traceId = newTraceId();
		scanTraceIdRef.current = traceId;
		scanStartedAtRef.current = Date.now();
		setBarcodeInput(barcode);
		setBarcodeLoading(true);
		setBarcodeStatus(null);
		setLastSuggestions([]);
		setLookupNotFound(false);
		trackEvent('lookup_started', traceId, { barcode_len: barcode.length });
		try {
			const response = await lookupBarcode({
				barcode,
				locale: i18n.language,
				destination: 'In_List',
			});

			lookupCompletedAtRef.current = Date.now();
			const scanToLookupMs = lookupCompletedAtRef.current - (scanStartedAtRef.current ?? lookupCompletedAtRef.current);
			trackEvent(
				response.found ? 'lookup_hit' : 'lookup_miss',
				traceId,
				{ source: response.source, scan_to_lookup_ms: scanToLookupMs },
			);
			const nextForm = applyLookupToForm(response);
			setPendingEnrichBarcode(barcode);
			if (options?.autoAddOnFound && response.found) {
				await saveFormToShoppingList(nextForm, { enrichBarcode: barcode });
			}
		} catch (error) {
			setBarcodeStatus(t('shoppingList.barcodeLookupFailed'));
			trackEvent('lookup_failed', traceId, { error: String(error) });
			Alert.alert(t('shoppingList.loadFailedTitle'), getActionErrorMessage(error));
		} finally {
			setBarcodeLoading(false);
		}
	}, [applyLookupToForm, getActionErrorMessage, i18n.language, saveFormToShoppingList, t]);

	const onLookupBarcode = React.useCallback(() => {
		runLookupByBarcode(barcodeInput).catch(() => undefined);
	}, [barcodeInput, runLookupByBarcode]);

	React.useEffect(() => {
		const scannedAt = route.params?.scannedAt;
		const prefillBarcode = normalizeBarcode(route.params?.prefillBarcode ?? '');
		if (!scannedAt || !prefillBarcode) {
			return;
		}

		trackEvent('scan_handoff_received', undefined, {
			barcode_len: prefillBarcode.length,
			scanned_at: scannedAt,
		});

		setShowAddForm(true);
		runLookupByBarcode(prefillBarcode, { autoAddOnFound: true }).catch(() => undefined);
		navigation.setParams({ prefillBarcode: undefined, scannedAt: undefined });
	}, [navigation, route.params?.prefillBarcode, route.params?.scannedAt, runLookupByBarcode]);

	const onSubmitNewItem = async () => {
		await saveFormToShoppingList(form);
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
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationRequired'));
			return;
		}

		if (!isValidOptionalDate(editForm.expiryDate)) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationExpiry'));
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
			<View style={[styles.topBar, compactTopBar ? styles.topBarCompact : null]}>
				<Text style={[styles.totalText, compactTopBar ? styles.totalTextCompact : null]}>
					{t('shoppingList.totalPrefix')}: ₪{totalPrice(items).toFixed(2)}
				</Text>
				<View style={[styles.topActions, compactTopBar ? styles.topActionsCompact : null]}>
					<AppButton
						title={showAddForm ? t('shoppingList.closeAdd') : t('shoppingList.openAdd')}
						onPress={onToggleAddForm}
						disabled={!canWrite}
						style={[styles.topButton, compactTopBar ? styles.topButtonCompact : null]}
					/>
				</View>
			</View>

			{showAddForm ? (
				<View style={styles.formPanel}>
					<ScrollView
						style={styles.formCard}
						contentContainerStyle={[
							styles.formCardContent,
							compactAddForm ? styles.formCardContentCompact : null,
						]}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.formLayout}>
							<View>
								<Text style={[styles.productTitle, compactAddForm ? styles.sectionTitleCompact : null]}>{t('shoppingList.productTitle')}</Text>
								<TextInput
									style={[styles.input, compactAddForm ? styles.inputCompact : null]}
									placeholder={t('shoppingList.form.productName')}
									value={form.productName}
									onChangeText={(value) => updateForm('productName', value)}
									placeholderTextColor={colors.placeholder}
									textAlign={i18n.language === 'he' ? 'right' : 'left'}
								/>
								<TextInput
									style={[styles.input, compactAddForm ? styles.inputCompact : null]}
									placeholder={t('shoppingList.form.category')}
									value={form.category}
									onChangeText={(value) => updateForm('category', value)}
									placeholderTextColor={colors.placeholder}
									textAlign={i18n.language === 'he' ? 'right' : 'left'}
								/>
								<TextInput
									style={[styles.input, compactAddForm ? styles.inputCompact : null]}
									placeholder={t('shoppingList.form.expiryDate')}
									value={form.expiryDate}
									onChangeText={(value) => updateForm('expiryDate', value)}
									placeholderTextColor={colors.placeholder}
									textAlign={i18n.language === 'he' ? 'right' : 'left'}
								/>
								<View style={[styles.rowGap, compactAddForm ? styles.compactRowGap : null]}>
									<TextInput
										style={[styles.input, styles.halfInput, compactAddForm ? styles.inputCompact : null]}
										placeholder={t('shoppingList.form.price')}
										value={form.price}
										onChangeText={(value) => updateForm('price', value)}
										placeholderTextColor={colors.placeholder}
										keyboardType="decimal-pad"
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
									<TextInput
										style={[styles.input, styles.halfInput, compactAddForm ? styles.inputCompact : null]}
										placeholder={t('shoppingList.form.quantity')}
										value={form.quantity}
										onChangeText={(value) => updateForm('quantity', value)}
										placeholderTextColor={colors.placeholder}
										keyboardType="number-pad"
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
								</View>
								<AppButton
									title={submitting ? t('shoppingList.saving') : t('shoppingList.save')}
									onPress={onSubmitNewItem}
									loading={submitting}
									disabled={!canWrite}
									style={[styles.saveButton, compactAddForm ? styles.formButtonCompact : null]}
								/>
							</View>
							<View style={styles.formMiddleSpacer} />
							<View style={styles.barcodeSection}>
								<View style={[styles.sectionDivider, compactAddForm ? styles.sectionDividerCompact : null]} />
								<Text style={[styles.barcodeTitle, compactAddForm ? styles.sectionTitleCompact : null]}>{t('shoppingList.barcodeTitle')}</Text>
								<View style={[styles.rowGap, compactAddForm ? styles.compactRowGap : null]}>
									<TextInput
										style={[styles.input, styles.barcodeInput, compactAddForm ? styles.inputCompact : null]}
										placeholder={t('shoppingList.barcodePlaceholder')}
										value={barcodeInput}
										onChangeText={setBarcodeInput}
										placeholderTextColor={colors.placeholder}
										keyboardType="number-pad"
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
									<AppButton
										title={barcodeLoading ? t('shoppingList.barcodeLookupLoading') : t('shoppingList.barcodeLookup')}
										onPress={onLookupBarcode}
										loading={barcodeLoading}
										style={[styles.barcodeLookupButton, compactAddForm ? styles.compactInlineButton : null]}
									/>
								</View>
								{barcodeStatus ? <Text style={styles.barcodeStatus}>{barcodeStatus}</Text> : null}
								{lastSuggestions.length > 0 ? (
									<View style={styles.chipsContainer}>
										<Text style={styles.chipsLabel}>{t('shoppingList.suggestionsTitle')}</Text>
										<View style={styles.chipsRow}>
											{lastSuggestions.map((s) => (
												<View
													key={s.field}
													style={[
														styles.chip,
														s.confidence === 'high'
															? styles.chipHigh
															: s.confidence === 'medium'
															? styles.chipMedium
															: styles.chipLow,
													]}
												>
													<Text style={styles.chipFieldText}>
														{s.field === 'category'
															? t('shoppingList.suggestionField.category')
															: s.field === 'price'
															? t('shoppingList.suggestionField.price')
															: t('shoppingList.suggestionField.quantity')}
													</Text>
													<Text style={styles.chipValueText}>{String(s.value)}</Text>
													<Text style={styles.chipConfText}>
														{s.confidence === 'high'
															? t('shoppingList.confidence.high')
															: s.confidence === 'medium'
															? t('shoppingList.confidence.medium')
															: t('shoppingList.confidence.low')}
													</Text>
												</View>
											))}
										</View>
										<Text style={styles.chipsHint}>{t('shoppingList.suggestionAcceptHint')}</Text>
									</View>
								) : null}
								{lookupNotFound ? (
									<View style={styles.unknownBarcodeCard}>
										<Text style={styles.unknownBarcodeTitle}>{t('shoppingList.unknownBarcodeTitle')}</Text>
										<Text style={styles.unknownBarcodeBody}>{t('shoppingList.unknownBarcodeBody')}</Text>
									</View>
								) : null}
								<AppButton
									title={t('shoppingList.openScanner')}
									onPress={() => navigation.navigate('BarcodeScanner')}
									style={[styles.scannerButtonInForm, compactAddForm ? styles.formButtonCompact : null]}
								/>
							</View>
						</View>
					</ScrollView>
				</View>
			) : (
				<>
			{items.length > 0 ? (
				<View style={styles.batchBar}>
					<View style={styles.batchMetaRow}>
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
					</View>
					<View style={styles.batchActionsRow}>
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
				</>
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
	topBarCompact: {
		flexDirection: 'column',
		alignItems: 'stretch',
		justifyContent: 'flex-start',
	},
	totalText: {
		color: colors.text,
		fontWeight: '700',
		fontSize: fontSizes.medium,
	},
	totalTextCompact: {
		textAlign: 'center',
	},
	topActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	topActionsCompact: {
		justifyContent: 'center',
	},
	topButton: {
		minWidth: 110,
	},
	topButtonCompact: {
		width: '100%',
		minWidth: 0,
		marginVertical: 0,
	},
	barcodeTitle: {
		color: colors.text,
		fontSize: fontSizes.small,
		fontWeight: '700',
		marginBottom: spacing.sm,
	},
	productTitle: {
		color: colors.text,
		fontSize: fontSizes.medium,
		fontWeight: '700',
		marginBottom: spacing.sm,
	},
	sectionTitleCompact: {
		fontSize: fontSizes.small,
		marginBottom: spacing.xs,
	},
	sectionDivider: {
		height: 1,
		backgroundColor: colors.border,
		marginVertical: spacing.md,
	},
	sectionDividerCompact: {
		marginVertical: spacing.sm,
	},
	formCard: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		marginBottom: 0,
	},
	formPanel: {
		flex: 1,
	},
	formCardContent: {
		padding: spacing.md,
		paddingBottom: spacing.xl,
		flexGrow: 1,
	},
	formCardContentCompact: {
		paddingTop: spacing.sm,
		paddingBottom: spacing.md,
	},
	formLayout: {
		flex: 1,
		justifyContent: 'flex-start',
		minHeight: '100%',
	},
	formMiddleSpacer: {
		flexGrow: 1,
		minHeight: spacing.md,
		maxHeight: spacing.xl,
	},
	barcodeSection: {
		marginTop: 0,
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
	inputCompact: {
		paddingVertical: spacing.xs + 2,
		marginBottom: spacing.xs,
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
	compactRowGap: {
		marginTop: spacing.xs,
		gap: spacing.xs,
	},
	barcodeInput: {
		flex: 1,
		marginBottom: 0,
	},
	barcodeLookupButton: {
		minWidth: 120,
		marginVertical: 0,
	},
	compactInlineButton: {
		minWidth: 96,
		paddingHorizontal: spacing.sm,
		marginVertical: 0,
	},
	barcodeStatus: {
		marginTop: spacing.sm,
		marginBottom: spacing.sm,
		color: colors.textSecondary,
		fontSize: fontSizes.small,
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
		marginBottom: spacing.sm,
	},
	formButtonCompact: {
		marginTop: spacing.xs,
		marginVertical: 0,
		paddingHorizontal: spacing.md,
	},
	batchBar: {
		backgroundColor: colors.card,
		borderRadius: borderRadius,
		padding: spacing.sm,
		marginBottom: spacing.md,
		alignItems: 'stretch',
		gap: spacing.sm,
	},
	batchMetaRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	batchActionsRow: {
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
		flex: 1,
		minWidth: 0,
		paddingHorizontal: spacing.sm,
		marginVertical: 0,
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
		justifyContent: 'flex-start',
		flexWrap: 'wrap',
		columnGap: spacing.md,
		rowGap: spacing.xs,
	},
	linkAction: {
		color: colors.primary,
		fontSize: fontSizes.small,
		fontWeight: '600',
		paddingVertical: 2,
	},
	deleteAction: {
		color: colors.error,
	},
	detailsText: {
		marginTop: spacing.sm,
		color: colors.textSecondary,
		fontSize: fontSizes.small,
	},
	scannerButtonInForm: {
		marginTop: spacing.md,
		marginBottom: spacing.md,
	},
	chipsContainer: {
		marginTop: spacing.sm,
		marginBottom: spacing.sm,
	},
	chipsLabel: {
		color: colors.textSecondary,
		fontSize: fontSizes.small,
		fontWeight: '700',
		marginBottom: spacing.xs,
	},
	chipsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: spacing.xs,
	},
	chip: {
		borderRadius: borderRadius,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		alignItems: 'center',
		marginBottom: spacing.xs,
	},
	chipHigh: {
		backgroundColor: colors.success,
	},
	chipMedium: {
		backgroundColor: '#FFA500',
	},
	chipLow: {
		backgroundColor: colors.border,
	},
	chipFieldText: {
		fontSize: 11,
		fontWeight: '700',
		color: colors.text,
	},
	chipValueText: {
		fontSize: fontSizes.small,
		fontWeight: '600',
		color: colors.text,
	},
	chipConfText: {
		fontSize: 11,
		color: colors.textSecondary,
	},
	chipsHint: {
		fontSize: fontSizes.small,
		color: colors.textSecondary,
		marginTop: spacing.xs,
		fontStyle: 'italic',
	},
	unknownBarcodeCard: {
		backgroundColor: '#FFF3E0',
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: '#FFA500',
		padding: spacing.sm,
		marginBottom: spacing.sm,
	},
	unknownBarcodeTitle: {
		color: '#E65100',
		fontSize: fontSizes.small,
		fontWeight: '700',
		marginBottom: 2,
	},
	unknownBarcodeBody: {
		color: '#6D4B00',
		fontSize: fontSizes.small,
	},
});
