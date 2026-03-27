import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, type PermissionResponse } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import AppButton from '../ui/AppButton';
import { borderRadius, colors, fontSizes, spacing } from '../ui/theme';
import { trackEvent, newTraceId } from '../utils/telemetry';

const { CameraView } = require('expo-camera/build/next');

type BarCodeScanningResult = {
  type: string;
  data: string;
};

type ScanTarget = {
  prefillBarcode?: string;
  scannedAt?: number;
};

type MainRouteTarget = {
  screen: 'ShoppingList';
  params?: ScanTarget;
};

const DUPLICATE_DEBOUNCE_MS = 2500;

const normalizeBarcode = (value: string): string => value.replace(/\D/g, '').trim();

export default function BarcodeScannerScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const [permission, setPermission] = React.useState<PermissionResponse | null>(null);
  const [torchEnabled, setTorchEnabled] = React.useState(false);
  const [manualBarcode, setManualBarcode] = React.useState('');
  const [scanLocked, setScanLocked] = React.useState(false);
  const lastScansRef = React.useRef<Map<string, number>>(new Map());
  const scanSessionTraceIdRef = React.useRef<string>(newTraceId());
  const scanStartedEmittedRef = React.useRef(false);

  React.useEffect(() => {
    Camera.getCameraPermissionsAsync()
      .then((result) => {
        setPermission(result);
        if (result.granted && !scanStartedEmittedRef.current) {
          scanStartedEmittedRef.current = true;
          trackEvent('scan_started', scanSessionTraceIdRef.current);
        }
      })
      .catch(() => setPermission(null));
  }, []);

  const requestPermission = React.useCallback(async () => {
    const result = await Camera.requestCameraPermissionsAsync();
    setPermission(result);
    if (result.granted && !scanStartedEmittedRef.current) {
      scanStartedEmittedRef.current = true;
      trackEvent('scan_started', scanSessionTraceIdRef.current);
    }
  }, []);

  const navigateToShoppingList = React.useCallback((params?: ScanTarget) => {
    navigation.navigate('Main', {
      screen: 'ShoppingList',
      params,
    } satisfies MainRouteTarget);
  }, [navigation]);

  const pushScanResult = React.useCallback((barcodeRaw: string) => {
    if (scanLocked) {
      return;
    }

    const barcode = normalizeBarcode(barcodeRaw);
    if (!barcode || barcode.length < 8 || barcode.length > 14) {
      trackEvent('scan_rejected', scanSessionTraceIdRef.current, {
        barcode_len: barcode.length,
      });
      return;
    }

    const now = Date.now();
    const previous = lastScansRef.current.get(barcode);
    if (previous && now - previous < DUPLICATE_DEBOUNCE_MS) {
      return;
    }

    lastScansRef.current.set(barcode, now);
    setScanLocked(true);
    trackEvent('scan_success', scanSessionTraceIdRef.current, { barcode_len: barcode.length });

    navigateToShoppingList({
      prefillBarcode: barcode,
      scannedAt: now,
    });
  }, [navigateToShoppingList, scanLocked]);

  const onBarcodeScanned = React.useCallback((event: BarCodeScanningResult) => {
    trackEvent('scan_detected', scanSessionTraceIdRef.current, {
      type: event.type,
      raw_len: event.data?.length ?? 0,
    });
    pushScanResult(event.data);
  }, [pushScanResult]);

  const onUseManualBarcode = React.useCallback(() => {
    pushScanResult(manualBarcode);
  }, [manualBarcode, pushScanResult]);

  const onCameraReady = React.useCallback(() => {
    trackEvent('scanner_camera_ready', scanSessionTraceIdRef.current);
  }, []);

  const onCameraMountError = React.useCallback((event: { message: string }) => {
    trackEvent('scanner_camera_mount_error', scanSessionTraceIdRef.current, {
      message: event?.message ?? 'unknown',
    });
  }, []);

  const scannerSettings = React.useMemo(
    () => ({
      barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr', 'pdf417', 'datamatrix'],
      interval: 250,
    }),
    [],
  );

  const permissionDenied = permission && !permission.granted;
  const blockedPermission = permissionDenied && permission.canAskAgain === false;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('scanner.title')}</Text>

      {!permission ? (
        <Text style={styles.infoText}>{t('common.loading')}</Text>
      ) : null}

      {permissionDenied ? (
        <View style={styles.permissionCard}>
          <Text style={styles.infoText}>{t('scanner.permissionBody')}</Text>
          {!blockedPermission ? (
            <AppButton
              title={t('scanner.permissionGrant')}
              onPress={() => {
                requestPermission().catch(() => undefined);
              }}
              style={styles.permissionButton}
            />
          ) : (
            <AppButton title={t('scanner.permissionOpenSettings')} onPress={() => Linking.openSettings()} style={styles.permissionButton} />
          )}
        </View>
      ) : null}

      {permission?.granted ? (
        <View style={styles.cameraCard}>
          <CameraView
            style={styles.camera}
            facing="back"
            enableTorch={torchEnabled}
            onCameraReady={onCameraReady}
            onMountError={onCameraMountError}
            barcodeScannerSettings={scannerSettings}
            onBarcodeScanned={scanLocked ? undefined : onBarcodeScanned}
          />
          <View style={styles.overlayGuide} pointerEvents="none" />
          <View style={styles.cameraActions}>
            <AppButton
              title={torchEnabled ? t('scanner.torchOff') : t('scanner.torchOn')}
              onPress={() => setTorchEnabled((value) => !value)}
              style={styles.actionButton}
            />
            <AppButton
              title={t('scanner.backToList')}
              onPress={() => navigateToShoppingList()}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.manualCard}>
        <Text style={styles.manualTitle}>{t('scanner.manualTitle')}</Text>
        <TextInput
          style={styles.input}
          value={manualBarcode}
          onChangeText={setManualBarcode}
          placeholder={t('scanner.manualPlaceholder')}
          keyboardType="number-pad"
          placeholderTextColor={colors.placeholder}
          textAlign={i18n.language === 'he' ? 'right' : 'left'}
        />
        <AppButton title={t('scanner.manualUse')} onPress={onUseManualBarcode} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  header: {
    color: colors.text,
    fontSize: fontSizes.large,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: fontSizes.medium,
  },
  permissionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  permissionButton: {
    marginTop: spacing.sm,
  },
  cameraCard: {
    position: 'relative',
    borderRadius: borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  camera: {
    height: 340,
    width: '100%',
  },
  overlayGuide: {
    position: 'absolute',
    top: '28%',
    left: '14%',
    right: '14%',
    height: '26%',
    borderWidth: 2,
    borderColor: colors.secondary,
    borderRadius: borderRadius,
  },
  cameraActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
  },
  manualCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius,
    padding: spacing.md,
  },
  manualTitle: {
    color: colors.text,
    fontSize: fontSizes.medium,
    fontWeight: '700',
    marginBottom: spacing.sm,
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
});
