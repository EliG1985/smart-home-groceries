import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator, DrawerNavigationProp } from '@react-navigation/drawer';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Drawer.Navigator initialRouteName="Inventory">
          <Drawer.Screen name="Inventory" component={InventoryScreen} />
          <Drawer.Screen name="ShoppingList" component={ShoppingListScreen} />
          <Drawer.Screen name="Chat" component={ChatScreen} />
          <Drawer.Screen name="Reports" component={ReportsScreen} />
          <Drawer.Screen name="Store" component={StoreScreen} />
        </Drawer.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
