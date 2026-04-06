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
import type { ShoppingListItem, SmartSuggestion, SupermarketPriceLookupResponse } from '../../../shared/types';
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
	lookupSupermarketPrice,
	markItemAsBought,
	replayPendingInventoryWrites,
	subscribeInventoryLiveUpdates,
	updateInventoryItem,
	type InventoryLiveEvent,
} from '../utils/inventoryApi';
import { addNetInfoListener } from '../utils/netInfoSafe';
import {
	SHOPPING_CATEGORIES,
	applyCategoryRulesToForm,
	getShoppingCategoryDefinition,
} from '../utils/shoppingCategories';
import { getUserContext } from '../utils/userContext';
import type { ShoppingPermissions } from '../utils/userContext';

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
	weight: string;
};

type CompletionEvent = {
	id: string;
	productName: string;
	completedAt: string;
};

type EditConflictState = {
	item: ShoppingListItem;
	detectedAt: string;
};

type RecentItemUpdate = {
	by: string;
	at: string;
};

type WriteRecoveryState = {
	message: string;
	retry: () => void;
};

const CACHE_KEY = 'shoppingListCache';
const RECENT_UPDATE_WINDOW_MS = 1000 * 60 * 5;

const defaultShoppingPermissions: ShoppingPermissions = {
	create: true,
	edit: true,
	delete: true,
	markDone: true,
	viewProgress: true,
};

const initialForm: NewItemForm = {
	productName: '',
	category: '',
	expiryDate: '',
	price: '0',
	quantity: '1',
	weight: '',
};

const initialEditForm: NewItemForm = {
	productName: '',
	category: '',
	expiryDate: '',
	price: '',
	quantity: '',
	weight: '',
};

const isValidDate = (value: string): boolean => {
	if (!value) {
		return false;
	}
	return !Number.isNaN(Date.parse(value));
};

const isValidOptionalDate = (value: string): boolean => !value || isValidDate(value);

const formatCategoryLabel = (
	value: string,
	t: (key: string, options?: Record<string, unknown>) => string,
): string => {
	const definition = getShoppingCategoryDefinition(value);
	if (!definition) {
		return value;
	}

	const translated = t(definition.labelKey);
	return translated === definition.labelKey ? definition.defaultLabel : translated;
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
	const [permissions, setPermissions] = React.useState<ShoppingPermissions>(defaultShoppingPermissions);
	const [blockedMessages, setBlockedMessages] = React.useState<Partial<Record<keyof ShoppingPermissions, string>>>({});
	const [barcodeInput, setBarcodeInput] = React.useState('');
	const [barcodeLoading, setBarcodeLoading] = React.useState(false);
	const [barcodeStatus, setBarcodeStatus] = React.useState<string | null>(null);
	const [pendingEnrichBarcode, setPendingEnrichBarcode] = React.useState<string | null>(null);
	const [lastSuggestions, setLastSuggestions] = React.useState<SmartSuggestion[]>([]);
	const [lookupNotFound, setLookupNotFound] = React.useState(false);
	const [marketPriceQuote, setMarketPriceQuote] = React.useState<SupermarketPriceLookupResponse | null>(null);
	const [completionFeed, setCompletionFeed] = React.useState<CompletionEvent[]>([]);
	const [editConflict, setEditConflict] = React.useState<EditConflictState | null>(null);
	const [recentUpdates, setRecentUpdates] = React.useState<Record<string, RecentItemUpdate>>({});
	const [writeRecovery, setWriteRecovery] = React.useState<WriteRecoveryState | null>(null);
	const [currentUserId, setCurrentUserId] = React.useState('');
	const selectedCategory = getShoppingCategoryDefinition(form.category) ?? getShoppingCategoryDefinition('other');
	const selectedEditCategory = getShoppingCategoryDefinition(editForm.category) ?? getShoppingCategoryDefinition('other');
	const shouldShowAddExpiry = selectedCategory?.expiryPolicy !== 'hidden';
	const isAddExpiryRequired = selectedCategory?.expiryPolicy === 'required';
	const shouldShowEditExpiry = selectedEditCategory?.expiryPolicy !== 'hidden';
	const isEditExpiryRequired = selectedEditCategory?.expiryPolicy === 'required';
	const addQuantityLabel = selectedCategory?.quantityMode === 'weight'
		? t('shoppingList.form.weight')
		: t('shoppingList.form.quantity');
	const editQuantityLabel = selectedEditCategory?.quantityMode === 'weight'
		? t('shoppingList.form.weight')
		: t('shoppingList.form.quantity');
	const isAddWeightCategory = selectedCategory?.quantityMode === 'weight';
	const isEditWeightCategory = selectedEditCategory?.quantityMode === 'weight';
	const scanTraceIdRef = React.useRef<string | null>(null);
	const scanStartedAtRef = React.useRef<number | null>(null);
	const lookupCompletedAtRef = React.useRef<number | null>(null);
	const formAtLookupRef = React.useRef<NewItemForm | null>(null);
	const editingItemIdRef = React.useRef<string | null>(null);
	const editFormRef = React.useRef<NewItemForm>(initialEditForm);

	React.useEffect(() => {
		editingItemIdRef.current = editingItemId;
	}, [editingItemId]);

	React.useEffect(() => {
		editFormRef.current = editForm;
	}, [editForm]);

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

	const addCompletionEvents = React.useCallback((entries: Array<{ id: string; productName: string }>) => {
		const now = new Date().toISOString();
		setCompletionFeed((previous) => {
			const mapped = entries.map((entry) => ({
				id: entry.id,
				productName: entry.productName,
				completedAt: now,
			}));
			const merged = [...mapped, ...previous.filter((item) => !entries.some((entry) => entry.id === item.id))];
			return merged.slice(0, 8);
		});
	}, []);

	const refreshWriteAccess = React.useCallback(async () => {
		const context = await getUserContext();
		setCurrentUserId(context.userId);

		const nextPermissions = { ...context.permissions };
		const messages: Partial<Record<keyof ShoppingPermissions, string>> = {};

		if (context.familyMembersCount > 1 && context.subscriptionTier !== 'Premium') {
			nextPermissions.create = false;
			nextPermissions.edit = false;
			nextPermissions.delete = false;
			nextPermissions.markDone = false;
			messages.create = t('permissions.premiumRequired');
			messages.edit = t('permissions.premiumRequired');
			messages.delete = t('permissions.premiumRequired');
			messages.markDone = t('permissions.premiumRequired');
		} else {
			if (!nextPermissions.create) messages.create = t('permissions.noCreatePermission');
			if (!nextPermissions.edit) messages.edit = t('permissions.noEditPermission');
			if (!nextPermissions.delete) messages.delete = t('permissions.noDeletePermission');
			if (!nextPermissions.markDone) messages.markDone = t('permissions.noMarkDonePermission');
		}

		setPermissions(nextPermissions);
		setBlockedMessages(messages);
	}, [t]);

	const ensurePermission = React.useCallback((action: keyof ShoppingPermissions) => {
		if (permissions[action]) {
			return true;
		}

		Alert.alert(
			t('shoppingList.updateFailedTitle'),
			blockedMessages[action] ?? t('permissions.viewerWriteBlocked'),
		);
		return false;
	}, [blockedMessages, permissions, t]);

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

	const getActionErrorMessage = React.useCallback(
		(error: unknown): string => {
			if (error instanceof ApiRequestError) {
				if (error.code === 'FORBIDDEN_ROLE') {
					return t('permissions.viewerWriteBlocked');
				}
				if (error.code === 'FORBIDDEN_PERMISSION') {
					return t('permissions.permissionDenied');
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

	const setRecentItemUpdate = React.useCallback((itemId: string, by: string, at?: string) => {
		if (!itemId || !by) {
			return;
		}

		setRecentUpdates((previous) => ({
			...previous,
			[itemId]: {
				by,
				at: at ?? new Date().toISOString(),
			},
		}));
	}, []);

	const clearWriteRecovery = React.useCallback(() => {
		setWriteRecovery(null);
	}, []);

	const showWriteRecovery = React.useCallback((error: unknown, retry: () => void) => {
		setWriteRecovery({
			message: getActionErrorMessage(error),
			retry,
		});
	}, [getActionErrorMessage]);

	const loadList = React.useCallback(async (options?: { silent?: boolean }) => {
		const silent = Boolean(options?.silent);
		try {
			const fetched = await fetchShoppingListItems();
			setItems(fetched);
			await persistCache(fetched);
		} catch (error) {
			const hydrated = await hydrateFromCache();
			if (hydrated) {
				return;
			}

			if (!silent) {
				Alert.alert(t('shoppingList.loadFailedTitle'), getActionErrorMessage(error));
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
				loadList({ silent: true }).catch(() => undefined);
			});

		return () => {
			isMounted = false;
		};
	}, [hydrateFromCache, loadList, refreshWriteAccess]);

	const handleLiveEvent = React.useCallback((event: InventoryLiveEvent) => {
		if (event.type === 'reload') {
			loadList({ silent: true }).catch(() => undefined);
			return;
		}
		if (event.type === 'delete') {
			setRecentUpdates((previous) => {
				if (!previous[event.id]) {
					return previous;
				}
				const next = { ...previous };
				delete next[event.id];
				return next;
			});
			setItems((prev) => prev.filter((i) => i.id !== event.id));
			return;
		}
		if (event.type === 'upsert') {
			setRecentItemUpdate(event.item.id, event.item.addedBy, new Date().toISOString());
			if (event.item.status !== 'In_List') {
				addCompletionEvents([{ id: event.item.id, productName: event.item.productName }]);
				// Item moved to At_Home — remove from list
				setItems((prev) => prev.filter((i) => i.id !== event.item.id));
				if (editingItemIdRef.current === event.item.id) {
					setEditConflict({ item: event.item, detectedAt: new Date().toISOString() });
				}
				return;
			}

			if (editingItemIdRef.current === event.item.id) {
				const formSnapshot = editFormRef.current;
				const price = Number(formSnapshot.price);
				const quantity = Number(formSnapshot.quantity);
				const hasConflict =
					formSnapshot.productName.trim() !== event.item.productName ||
					formSnapshot.category.trim() !== event.item.category ||
					formSnapshot.expiryDate !== event.item.expiryDate ||
					(Number.isFinite(price) ? price : event.item.price) !== event.item.price ||
					(Number.isFinite(quantity) ? quantity : event.item.quantity) !== event.item.quantity;

				if (hasConflict) {
					setEditConflict({ item: event.item, detectedAt: new Date().toISOString() });
				}
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
	}, [addCompletionEvents, loadList, setRecentItemUpdate]);

	const recentUpdateLabel = React.useCallback((item: ShoppingListItem): string | null => {
		const recent = recentUpdates[item.id];
		if (!recent) {
			return null;
		}

		const ts = Date.parse(recent.at);
		if (!Number.isFinite(ts)) {
			return null;
		}

		if (Date.now() - ts > RECENT_UPDATE_WINDOW_MS) {
			return null;
		}

		const who = recent.by === currentUserId ? t('shoppingList.updatedByYou') : recent.by;
		return t('shoppingList.updatedBy', { user: who });
	}, [currentUserId, recentUpdates, t]);

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
			weight: String(item.quantity),
		});
	};

	const closeEdit = () => {
		setEditingItemId(null);
		setEditForm(initialEditForm);
		setEditConflict(null);
	};

	const updateForm = (field: keyof NewItemForm, value: string) => {
		setForm((previous) => ({ ...previous, [field]: value }));
	};

	const selectAddCategory = React.useCallback((categoryId: string) => {
		setForm((previous) => applyCategoryRulesToForm(previous, categoryId));
	}, []);

	const resetAddCategory = React.useCallback(() => {
		setForm((previous) => ({ ...previous, category: '', expiryDate: '' }));
		setLastSuggestions([]);
		setLookupNotFound(false);
		setMarketPriceQuote(null);
		setPendingEnrichBarcode(null);
		formAtLookupRef.current = null;
	}, []);

	const onToggleAddForm = React.useCallback(() => {
		setShowAddForm((previous) => !previous);
		setLastSuggestions([]);
		setLookupNotFound(false);
		setMarketPriceQuote(null);
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
		setMarketPriceQuote(null);
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
			const resolvedCategory = previous.category || lookup.product?.category || '';
			const resolvedCategoryDefinition = getShoppingCategoryDefinition(resolvedCategory);
			const nextQuantity = suggestedQuantity !== undefined ? String(suggestedQuantity) : previous.quantity;
			const nextWeight =
				resolvedCategoryDefinition?.quantityMode === 'weight'
					? suggestedQuantity !== undefined
						? String(suggestedQuantity)
						: previous.weight
					: previous.weight;
			resolvedForm = {
				...previous,
				productName: lookup.product?.productName ?? previous.productName,
				category: resolvedCategory,
				price: suggestedPrice !== undefined ? String(suggestedPrice) : previous.price,
				quantity: nextQuantity,
				weight: nextWeight,
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

		if (!ensurePermission('create')) {
			return false;
		}

		const price = Number(nextForm.price);
		const categoryDefinition = getShoppingCategoryDefinition(nextForm.category);
		const amountValue = categoryDefinition?.quantityMode === 'weight' ? nextForm.weight : nextForm.quantity;
		const quantity = Number(amountValue);

		if (!nextForm.productName.trim() || !nextForm.category.trim()) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationRequired'));
			return false;
		}

		if (categoryDefinition?.expiryPolicy === 'required' && !isValidDate(nextForm.expiryDate)) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationExpiryRequired'));
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
				expiryDate: categoryDefinition?.expiryPolicy === 'hidden' ? '' : nextForm.expiryDate,
				status: 'In_List',
				price,
				quantity,
			});

			const nextItems = [created, ...items];
			setItems(nextItems);
			setRecentItemUpdate(created.id, currentUserId || created.addedBy, new Date().toISOString());
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
			showWriteRecovery(error, () => {
				saveFormToShoppingList(nextForm, options).catch(() => undefined);
			});
			return false;
		} finally {
			setSubmitting(false);
		}
	}, [currentUserId, ensurePermission, getActionErrorMessage, items, lastSuggestions, pendingEnrichBarcode, persistCache, resetAddFlow, setRecentItemUpdate, showWriteRecovery, submitting, t]);

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
			// Non-blocking supermarket price lookup — enriches price field if no smart suggestion
			lookupSupermarketPrice(barcode).then((priceResp) => {
				if (priceResp?.found && priceResp.bestPrice) {
					setMarketPriceQuote(priceResp);
					setForm((prev) => ({
						...prev,
						price: prev.price === '0' ? String(priceResp.bestPrice!.price) : prev.price,
					}));
				}
			}).catch(() => undefined);
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
		if (!ensurePermission('edit')) {
			return;
		}

		if (!editingItemId) {
			return;
		}

		const price = Number(editForm.price);
		const categoryDefinition = getShoppingCategoryDefinition(editForm.category);
		const amountValue = categoryDefinition?.quantityMode === 'weight' ? editForm.weight : editForm.quantity;
		const quantity = Number(amountValue);

		if (!editForm.productName.trim() || !editForm.category.trim()) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationRequired'));
			return;
		}

		if (categoryDefinition?.expiryPolicy === 'required' && !isValidDate(editForm.expiryDate)) {
			Alert.alert(t('shoppingList.validationTitle'), t('shoppingList.validationExpiryRequired'));
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
						expiryDate: categoryDefinition?.expiryPolicy === 'hidden' ? '' : editForm.expiryDate,
						price,
						quantity,
					}
				: item,
		);
		setItems(nextItems);
		setRecentItemUpdate(editingItemId, currentUserId || 'unknown', new Date().toISOString());

		try {
			await updateInventoryItem(editingItemId, {
				productName: editForm.productName.trim(),
				category: editForm.category.trim(),
				expiryDate: categoryDefinition?.expiryPolicy === 'hidden' ? '' : editForm.expiryDate,
				price,
				quantity,
			});
			await persistCache(nextItems);
			closeEdit();
		} catch (error) {
			setItems(previousItems);
			if (error instanceof ApiRequestError && error.code === 'NOT_FOUND') {
				setEditConflict({
					item: {
						id: editingItemId,
						productName: editForm.productName,
						category: editForm.category,
						expiryDate: editForm.expiryDate,
						status: 'In_List',
						price,
						quantity,
						addedBy: '',
					},
					detectedAt: new Date().toISOString(),
				});
			}
			if (!(error instanceof ApiRequestError && error.code === 'NOT_FOUND')) {
				showWriteRecovery(error, () => {
					onSaveEdit().catch(() => undefined);
				});
			}
		}
	};

	const onResolveConflictRefresh = React.useCallback(() => {
		setEditConflict(null);
		loadList({ silent: true }).catch(() => undefined);
		closeEdit();
	}, [loadList]);

	const onResolveConflictUseRemote = React.useCallback(() => {
		if (!editConflict) {
			return;
		}
		setEditingItemId(editConflict.item.id);
		setEditForm({
			productName: editConflict.item.productName,
			category: editConflict.item.category,
			expiryDate: editConflict.item.expiryDate,
			price: String(editConflict.item.price),
			quantity: String(editConflict.item.quantity),
		});
		setEditConflict(null);
	}, [editConflict]);

	const onMarkBought = async (item: ShoppingListItem) => {
		if (!ensurePermission('markDone')) {
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
			addCompletionEvents([{ id: item.id, productName: item.productName }]);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			showWriteRecovery(error, () => {
				onMarkBought(item).catch(() => undefined);
			});
		}
	};

	const onDeleteItem = async (item: ShoppingListItem) => {
		if (!ensurePermission('delete')) {
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
			showWriteRecovery(error, () => {
				onDeleteItem(item).catch(() => undefined);
			});
		}
	};

	const onBatchBuy = async () => {
		if (!ensurePermission('markDone')) {
			return;
		}

		if (selectedItemIds.length === 0) {
			return;
		}

		const previousItems = items;
		const selectedSet = new Set(selectedItemIds);
		const completedItems = items
			.filter((item) => selectedSet.has(item.id))
			.map((item) => ({ id: item.id, productName: item.productName }));
		const nextItems = items.filter((item) => !selectedSet.has(item.id));
		setItems(nextItems);
		setSelectedIds({});
		setBatchLoading(true);

		try {
			await batchBuyShoppingListItems(selectedItemIds);
			addCompletionEvents(completedItems);
			await persistCache(nextItems);
		} catch (error) {
			setItems(previousItems);
			showWriteRecovery(error, () => {
				onBatchBuy().catch(() => undefined);
			});
		} finally {
			setBatchLoading(false);
		}
	};

	const onBatchDelete = async () => {
		if (!ensurePermission('delete')) {
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
			showWriteRecovery(error, () => {
				onBatchDelete().catch(() => undefined);
			});
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
						disabled={!permissions.create}
						style={[styles.topButton, compactTopBar ? styles.topButtonCompact : null]}
					/>
				</View>
			</View>

			{permissions.viewProgress && completionFeed.length > 0 ? (
				<View style={styles.progressCard}>
					<Text style={styles.progressTitle}>{t('shoppingList.progressTitle')}</Text>
					{completionFeed.map((entry) => (
						<Text key={entry.id} style={styles.progressItemText}>
							{entry.productName}
						</Text>
					))}
				</View>
			) : null}

			{editConflict ? (
				<View style={styles.conflictCard}>
					<Text style={styles.conflictTitle}>{t('shoppingList.conflictTitle')}</Text>
					<Text style={styles.conflictBody}>{t('shoppingList.conflictBody')}</Text>
					<View style={styles.conflictActionsRow}>
						<AppButton title={t('shoppingList.conflictUseRemote')} onPress={onResolveConflictUseRemote} style={styles.conflictActionBtn} />
						<AppButton title={t('shoppingList.conflictRefresh')} onPress={onResolveConflictRefresh} style={[styles.conflictActionBtn, styles.conflictRefreshBtn]} />
					</View>
				</View>
			) : null}

			{writeRecovery ? (
				<View style={styles.recoveryCard}>
					<Text style={styles.recoveryTitle}>{t('shoppingList.recoveryTitle')}</Text>
					<Text style={styles.recoveryBody}>{writeRecovery.message}</Text>
					<View style={styles.conflictActionsRow}>
						<AppButton
							title={t('shoppingList.recoveryRetry')}
							onPress={() => {
								const retry = writeRecovery.retry;
								clearWriteRecovery();
								retry();
							}}
							style={styles.conflictActionBtn}
						/>
						<AppButton
							title={t('shoppingList.recoveryDismiss')}
							onPress={clearWriteRecovery}
							style={[styles.conflictActionBtn, styles.conflictRefreshBtn]}
						/>
					</View>
				</View>
			) : null}

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
							{!form.category ? (
								<View>
									<Text style={[styles.productTitle, compactAddForm ? styles.sectionTitleCompact : null]}>{t('shoppingList.categoryStepTitle')}</Text>
									<Text style={styles.categoryStepBody}>{t('shoppingList.categoryStepBody')}</Text>
									<View style={styles.categoryGrid}>
										{SHOPPING_CATEGORIES.map((category) => (
											<Pressable
												key={category.id}
												onPress={() => selectAddCategory(category.id)}
												style={styles.categoryCard}
											>
												<Text style={styles.categoryCardTitle}>{t(category.labelKey)}</Text>
												<Text style={styles.categoryCardMeta}>
													{category.quantityMode === 'weight'
														? t('shoppingList.categoryMeta.weight')
														: t('shoppingList.categoryMeta.count')}
													{' • '}
													{category.expiryPolicy === 'required'
														? t('shoppingList.categoryMeta.expiryRequired')
														: category.expiryPolicy === 'hidden'
														? t('shoppingList.categoryMeta.noExpiry')
														: t('shoppingList.categoryMeta.expiryOptional')}
												</Text>
											</Pressable>
										))}
									</View>
								</View>
							) : (
							<View>
								<Text style={[styles.productTitle, compactAddForm ? styles.sectionTitleCompact : null]}>{t('shoppingList.productTitle')}</Text>
								<View style={styles.selectedCategoryCard}>
									<View style={styles.selectedCategoryCopy}>
										<Text style={styles.selectedCategoryLabel}>{t('shoppingList.selectedCategory')}</Text>
										<Text style={styles.selectedCategoryValue}>{formatCategoryLabel(form.category, t)}</Text>
										<Text style={styles.selectedCategoryHint}>
											{selectedCategory?.expiryPolicy === 'required'
												? t('shoppingList.categoryMeta.expiryRequired')
												: selectedCategory?.expiryPolicy === 'hidden'
												? t('shoppingList.categoryMeta.noExpiry')
												: t('shoppingList.categoryMeta.expiryOptional')}
										</Text>
									</View>
									<Pressable onPress={resetAddCategory} style={styles.changeCategoryButton}>
										<Text style={styles.changeCategoryButtonText}>{t('shoppingList.changeCategory')}</Text>
									</Pressable>
								</View>
								<TextInput
									style={[styles.input, compactAddForm ? styles.inputCompact : null]}
									placeholder={t('shoppingList.form.productName')}
									value={form.productName}
									onChangeText={(value) => updateForm('productName', value)}
									placeholderTextColor={colors.placeholder}
									textAlign={i18n.language === 'he' ? 'right' : 'left'}
								/>
								{shouldShowAddExpiry ? (
									<TextInput
										style={[styles.input, compactAddForm ? styles.inputCompact : null]}
										placeholder={isAddExpiryRequired ? t('shoppingList.form.expiryDateRequired') : t('shoppingList.form.expiryDate')}
										value={form.expiryDate}
										onChangeText={(value) => updateForm('expiryDate', value)}
										placeholderTextColor={colors.placeholder}
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
								) : null}
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
										placeholder={addQuantityLabel}
										value={isAddWeightCategory ? form.weight : form.quantity}
										onChangeText={(value) => updateForm(isAddWeightCategory ? 'weight' : 'quantity', value)}
										placeholderTextColor={colors.placeholder}
										keyboardType={isAddWeightCategory ? 'decimal-pad' : 'number-pad'}
										textAlign={i18n.language === 'he' ? 'right' : 'left'}
									/>
								</View>
								<AppButton
									title={submitting ? t('shoppingList.saving') : t('shoppingList.save')}
									onPress={onSubmitNewItem}
									loading={submitting}
									disabled={!permissions.create}
									style={[styles.saveButton, compactAddForm ? styles.formButtonCompact : null]}
								/>
							</View>
							)}
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
								{marketPriceQuote?.found && marketPriceQuote.bestPrice ? (
									<View style={styles.marketPriceCard}>
										<Text style={styles.marketPriceTitle}>{t('shoppingList.bestPriceTitle')}</Text>
										<Text style={styles.marketPriceValue}>
											{t('shoppingList.bestPriceAt', {
												price: marketPriceQuote.bestPrice.price.toFixed(2),
												chain: marketPriceQuote.bestPrice.chainName,
											})}
										</Text>
										{marketPriceQuote.bestPrice.promoText ? (
											<Text style={styles.marketPricePromo}>
												{t('shoppingList.bestPricePromo', { text: marketPriceQuote.bestPrice.promoText })}
											</Text>
										) : null}
									</View>
								) : null}
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
						<Pressable onPress={permissions.markDone || permissions.delete ? onSelectAll : undefined} style={styles.batchSelectButton}>
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
							disabled={!permissions.markDone || batchLoading || selectedCount === 0}
							style={styles.batchButton}
						/>
						<AppButton
							title={t('shoppingList.batchDelete')}
							onPress={onBatchDelete}
							loading={batchLoading}
							disabled={!permissions.delete || batchLoading || selectedCount === 0}
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

							{recentUpdateLabel(item) ? (
								<Text style={styles.updatedByText}>{recentUpdateLabel(item)}</Text>
							) : null}

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
									<View style={styles.selectedCategoryCard}>
										<View style={styles.selectedCategoryCopy}>
											<Text style={styles.selectedCategoryLabel}>{t('shoppingList.selectedCategory')}</Text>
											<Text style={styles.selectedCategoryValue}>{formatCategoryLabel(editForm.category, t)}</Text>
											<Text style={styles.selectedCategoryHint}>
												{selectedEditCategory?.expiryPolicy === 'required'
													? t('shoppingList.categoryMeta.expiryRequired')
													: selectedEditCategory?.expiryPolicy === 'hidden'
													? t('shoppingList.categoryMeta.noExpiry')
													: t('shoppingList.categoryMeta.expiryOptional')}
											</Text>
										</View>
									</View>
									{shouldShowEditExpiry ? (
										<TextInput
											style={styles.input}
											placeholder={isEditExpiryRequired ? t('shoppingList.form.expiryDateRequired') : t('shoppingList.form.expiryDate')}
											value={editForm.expiryDate}
											onChangeText={(value) => setEditForm((previous) => ({ ...previous, expiryDate: value }))}
											placeholderTextColor={colors.placeholder}
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
									) : null}
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
											placeholder={editQuantityLabel}
											value={isEditWeightCategory ? editForm.weight : editForm.quantity}
											onChangeText={(value) =>
												setEditForm((previous) => ({
													...previous,
													[isEditWeightCategory ? 'weight' : 'quantity']: value,
												}))}
											placeholderTextColor={colors.placeholder}
											keyboardType={isEditWeightCategory ? 'decimal-pad' : 'number-pad'}
											textAlign={i18n.language === 'he' ? 'right' : 'left'}
										/>
									</View>
									<View style={styles.rowGap}>
										<AppButton title={t('shoppingList.saveEdit')} onPress={onSaveEdit} disabled={!permissions.edit} style={styles.actionButton} />
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
									<Pressable onPress={permissions.edit ? () => openEdit(item) : undefined}>
										<Text style={styles.linkAction}>{t('shoppingList.edit')}</Text>
									</Pressable>
									<Pressable onPress={permissions.markDone ? () => onMarkBought(item) : undefined}>
										<Text style={styles.linkAction}>{t('shoppingList.markBought')}</Text>
									</Pressable>
									<Pressable onPress={permissions.delete ? () => onDeleteItem(item) : undefined}>
										<Text style={[styles.linkAction, styles.deleteAction]}>{t('shoppingList.delete')}</Text>
									</Pressable>
								</View>
							)}

							{detailsOpen[item.id] ? (
								<Text style={styles.detailsText}>
									{t('shoppingList.detailsTemplate', {
										category: item.category,
										price: item.price.toFixed(2),
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
	progressCard: {
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: '#A7E8C2',
		backgroundColor: '#EFFFF6',
		padding: spacing.sm,
		marginBottom: spacing.md,
	},
	progressTitle: {
		color: '#0A6A3D',
		fontWeight: '700',
		fontSize: fontSizes.small,
		marginBottom: spacing.xs,
	},
	progressItemText: {
		color: '#0A6A3D',
		fontSize: 12,
		textDecorationLine: 'line-through',
		marginBottom: 2,
	},
	conflictCard: {
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: '#F2B24D',
		backgroundColor: '#FFF6E8',
		padding: spacing.sm,
		marginBottom: spacing.md,
	},
	conflictTitle: {
		color: '#8A5200',
		fontSize: fontSizes.small,
		fontWeight: '700',
		marginBottom: 2,
	},
	conflictBody: {
		color: '#7A5A28',
		fontSize: fontSizes.small,
	},
	conflictActionsRow: {
		marginTop: spacing.sm,
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	conflictActionBtn: {
		flex: 1,
		minWidth: 0,
		marginVertical: 0,
	},
	conflictRefreshBtn: {
		backgroundColor: colors.secondary,
	},
	recoveryCard: {
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: '#B58AF2',
		backgroundColor: '#F5EEFF',
		padding: spacing.sm,
		marginBottom: spacing.md,
	},
	recoveryTitle: {
		color: '#4B2B86',
		fontSize: fontSizes.small,
		fontWeight: '700',
		marginBottom: 2,
	},
	recoveryBody: {
		color: '#5F4785',
		fontSize: fontSizes.small,
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
	categoryStepBody: {
		color: colors.textSecondary,
		fontSize: fontSizes.small,
		marginBottom: spacing.md,
		lineHeight: 20,
	},
	categoryGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: spacing.sm,
	},
	categoryCard: {
		width: '48%',
		minHeight: 92,
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: '#FBFAFF',
		padding: spacing.sm,
		justifyContent: 'space-between',
	},
	categoryCardTitle: {
		color: colors.text,
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	categoryCardMeta: {
		color: colors.textSecondary,
		fontSize: 11,
		lineHeight: 16,
	},
	selectedCategoryCard: {
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: '#FBFAFF',
		padding: spacing.sm,
		marginBottom: spacing.sm,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: spacing.sm,
	},
	selectedCategoryCopy: {
		flex: 1,
	},
	selectedCategoryLabel: {
		color: colors.textSecondary,
		fontSize: 12,
		fontWeight: '600',
	},
	selectedCategoryValue: {
		color: colors.text,
		fontSize: fontSizes.medium,
		fontWeight: '700',
		marginTop: 2,
	},
	selectedCategoryHint: {
		color: colors.textSecondary,
		fontSize: 11,
		marginTop: 4,
	},
	changeCategoryButton: {
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: borderRadius,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: colors.card,
	},
	changeCategoryButtonText: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: '700',
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
	marketPriceCard: {
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.success,
		borderRadius: borderRadius,
		padding: spacing.sm,
		marginTop: spacing.xs,
		marginBottom: spacing.xs,
	},
	marketPriceTitle: {
		color: colors.textSecondary,
		fontWeight: '700',
		fontSize: fontSizes.small,
		marginBottom: 2,
	},
	marketPriceValue: {
		color: colors.success,
		fontSize: fontSizes.small,
		fontWeight: '700',
	},
	marketPricePromo: {
		color: colors.textSecondary,
		fontSize: fontSizes.small - 1,
		fontStyle: 'italic',
		marginTop: 2,
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
		marginEnd: spacing.sm,
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
	updatedByText: {
		marginTop: spacing.xs,
		color: colors.textSecondary,
		fontSize: 11,
		fontStyle: 'italic',
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
