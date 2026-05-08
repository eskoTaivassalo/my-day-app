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
  'You are initializing Firebase Auth for React Native without providing AsyncStorage',
  'Attempted to import the module'
]);

// Auth
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';

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
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import { AppLockProvider, useAppLock } from './src/contexts/AppLockContext';
import AppLockScreen from './src/screens/AppLockScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Main tab navigator
function MainTabs() {
  const { t } = useLanguage();
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        tabBarStyle: {
          height: 90,
          paddingBottom: 30,
          paddingTop: 10,
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          fontFamily: theme.fonts.bodyFamily,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
      }}
    >
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{
          title: t('tab_timeline'),
          tabBarIcon: ({ color }) => <TabIcon icon="📖" color={color} />,
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          title: t('tab_calendar'),
          tabBarIcon: ({ color }) => <TabIcon icon="📅" color={color} />,
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{
          title: t('tab_documents'),
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
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
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
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
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
  const { isLocked, pinEnabled } = useAppLock();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (user) {
      initializeNotifications();
    }
  }, [user]);

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;

      if (type === 'reminder') {
        Alert.alert(t('notification_reminder_title'), notification.request.content.body || '');
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, [t]);


  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 20, color: theme.colors.text, fontFamily: theme.fonts.bodyFamily }}>
          {t('common_loading')}
        </Text>
      </View>
    );
  }

  if (!user) return <AuthNavigator />;

  // Show PIN lock screen only when PIN is enabled and app is locked
  if (pinEnabled && isLocked) return <AppLockScreen />;

  return <AppNavigator />;
}

// Main App component
export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppLockProvider>
            <NavigationContainer>
              <StatusBar style="auto" />
              <RootNavigator />
            </NavigationContainer>
          </AppLockProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
