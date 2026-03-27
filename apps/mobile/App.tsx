import './utils/i18n';
import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDrawerNavigator } from '@react-navigation/drawer';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ExpoLinking from 'expo-linking';
import { Linking, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ForgotPasswordScreen from './modules/ForgotPasswordScreen';
import LoginScreen from './modules/LoginScreen';
import RegistrationScreen from './modules/RegistrationScreen';
import ResetPasswordScreen from './modules/ResetPasswordScreen';
import InventoryScreen from './modules/inventory';
import ShoppingListScreen from './modules/shoppingList';
import { supabase } from './utils/supabaseClient';

function ChatScreen() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('messages.chatModule')}</Text>
    </View>
  );
}

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
  Inventory: undefined;
  ShoppingList: undefined;
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
};

const Drawer = createDrawerNavigator<RootDrawerParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function DrawerNavigator() {
  const { t } = useTranslation();
  return (
    <Drawer.Navigator
      initialRouteName="Inventory"
      screenOptions={{
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
      <Drawer.Screen name="ShoppingList" component={ShoppingListScreen} options={{ title: t('screens.shoppingList') }} />
      <Drawer.Screen name="Inventory" component={InventoryScreen} options={{ title: t('screens.inventory') }} />
      <Drawer.Screen name="Chat" component={ChatScreen} options={{ title: t('screens.chat') }} />
      <Drawer.Screen name="Reports" component={ReportsScreen} options={{ title: t('screens.reports') }} />
      <Drawer.Screen name="Store" component={StoreScreen} options={{ title: t('screens.store') }} />
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

  React.useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const initialUrl = await Linking.getInitialURL();
      const handledRecovery = await handleRecoveryLink(initialUrl, false);

      if (handledRecovery) {
        if (mounted) {
          setInitialRoute('ResetPassword');
          setLoading(false);
        }
        return;
      }

      const supabaseSession = await AsyncStorage.getItem('supabaseSession');
      if (supabaseSession) {
        if (mounted) {
          setInitialRoute('Main');
          setLoading(false);
        }
        return;
      }

      const localAuth = await AsyncStorage.getItem('localAuth');
      if (localAuth) {
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
      handleRecoveryLink(url, true).catch(() => undefined);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await AsyncStorage.setItem('supabaseSession', JSON.stringify(session));
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
          <Stack.Screen name="Main" component={DrawerNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
