import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  NativeModules,
  Platform,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

type InstalledApp = {
  label: string;
  packageName: string;
  activityName?: string | null;
  isSystemApp?: boolean;
};

type LauncherStatus = {
  isDefaultLauncher: boolean;
  currentHomePackage?: string | null;
  currentHomeLabel?: string | null;
};

type SymplSettings = {
  enabled: boolean;
  allowedAppKeys: string[];
};

type SymplAppsNativeModule = {
  getLaunchableApps: () => Promise<InstalledApp[]>;
  launchApp: (packageName: string, activityName?: string | null) => Promise<boolean>;
  getLauncherStatus: () => Promise<LauncherStatus>;
  openHomeSettings: () => Promise<boolean>;
};

const storageKey = '@sympl/settings/v1';
const defaultSettings: SymplSettings = {
  enabled: false,
  allowedAppKeys: [],
};
const nativeApps = NativeModules.SymplApps as SymplAppsNativeModule | undefined;

function appKey(app: Pick<InstalledApp, 'packageName' | 'activityName'>) {
  return `${app.packageName}/${app.activityName ?? ''}`;
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <SymplApp />
    </SafeAreaProvider>
  );
}

function SymplApp() {
  const [settings, setSettings] = useState<SymplSettings>(defaultSettings);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [launcherStatus, setLauncherStatus] = useState<LauncherStatus | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

  const isAndroid = Platform.OS === 'android' && Boolean(nativeApps);

  const refreshApps = useCallback(async () => {
    if (!isAndroid || !nativeApps) {
      setApps([]);
      setLauncherStatus({
        isDefaultLauncher: false,
        currentHomeLabel: Platform.OS === 'ios' ? 'iOS Home Screen' : null,
        currentHomePackage: null,
      });
      return;
    }

    setIsRefreshing(true);
    try {
      const [installedApps, status] = await Promise.all([
        nativeApps.getLaunchableApps(),
        nativeApps.getLauncherStatus(),
      ]);
      setApps(installedApps);
      setLauncherStatus(status);
    } catch (error) {
      Alert.alert('Unable to load apps', String(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [isAndroid]);

  useEffect(() => {
    async function load() {
      try {
        const rawSettings = await AsyncStorage.getItem(storageKey);
        if (rawSettings) {
          setSettings({...defaultSettings, ...JSON.parse(rawSettings)});
        }
      } catch (error) {
        Alert.alert('Unable to load Sympl settings', String(error));
      } finally {
        setHasLoadedSettings(true);
        setIsBooting(false);
      }
    }

    load();
    refreshApps();
  }, [refreshApps]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return;
    }

    AsyncStorage.setItem(storageKey, JSON.stringify(settings)).catch(error => {
      Alert.alert('Unable to save Sympl settings', String(error));
    });
  }, [hasLoadedSettings, settings]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        refreshApps();
      }
    });

    return () => subscription.remove();
  }, [refreshApps]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      settings.enabled,
    );

    return () => subscription.remove();
  }, [settings.enabled]);

  const allowedKeys = useMemo(
    () => new Set(settings.allowedAppKeys),
    [settings.allowedAppKeys],
  );
  const allowedApps = useMemo(
    () => apps.filter(app => allowedKeys.has(appKey(app))),
    [allowedKeys, apps],
  );
  const filteredApps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return apps;
    }

    return apps.filter(app => {
      const searchable = `${app.label} ${app.packageName}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [apps, query]);

  const setEnabled = useCallback((enabled: boolean) => {
    setSettings(current => ({...current, enabled}));
  }, []);

  const toggleApp = useCallback((app: InstalledApp) => {
    const key = appKey(app);
    setSettings(current => {
      const nextKeys = new Set(current.allowedAppKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }

      return {...current, allowedAppKeys: Array.from(nextKeys)};
    });
  }, []);

  const launchApp = useCallback(async (app: InstalledApp) => {
    if (!nativeApps || Platform.OS !== 'android') {
      Alert.alert('Unavailable', 'App launching is implemented for Android.');
      return;
    }

    try {
      await nativeApps.launchApp(app.packageName, app.activityName);
    } catch (error) {
      Alert.alert('Unable to open app', String(error));
    }
  }, []);

  const openHomeSettings = useCallback(async () => {
    if (!nativeApps || Platform.OS !== 'android') {
      return;
    }

    try {
      await nativeApps.openHomeSettings();
    } catch (error) {
      Alert.alert('Unable to open Android settings', String(error));
    }
  }, []);

  if (isBooting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {settings.enabled ? (
        <SimplifiedHome
          allowedApps={allowedApps}
          launcherStatus={launcherStatus}
          onLaunchApp={launchApp}
          onOpenHomeSettings={openHomeSettings}
          onRefresh={refreshApps}
          onTurnOff={() => setEnabled(false)}
          refreshing={isRefreshing}
        />
      ) : (
        <SetupScreen
          allowedKeys={allowedKeys}
          apps={filteredApps}
          launcherStatus={launcherStatus}
          onOpenHomeSettings={openHomeSettings}
          onRefresh={refreshApps}
          onToggleApp={toggleApp}
          onTurnOn={() => setEnabled(true)}
          query={query}
          refreshing={isRefreshing}
          selectedCount={settings.allowedAppKeys.length}
          setQuery={setQuery}
        />
      )}
    </SafeAreaView>
  );
}

type SetupScreenProps = {
  allowedKeys: Set<string>;
  apps: InstalledApp[];
  launcherStatus: LauncherStatus | null;
  onOpenHomeSettings: () => void;
  onRefresh: () => void;
  onToggleApp: (app: InstalledApp) => void;
  onTurnOn: () => void;
  query: string;
  refreshing: boolean;
  selectedCount: number;
  setQuery: (query: string) => void;
};

function SetupScreen({
  allowedKeys,
  apps,
  launcherStatus,
  onOpenHomeSettings,
  onRefresh,
  onToggleApp,
  onTurnOn,
  query,
  refreshing,
  selectedCount,
  setQuery,
}: SetupScreenProps) {
  const isAndroid = Platform.OS === 'android' && Boolean(nativeApps);
  const canTurnOn = isAndroid && selectedCount > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Sympl</Text>
          <Text style={styles.title}>Choose your essentials</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!canTurnOn}
          onPress={onTurnOn}
          style={({pressed}) => [
            styles.primaryButton,
            !canTurnOn && styles.disabledButton,
            pressed && canTurnOn && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonText}>Turn On</Text>
        </Pressable>
      </View>

      {isAndroid ? (
        <LauncherPanel
          launcherStatus={launcherStatus}
          onOpenHomeSettings={onOpenHomeSettings}
          selectedCount={selectedCount}
        />
      ) : (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>iPhone build path</Text>
          <Text style={styles.noticeBody}>
            The shared app runs on iOS, but real app blocking needs Apple Screen
            Time Family Controls entitlement work in the native iOS target.
          </Text>
        </View>
      )}

      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Search apps"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        value={query}
      />

      <FlatList
        data={apps}
        keyExtractor={appKey}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({item}) => (
          <SelectableAppRow
            app={item}
            isSelected={allowedKeys.has(appKey(item))}
            onToggle={() => onToggleApp(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {isAndroid ? 'No apps found' : 'Android app list unavailable'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

type SimplifiedHomeProps = {
  allowedApps: InstalledApp[];
  launcherStatus: LauncherStatus | null;
  onLaunchApp: (app: InstalledApp) => void;
  onOpenHomeSettings: () => void;
  onRefresh: () => void;
  onTurnOff: () => void;
  refreshing: boolean;
};

function SimplifiedHome({
  allowedApps,
  launcherStatus,
  onLaunchApp,
  onOpenHomeSettings,
  onRefresh,
  onTurnOff,
  refreshing,
}: SimplifiedHomeProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Sympl is on</Text>
          <Text style={styles.title}>Essentials only</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onTurnOff}
          style={({pressed}) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.secondaryButtonText}>Turn Off</Text>
        </Pressable>
      </View>

      {Platform.OS === 'android' && !launcherStatus?.isDefaultLauncher ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Set Sympl as Home</Text>
          <Text style={styles.noticeBody}>
            Android will return here when you press Home after Sympl is the
            default home app.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenHomeSettings}
            style={({pressed}) => [
              styles.inlineButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.inlineButtonText}>Open Home Settings</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={allowedApps}
        keyExtractor={appKey}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({item}) => (
          <AppTile app={item} onPress={() => onLaunchApp(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No allowed apps selected</Text>
          </View>
        }
        contentContainerStyle={styles.gridContent}
      />
    </View>
  );
}

type LauncherPanelProps = {
  launcherStatus: LauncherStatus | null;
  onOpenHomeSettings: () => void;
  selectedCount: number;
};

function LauncherPanel({
  launcherStatus,
  onOpenHomeSettings,
  selectedCount,
}: LauncherPanelProps) {
  return (
    <View style={styles.panel}>
      <View>
        <Text style={styles.panelTitle}>
          {selectedCount} app{selectedCount === 1 ? '' : 's'} allowed
        </Text>
        <Text style={styles.panelBody}>
          Home app:{' '}
          {launcherStatus?.isDefaultLauncher
            ? 'Sympl'
            : launcherStatus?.currentHomeLabel ?? 'Not set'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenHomeSettings}
        style={({pressed}) => [styles.inlineButton, pressed && styles.pressed]}>
        <Text style={styles.inlineButtonText}>Home Settings</Text>
      </Pressable>
    </View>
  );
}

type SelectableAppRowProps = {
  app: InstalledApp;
  isSelected: boolean;
  onToggle: () => void;
};

function SelectableAppRow({app, isSelected, onToggle}: SelectableAppRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      style={({pressed}) => [
        styles.appRow,
        isSelected && styles.appRowSelected,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.appIcon, isSelected && styles.appIconSelected]}>
        <Text
          style={[styles.appIconText, isSelected && styles.appIconTextSelected]}>
          {initials(app.label)}
        </Text>
      </View>
      <View style={styles.appCopy}>
        <Text numberOfLines={1} style={styles.appName}>
          {app.label}
        </Text>
        <Text numberOfLines={1} style={styles.packageName}>
          {app.packageName}
        </Text>
      </View>
      <View pointerEvents="none">
        <Switch value={isSelected} />
      </View>
    </Pressable>
  );
}

type AppTileProps = {
  app: InstalledApp;
  onPress: () => void;
};

function AppTile({app, onPress}: AppTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileIcon}>
        <Text style={styles.tileIconText}>{initials(app.label)}</Text>
      </View>
      <Text numberOfLines={2} style={styles.tileLabel}>
        {app.label}
      </Text>
    </Pressable>
  );
}

const colors = {
  accent: '#1F7A5A',
  accentDark: '#14543F',
  background: '#F7F8FA',
  border: '#D9DEE5',
  card: '#FFFFFF',
  ink: '#17201B',
  muted: '#667085',
  softAccent: '#E7F3EE',
  warning: '#C4512C',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 3,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 34,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: colors.card,
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    backgroundColor: '#AAB5BF',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  inlineButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.softAccent,
    borderRadius: 8,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  inlineButtonText: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
  notice: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
    padding: 14,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  noticeBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
    padding: 14,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  panelBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  listContent: {
    gap: 10,
    paddingBottom: 24,
    paddingTop: 12,
  },
  appRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    padding: 12,
  },
  appRowSelected: {
    backgroundColor: colors.softAccent,
    borderColor: '#9AC9B5',
  },
  appIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF1F4',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  appIconSelected: {
    backgroundColor: colors.accent,
  },
  appIconText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  appIconTextSelected: {
    color: colors.card,
  },
  appCopy: {
    flex: 1,
    minWidth: 0,
  },
  appName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  packageName: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  gridContent: {
    flexGrow: 1,
    paddingBottom: 24,
    paddingTop: 6,
  },
  gridRow: {
    gap: 10,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 126,
    padding: 12,
    width: '30.8%',
  },
  tileIcon: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    marginBottom: 10,
    width: 56,
  },
  tileIconText: {
    color: colors.card,
    fontSize: 17,
    fontWeight: '900',
  },
  tileLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 220,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
});

export default App;
