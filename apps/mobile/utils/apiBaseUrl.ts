import { NativeModules, Platform } from 'react-native';

const EXPLICIT_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const DEFAULT_PORT = '4000';
const DEV_LAN_FALLBACK_HOSTS = (process.env.EXPO_PUBLIC_API_LAN_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

type AnyRecord = Record<string, unknown>;

const isLoopbackHost = (host: string | null | undefined): boolean =>
  host === 'localhost' || host === '127.0.0.1';

const getNested = (root: unknown, path: string[]): unknown => {
  let current = root as unknown;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in (current as AnyRecord))) {
      return undefined;
    }
    current = (current as AnyRecord)[key];
  }
  return current;
};

const extractHost = (raw: string | null | undefined): string | null => {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const uriMatch = trimmed.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)(?::\d+)?/i);
  if (uriMatch?.[1]) {
    return uriMatch[1];
  }

  const hostPortMatch = trimmed.match(/^([^/:?#]+)(?::\d+)?$/);
  if (hostPortMatch?.[1]) {
    return hostPortMatch[1];
  }

  return null;
};

const isAndroidEmulator = (): boolean => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const platformConstants = (NativeModules as { PlatformConstants?: Record<string, unknown> })
    .PlatformConstants;
  if (!platformConstants) {
    return false;
  }

  const model = String(platformConstants.Model ?? platformConstants.model ?? '').toLowerCase();
  const brand = String(platformConstants.Brand ?? platformConstants.brand ?? '').toLowerCase();
  const fingerprint = String(
    platformConstants.Fingerprint ?? platformConstants.fingerprint ?? '',
  ).toLowerCase();
  const manufacturer = String(
    platformConstants.Manufacturer ?? platformConstants.manufacturer ?? '',
  ).toLowerCase();

  return (
    model.includes('sdk')
    || model.includes('emulator')
    || model.includes('genymotion')
    || brand.includes('generic')
    || manufacturer.includes('genymotion')
    || fingerprint.includes('generic')
    || fingerprint.includes('emulator')
  );
};

const getHostFromExpoConstants = (): string | null => {
  const constantsModule = (NativeModules as { ExponentConstants?: unknown }).ExponentConstants;
  if (!constantsModule || typeof constantsModule !== 'object') {
    return null;
  }

  const candidates: Array<string | null | undefined> = [];
  const record = constantsModule as AnyRecord;

  const manifestRaw = record.manifest;
  if (typeof manifestRaw === 'string') {
    try {
      const parsed = JSON.parse(manifestRaw) as AnyRecord;
      candidates.push(
        String(getNested(parsed, ['debuggerHost']) ?? ''),
        String(getNested(parsed, ['hostUri']) ?? ''),
      );
    } catch {
      // Ignore malformed manifest payload.
    }
  } else if (manifestRaw && typeof manifestRaw === 'object') {
    const manifestObj = manifestRaw as AnyRecord;
    candidates.push(
      String(getNested(manifestObj, ['debuggerHost']) ?? ''),
      String(getNested(manifestObj, ['hostUri']) ?? ''),
    );
  }

  const manifest2Raw = record.manifest2;
  if (manifest2Raw && typeof manifest2Raw === 'object') {
    candidates.push(
      String(getNested(manifest2Raw, ['extra', 'expoClient', 'hostUri']) ?? ''),
      String(getNested(manifest2Raw, ['extra', 'expoGo', 'debuggerHost']) ?? ''),
    );
  }

  candidates.push(
    String(record.experienceUrl ?? ''),
    String(record.linkingUri ?? ''),
  );

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host) {
      return host;
    }
  }

  return null;
};

const getHostFromScriptURL = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  return extractHost(scriptURL);
};

const getDevBaseUrl = (): string => {
  const host = getHostFromExpoConstants() ?? getHostFromScriptURL();
  const lanFallback = DEV_LAN_FALLBACK_HOSTS[0];

  if (!host) {
    return lanFallback
      ? `http://${lanFallback}:${DEFAULT_PORT}`
      : `http://127.0.0.1:${DEFAULT_PORT}`;
  }

  if (isLoopbackHost(host)) {
    if (Platform.OS === 'android') {
      // Use emulator loopback only when running on an actual emulator.
      return isAndroidEmulator()
        ? `http://10.0.2.2:${DEFAULT_PORT}`
        : lanFallback
          ? `http://${lanFallback}:${DEFAULT_PORT}`
          : `http://localhost:${DEFAULT_PORT}`;
    }

    return lanFallback
      ? `http://${lanFallback}:${DEFAULT_PORT}`
      : `http://127.0.0.1:${DEFAULT_PORT}`;
  }

  // Physical device and iOS simulator typically resolve Metro host correctly.
  return `http://${host}:${DEFAULT_PORT}`;
};

const toBaseUrl = (host: string): string => `http://${host}:${DEFAULT_PORT}`;

const buildApiBaseUrlCandidates = (): string[] => {
  const candidates: string[] = [];
  const add = (url: string | null | undefined) => {
    if (!url) {
      return;
    }
    const normalized = url.replace(/\/$/, '');
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  add(EXPLICIT_BASE_URL);

  const expoHost = getHostFromExpoConstants();
  const scriptHost = getHostFromScriptURL();

  if (expoHost && !isLoopbackHost(expoHost)) {
    add(toBaseUrl(expoHost));
  }

  if (scriptHost && !isLoopbackHost(scriptHost)) {
    add(toBaseUrl(scriptHost));
  }

  if (Platform.OS === 'android') {
    if (isAndroidEmulator()) {
      add(toBaseUrl('10.0.2.2'));
    }
  }

  for (const host of DEV_LAN_FALLBACK_HOSTS) {
    add(toBaseUrl(host));
  }

  if (Platform.OS === 'android') {
    add(toBaseUrl('localhost'));
  }

  add(toBaseUrl('127.0.0.1'));

  // Final fallback keeps previous behavior for non-explicit configs.
  add(getDevBaseUrl());

  return candidates;
};

export const API_BASE_URL_CANDIDATES = buildApiBaseUrlCandidates();
export const API_BASE_URL = API_BASE_URL_CANDIDATES[0] || getDevBaseUrl();
