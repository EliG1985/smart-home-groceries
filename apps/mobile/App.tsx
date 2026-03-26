import './utils/i18n';
import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './modules/LoginScreen';
import RegistrationScreen from './modules/RegistrationScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, View, Text } from 'react-native';

// Placeholder screens for each module
function InventoryScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Inventory Module</Text>
    </View>
  );
}
function ShoppingListScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Shopping List Module</Text>
    </View>
  );
}
function ChatScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Chat Module</Text>
    </View>
  );
}
function ReportsScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Reports Module</Text>
    </View>
  );
}
function StoreScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Store Module</Text>
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
const Drawer = createDrawerNavigator<RootDrawerParamList>();

function DrawerNavigator() {
  return (
    <Drawer.Navigator initialRouteName="Inventory">
      <Drawer.Screen name="Inventory" component={InventoryScreen} />
      <Drawer.Screen name="ShoppingList" component={ShoppingListScreen} />
      <Drawer.Screen name="Chat" component={ChatScreen} />
      <Drawer.Screen name="Reports" component={ReportsScreen} />
      <Drawer.Screen name="Store" component={StoreScreen} />
    </Drawer.Navigator>
  );
}

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = React.useState<keyof RootStackParamList | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const restoreSession = async () => {
      // 1. Try Supabase session
      const supabaseSession = await AsyncStorage.getItem('supabaseSession');
      if (supabaseSession) {
        // Optionally, validate session with Supabase here
        setInitialRoute('Main');
        setLoading(false);
        return;
      }
      // 2. Try local credentials
      const localAuth = await AsyncStorage.getItem('localAuth');
      if (localAuth) {
        try {
          const { email, hash } = JSON.parse(localAuth);
          // Optionally, prompt for password or use a cached password hash
          // For demo, just auto-login if localAuth exists
          setInitialRoute('Main');
          setLoading(false);
          return;
        } catch (e) {
          // Ignore parse errors
        }
      }
      setInitialRoute('Login');
      setLoading(false);
    };
    restoreSession();
  }, []);

  if (loading || !initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegistrationScreen} />
          <Stack.Screen name="Main" component={DrawerNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
