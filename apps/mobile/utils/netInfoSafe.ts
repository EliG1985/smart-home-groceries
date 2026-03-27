import { NativeModules } from 'react-native';

type NetInfoState = {
	isConnected: boolean | null;
	isInternetReachable: boolean | null;
};

type Listener = (state: NetInfoState) => void;
type Unsubscribe = () => void;

type NetInfoLike = {
	addEventListener: (listener: Listener) => Unsubscribe;
};

const hasNativeNetInfo = Boolean((NativeModules as Record<string, unknown>).RNCNetInfo);

let netInfoModule: NetInfoLike | null = null;

if (hasNativeNetInfo) {
	try {
		const loaded = require('@react-native-community/netinfo');
		netInfoModule = (loaded.default ?? loaded) as NetInfoLike;
	} catch {
		netInfoModule = null;
	}
}

export const addNetInfoListener = (listener: Listener): Unsubscribe => {
	if (!netInfoModule?.addEventListener) {
		return () => undefined;
	}

	return netInfoModule.addEventListener(listener);
};
