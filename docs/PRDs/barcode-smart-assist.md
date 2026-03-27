# Barcode & Smart Assistance

## Product Goal
Deliver a fast, reliable barcode-driven add flow that helps users identify products, prefill inventory details, and receive smart category and price suggestions with minimal typing.

## Success Metrics
- Add item via barcode in under 8 seconds for known products.
- Barcode lookup success rate above 85% for supported markets.
- At least 60% of barcode-added items accepted with no manual field edits.
- Crash-free rate above 99.5% in barcode flow screens.

## Scope
- In scope: barcode scanning, product lookup, suggestion engine, inventory prefilling, confidence display, fallback manual flow, caching, analytics, and permissions.
- Out of scope: full OCR receipts, advanced nutrition scoring, and dynamic promotions engine.

## User Stories
- As a user, I can scan a barcode and instantly see product details.
- As a user, I can accept or edit suggested name, category, and price before saving.
- As a user, I can still add an item when barcode lookup fails.
- As a user, I can quickly rescan multiple products in one session.
- As a user, I can trust suggestions by seeing confidence and source.

## Full Feature List

### 1. Barcode Scan Experience
- Live camera scanner with centered guide frame.
- Torch toggle for low-light conditions.
- Haptic feedback on successful scan.
- Duplicate-scan debounce in the same session.
- Manual barcode input fallback.
- Permission states: granted, denied, blocked with recovery prompt.

### 2. Product Lookup and Data Fusion
- Primary lookup: Open Food Facts by barcode.
- Secondary fallback: backend-local cache lookup by barcode.
- Source normalization to a single internal product schema.
- Locale-aware title selection with fallback order.
- Unit normalization for package size and quantity.
- Conflict resolution policy when fields disagree across sources.

### 3. Smart Assistance Engine
- Suggested category based on product taxonomy and historical user selections.
- Suggested typical price range by category, store, and user history.
- Suggested quantity default from prior adds.
- Confidence score per suggested field.
- Explainability tags like source and rule used.
- Continuous learning from accepted or edited suggestions.

### 4. Add/Edit Sheet
- Prefilled form fields: product name, category, price, quantity, expiry placeholder.
- Inline validation with field-level errors.
- Required and optional labels using existing app pattern.
- One-tap save to shopping list or at-home inventory.
- Toggle to remember preference for default destination.

### 5. Unknown Barcode Flow
- Show no-match state with clear call to action.
- Continue as manual add while keeping scanned barcode attached.
- Option to submit product details for future enrichment.
- Store local mapping for future scans by same user/family.

### 6. Multi-Scan Session Mode
- Keep scanner open after save for rapid batch capture.
- Bottom queue of scanned items pending confirmation.
- Skip, edit, and save-all actions.
- Session summary with success and failed lookups.

### 7. Offline and Resilience
- If network fails, allow manual add path immediately.
- Queue pending lookup enrichment when online resumes.
- Cache recent barcode lookups on device with TTL.
- Retry policy with capped exponential backoff.

### 8. Permissions and Roles
- Viewer role can scan and preview but cannot commit writes.
- Editor and owner can save and update mappings.
- Premium gate if smart pricing features require paid tier.

### 9. Localization and Accessibility
- Full EN and HE copy for all states and errors.
- RTL layout verification for scanner overlay and add sheet.
- Screen reader labels for camera controls and actions.
- Color contrast compliant confidence indicators.

### 10. Analytics and Observability
- Events: scan_started, scan_success, lookup_hit, lookup_miss, suggestion_accepted, suggestion_edited, save_success, save_failure.
- Timing metrics: scan_to_lookup_ms and lookup_to_save_ms.
- Error taxonomy for camera, permission, lookup, parse, and save failures.
- Correlation id from scan to final save for debugging.

## Data Contracts

### Mobile Domain Model
- `ScannedProductCandidate`
- `LookupSourceResult`
- `SmartSuggestion`
- `SuggestionConfidence`
- `BarcodeSessionItem`

### Backend Contracts
- `POST /api/barcode/lookup` with barcode and locale.
- `POST /api/barcode/enrich` to save user-confirmed mapping.
- `GET /api/barcode/cache/:barcode` optional fast path.
- Existing inventory write routes remain the source of truth for final item creation.

### Suggested Request Shape
- barcode: string
- locale: string
- familyId: string
- context: destination list type and optional store id

### Suggested Response Shape
- product: normalized candidate fields
- suggestions: category and price suggestions with confidence
- source: open_food_facts or local_cache or learned_mapping
- traceId: string

## Smart Suggestion Rules
- Category suggestion priority:
	1. Family-specific learned mapping by barcode
	2. Open Food Facts taxonomy mapping
	3. Most frequent family category for similar product terms
	4. Global fallback category
- Price suggestion priority:
	1. Recent family purchases for same barcode
	2. Median by category and store
	3. Global median by category

## Error Handling
- Camera denied: show permissions CTA with settings deep link.
- Lookup timeout: continue with manual add and background retry.
- Invalid barcode: inline warning and re-scan guidance.
- Save failure: optimistic rollback and retry option.
- Parsing mismatch: fallback to manual field entry.

## Security and Privacy
- Do not log raw sensitive user metadata in analytics.
- Hash or truncate identifiers where possible.
- Rate-limit lookup endpoints.
- Validate barcode format server-side.

## Implementation Checklist

### Phase A: Contracts and Schema
- [x] Add shared barcode/suggestion types in shared package.
- [x] Define backend request and response validators.
- [x] Add local cache model and TTL policy.

### Phase B: Backend Lookup Service
- [x] Implement `/api/barcode/lookup` route with Open Food Facts integration.
- [x] Add response normalization layer.
- [x] Implement source fallback and timeout handling.
- [x] Add `/api/barcode/enrich` learned mapping endpoint.

### Phase C: Mobile Scanner Module
- [x] Build scanner screen with permission handling and torch toggle.
- [x] Add barcode debounce and duplicate suppression.
- [x] Wire scan result to lookup pipeline.

### Phase D: Smart Assistance UI
- [x] Build prefilled add sheet with confidence display.
- [x] Add accept, edit, and save actions.
- [x] Add unknown barcode fallback flow.

### Phase E: Multi-Scan and Offline
- [ ] Implement session queue for rapid scan mode.
- [ ] Add offline fallback and retry queue.
- [ ] Persist recent barcode cache in AsyncStorage.

### Phase F: Permissions and Localization
- [x] Apply role-based write guard behavior.
- [x] Add EN and HE keys for all new states.
- [ ] Verify RTL rendering for scanner and add sheet.

### Phase G: Telemetry and QA
- [x] Add analytics events and performance timers.
- [ ] Add backend and mobile test coverage for happy and failure paths.
- [ ] Run end-to-end test on physical Android device.

## Test Matrix
- Valid barcode with full metadata.
- Valid barcode with partial metadata.
- Unknown barcode.
- No network during lookup.
- Permission denied then granted.
- Viewer role trying to save.
- Hebrew RTL UI checks.

## Acceptance Criteria
- User can scan, confirm, and save a known product in under 8 seconds on median device.
- Unknown barcode path always allows manual add.
- No startup or runtime crashes introduced by barcode feature.
- `Network request failed` in this flow appears only when backend is unavailable and shows actionable fallback.

## Open Questions
- Do we need a second product API fallback besides Open Food Facts?
- Should price suggestions be premium-only or free with daily cap?
- Should user-submitted enrichments be family-private or global moderated?
