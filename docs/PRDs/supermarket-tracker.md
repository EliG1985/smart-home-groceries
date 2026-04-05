# Supermarket Tracker

Date: 2026-03-27
Owner: Mobile + Backend
Status: In Progress — Core geolocation and nearby map flow implemented

## Overview
Map-based module for real-time geolocation and supermarket search.

## Integrations
- Expo Location
- react-native-maps (MapView)
- Backend API: /api/reports/supermarket-insights, /api/store/chains, /api/store/prices/by-barcode

## Logic
- Map with user location, radius, and markers
- Adjustable radius slider
- Loading/error states, permission handling
- Results list with distance and sorting
- Planned: geofencing, search history, directions, and favorites
