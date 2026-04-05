import i18n from './utils/i18n';
import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
  createDrawerNavigator,
} from '@react-navigation/drawer';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ExpoLinking from 'expo-linking';
import { Alert, Dimensions, Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ForgotPasswordScreen from './modules/ForgotPasswordScreen';
import InviteReviewScreen from './modules/InviteReviewScreen';
import LoginScreen from './modules/LoginScreen';
import RegistrationScreen from './modules/RegistrationScreen';
import ResetPasswordScreen from './modules/ResetPasswordScreen';
import BarcodeScannerScreen from './modules/BarcodeScannerScreen';
import AccountProfileScreen from './modules/AccountProfileScreen';
import SettingsScreen from './modules/SettingsScreen';
import InventoryScreen from './modules/inventory';
import ChatScreen from './modules/chat';
import ShoppingListScreen from './modules/shoppingList';
import {
  extractInviteTokenFromUrl,
  getPendingInviteToken,
  setPendingInviteToken,
} from './utils/inviteLink';
import { supabase } from './utils/supabaseClient';

const MembersScreenModule = require('./modules/MembersScreen');
const MembersScreen: React.ComponentType<any> =
  MembersScreenModule?.default ?? (() => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Members screen failed to load.</Text>
    </View>
  ));

function ReportsScreen() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('messages.reportsModule')}</Text>
    </View>
  );
}

function StoreScreen() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('messages.storeModule')}</Text>
    </View>
  );
}



type RootDrawerParamList = {
  AccountProfile: undefined;
  Inventory: undefined;
  ShoppingList:
    | {
        prefillBarcode?: string;
        scannedAt?: number;
      }
    | undefined;
  Settings: undefined;
  Members: undefined;
  Chat: undefined;
  Reports: undefined;
  Store: undefined;
};

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  Main: undefined;
  InviteReview: undefined;
  BarcodeScanner: undefined;
};

const Drawer = createDrawerNavigator<RootDrawerParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

type AppDrawerContentProps = DrawerContentComponentProps & {
  onLogout: () => Promise<void>;
};

function AppDrawerContent({ onLogout, ...props }: AppDrawerContentProps) {
  const { t } = useTranslation();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, onLogout]);

  return (
    <View style={styles.drawerContentWrapper}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerScrollContent}>
        <View style={styles.accountHeaderWrap}>
          <DrawerItem
            label={t('screens.accountProfile')}
            onPress={() => props.navigation.navigate('AccountProfile')}
          />
          <View style={styles.accountDivider} />
        </View>

        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={styles.drawerFooter}>
        <DrawerItem
          label={loggingOut ? t('common.loggingOut') : t('common.logout')}
          onPress={handleLogout}
        />
      </View>
    </View>
  );
}

function DrawerNavigator({ onLogout }: { onLogout: () => Promise<void> }) {
  const { t } = useTranslation();
  const drawerWidth = Math.min(Dimensions.get('window').width * 0.72, 300);

  return (
    <Drawer.Navigator
      initialRouteName="Inventory"
      drawerContent={(props) => <AppDrawerContent {...props} onLogout={onLogout} />}
      screenOptions={{
        drawerStyle: {
          width: drawerWidth,
        },
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTintColor: '#0C0A1C',
        headerTitleStyle: {
          fontWeight: '700',
        },
        sceneContainerStyle: {
          backgroundColor: '#E8E4FF',
        },
      }}
    >
      <Drawer.Screen
        name="AccountProfile"
        component={AccountProfileScreen}
        options={{ title: t('screens.accountProfile'), drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen name="ShoppingList" component={ShoppingListScreen} options={{ title: t('screens.shoppingList') }} />
      <Drawer.Screen name="Inventory" component={InventoryScreen} options={{ title: t('screens.inventory') }} />
      <Drawer.Screen name="Members" component={MembersScreen} options={{ title: t('screens.members') }} />
      <Drawer.Screen name="Chat" component={ChatScreen} options={{ title: t('screens.chat') }} />
      <Drawer.Screen name="Reports" component={ReportsScreen} options={{ title: t('screens.reports') }} />
      <Drawer.Screen name="Store" component={StoreScreen} options={{ title: t('screens.store') }} />
      <Drawer.Screen name="Settings" component={SettingsScreen} options={{ title: t('screens.settings') }} />
    </Drawer.Navigator>
  );
}

const normalizeDeepLink = (url: string) => {
  const fragmentIndex = url.indexOf('#');
  if (fragmentIndex === -1) {
    return url;
  }

  return `${url.slice(0, fragmentIndex)}?${url.slice(fragmentIndex + 1)}`;
};

const getSingleParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

export default function App() {
  const { t } = useTranslation();
  const [initialRoute, setInitialRoute] = React.useState<keyof RootStackParamList | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);

  const handleLogout = React.useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if remote sign-out fails, clear local auth state to force fresh login.
    }

    await AsyncStorage.multiRemove(['supabaseSession', 'localAuth']);

    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    } else {
      setInitialRoute('Login');
    }
  }, []);

  const handleRecoveryLink = React.useCallback(async (url: string | null, shouldNavigate: boolean) => {
    if (!url || !url.includes('reset-password')) {
      return false;
    }

    const parsedUrl = ExpoLinking.parse(normalizeDeepLink(url));
    const accessToken = getSingleParam(parsedUrl.queryParams?.access_token);
    const refreshToken = getSingleParam(parsedUrl.queryParams?.refresh_token);
    const recoveryType = getSingleParam(parsedUrl.queryParams?.type);

    if (!accessToken || !refreshToken || recoveryType !== 'recovery') {
      return false;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return false;
    }

    await AsyncStorage.setItem('supabaseSession', JSON.stringify(data.session));

    if (shouldNavigate && navigationRef.isReady()) {
      navigationRef.navigate('ResetPassword');
    }

    return true;
  }, []);

  const processPendingInvite = React.useCallback(async (shouldNavigate: boolean) => {
    const token = await getPendingInviteToken();
    if (!token) {
      return false;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      return false;
    }

    if (shouldNavigate) {
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'InviteReview' }] });
      } else {
        setInitialRoute('InviteReview');
      }
    }

    return true;
  }, []);

  const handleInviteLink = React.useCallback(async (url: string | null, shouldNavigate: boolean) => {
    const token = extractInviteTokenFromUrl(url);
    if (!token) {
      return false;
    }

    await setPendingInviteToken(token);
    const { data } = await supabase.auth.getSession();

    if (data.session?.user) {
      await processPendingInvite(shouldNavigate);
      return true;
    }

    if (shouldNavigate) {
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else {
        setInitialRoute('Login');
      }
    }

    Alert.alert(t('members.pendingInviteTitle'), t('members.pendingInviteBody'));
    return true;
  }, [processPendingInvite, t]);

  React.useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      // Restore language (and RTL direction via i18n languageChanged listener) before first render.
      try {
        const storedLang = await AsyncStorage.getItem('appLanguage');
        if (storedLang) {
          await i18n.changeLanguage(storedLang.split('-')[0]);
        }
      } catch {
        // Non-fatal — default language stays.
      }

      const initialUrl = await Linking.getInitialURL();
      const handledRecovery = await handleRecoveryLink(initialUrl, false);

      if (handledRecovery) {
        if (mounted) {
          setInitialRoute('ResetPassword');
          setLoading(false);
        }
        return;
      }

      await handleInviteLink(initialUrl, false);

      const pendingInviteToken = await getPendingInviteToken();

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        await processPendingInvite(false);
        if (mounted) {
          setInitialRoute(pendingInviteToken ? 'InviteReview' : 'Main');
          setLoading(false);
        }
        return;
      }

      const supabaseSession = await AsyncStorage.getItem('supabaseSession');
      if (supabaseSession && !pendingInviteToken) {
        if (mounted) {
          setInitialRoute('Main');
          setLoading(false);
        }
        return;
      }

      const localAuth = await AsyncStorage.getItem('localAuth');
      if (localAuth && !pendingInviteToken) {
        if (mounted) {
          setInitialRoute('Main');
          setLoading(false);
        }
        return;
      }

      if (mounted) {
        setInitialRoute('Login');
        setLoading(false);
      }
    };

    restoreSession().catch(() => {
      if (mounted) {
        setInitialRoute('Login');
        setLoading(false);
      }
    });

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      handleRecoveryLink(url, true)
        .then((handled) => {
          if (!handled) {
            return handleInviteLink(url, true);
          }
          return undefined;
        })
        .catch(() => undefined);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await AsyncStorage.setItem('supabaseSession', JSON.stringify(session));
        if (event !== 'PASSWORD_RECOVERY') {
          await processPendingInvite(true);
        }
      } else {
        await AsyncStorage.removeItem('supabaseSession');
      }

      if (event === 'PASSWORD_RECOVERY') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('ResetPassword');
        } else if (mounted) {
          setInitialRoute('ResetPassword');
        }
      }
    });

    return () => {
      mounted = false;
      linkSubscription.remove();
      subscription.unsubscribe();
    };
  }, [handleRecoveryLink]);

  if (loading || !initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>{t('common.loading')}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegistrationScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          <Stack.Screen name="InviteReview" component={InviteReviewScreen} />
          <Stack.Screen name="Main">
            {() => <DrawerNavigator onLogout={handleLogout} />}
          </Stack.Screen>
          <Stack.Screen
            name="BarcodeScanner"
            component={BarcodeScannerScreen}
            options={{ headerShown: true, title: t('screens.barcodeScanner') }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  drawerContentWrapper: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingTop: 0,
  },
  accountHeaderWrap: {
    paddingTop: 8,
  },
  accountDivider: {
    height: 1,
    backgroundColor: '#D0CBEA',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: '#D0CBEA',
    paddingBottom: 8,
  },
});
