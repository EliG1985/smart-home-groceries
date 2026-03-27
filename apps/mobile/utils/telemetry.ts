import AsyncStorage from '@react-native-async-storage/async-storage';

type TelemetryEvent = {
	name: string;
	traceId?: string;
	ts: number;
	payload?: Record<string, unknown>;
};

const TELEMETRY_KEY = 'smhg_telemetry_log';
const MAX_LOG_SIZE = 200;

export function newTraceId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function trackEvent(
	name: string,
	traceId?: string,
	payload?: Record<string, unknown>,
): void {
	const event: TelemetryEvent = { name, traceId, ts: Date.now(), payload };

	if (__DEV__) {
		console.log('[telemetry]', JSON.stringify(event));
	}

	// Fire-and-forget: persist to local log ring buffer
	AsyncStorage.getItem(TELEMETRY_KEY)
		.then((raw) => {
			const log: TelemetryEvent[] = raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
			log.push(event);
			if (log.length > MAX_LOG_SIZE) {
				log.splice(0, log.length - MAX_LOG_SIZE);
			}
			return AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(log));
		})
		.catch(() => undefined);
}
