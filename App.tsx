import React, { useEffect, useRef } from 'react';
import { Text, ActivityIndicator, View, LogBox, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { initializeNotifications } from './src/services/notificationService';

// Ignore Firebase AsyncStorage warning
LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  '@firebase/auth: Auth',
  'You are initializing Firebase Auth for React Native without providing AsyncStorage'
]);

// Auth
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import TimelineScreen from './src/screens/TimelineScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import DocumentDetailScreen from './src/screens/DocumentDetailScreen';
import NewEntryScreen from './src/screens/NewEntryScreen';
import EntryDetailScreen from './src/screens/EntryDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AchievementsScreen from './src/screens/AchievementsScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ImageLibraryScreen from './src/screens/ImageLibraryScreen';
import VideoLibraryScreen from './src/screens/VideoLibraryScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Main tab navigator
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 90,
          paddingBottom: 30,
          paddingTop: 10,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
      }}
    >
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{
          title: 'Aikajana',
          tabBarIcon: ({ color }) => <TabIcon icon="📖" color={color} />,
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          title: 'Kalenteri',
          tabBarIcon: ({ color }) => <TabIcon icon="📅" color={color} />,
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{
          title: 'Dokumentit',
          tabBarIcon: ({ color }) => <TabIcon icon="📄" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

// Tab icon component
function TabIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <Text style={{ fontSize: 28, opacity: color === '#007AFF' ? 1 : 0.5 }}>
      {icon}
    </Text>
  );
}

// Auth navigator
function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// App navigator
function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NewEntry"
        component={NewEntryScreen}
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="EntryDetail"
        // @ts-expect-error - EntryDetailScreen uses custom Props type
        component={EntryDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Achievements"
        component={AchievementsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ImageLibrary"
        component={ImageLibraryScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="VideoLibrary"
        component={VideoLibraryScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="DocumentDetail"
        component={DocumentDetailScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}

// Root navigator with auth check
function RootNavigator() {
  const { user, loading } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (user) {
      // Initialize notifications when user is logged in
      initializeNotifications();
    }
  }, [user]);


  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;

      if (type === 'reminder') {
        Alert.alert('⏰ Muistutus', notification.request.content.body || 'Muistutus');
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, []);


  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 20 }}>Ladataan...</Text>
      </View>
    );
  }

  return user ? <AppNavigator /> : <AuthNavigator />;
}

// Main App component
export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
