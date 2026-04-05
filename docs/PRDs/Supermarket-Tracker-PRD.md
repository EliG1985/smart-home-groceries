# Supermarket Tracker — PRD

Date: 2026-03-27
Owner: Mobile + Backend
Status: In Progress — Core map and nearby flow implemented; advanced tracker features planned

Legend: Implemented = live in current codebase, Planned = scoped and not yet shipped

## 1. Overview
A feature-rich module for real-time geolocation, supermarket search, and user-centric shopping assistance.

## 2. UI Improvements
- Implemented: Map integration using react-native-maps (MapView) and expo-location, including user location, radius overlay, and supermarket markers.
- Implemented: Adjustable radius slider.
- Implemented: Location accuracy indicator.
- Implemented: Manual refresh for location/search results.
- Implemented: Loading and error states.
- Implemented: Nearby results list with distance, address, and sorting.
- Planned: Search history.
- Implemented: Permission handling for denied location access.

## 3. Additional Features
- Planned: Geofencing.
- Planned: Search history.
- Planned: Store details modal.
- Planned: Directions.
- Planned: Favorite stores.
- Planned: Deals and coupons.
- Planned: Push notifications.
- Planned: Multi-POI search.
- Planned: Accessibility enhancements.
- Planned: Gamification.
- Planned: Custom map styles.

## 4. Implementation Notes
- Implemented: Expo Location/browser geolocation for real-time tracking.
- Implemented: MapView visualization.
- Implemented: Backend API usage for supermarket search.
- Implemented: Radius input validation (0–10,000 km).
- Implemented: Permission and error-state handling.

## 5. Future Enhancements
- Expand POI types and search filters.
- Add gamification (badges, rewards for visits).
- Integrate with store loyalty programs.

---

This PRD tracks all planned and suggested features for the Supermarket Tracker module. Update as new features are added or implemented.