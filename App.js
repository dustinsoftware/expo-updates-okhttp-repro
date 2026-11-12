import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BUNDLE_LABEL = process.env.EXPO_PUBLIC_BUNDLE_LABEL || 'EMBEDDED';

function describeError(error) {
  const code = error?.code ? ` [${error.code}]` : '';
  return `${error?.message ?? String(error)}${code}`;
}

async function checkFetchAndReload(report) {
  report('Checking for update...');
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) {
    report('No update available');
    return;
  }
  report('Update available, downloading...');
  const fetched = await Updates.fetchUpdateAsync();
  if (!fetched.isNew) {
    report('Downloaded update is not new');
    return;
  }
  report('Downloaded, reloading...');
  await Updates.reloadAsync();
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function App() {
  const [status, setStatus] = useState('Idle');
  const [isError, setIsError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const onCheckPress = async () => {
    setIsBusy(true);
    setIsError(false);
    try {
      await checkFetchAndReload(setStatus);
    } catch (error) {
      console.error('Update failed', error);
      setIsError(true);
      setStatus(`ERROR: ${describeError(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.bundleLabel} accessibilityRole="header">
        {BUNDLE_LABEL}
      </Text>
      <InfoRow label="Variant" value={String(Constants.expoConfig?.extra?.reproVariant)} />
      <InfoRow label="Updates.isEmbeddedLaunch" value={String(Updates.isEmbeddedLaunch)} />
      <InfoRow label="Updates.updateId" value={String(Updates.updateId)} />
      <InfoRow label="Updates.runtimeVersion" value={String(Updates.runtimeVersion)} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isBusy }}
        disabled={isBusy}
        onPress={onCheckPress}
        style={({ pressed }) => [styles.button, (pressed || isBusy) && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Check for update</Text>
      </Pressable>
      <Text
        style={[styles.status, isError && styles.statusError]}
        accessibilityLiveRegion="polite"
        selectable
      >
        {status}
      </Text>
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 64,
    gap: 12,
  },
  bundleLabel: {
    fontSize: 40,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  row: {
    gap: 2,
  },
  label: {
    fontSize: 12,
    color: '#555',
  },
  value: {
    fontSize: 16,
    color: '#111',
    fontFamily: 'monospace',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#1f6feb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    fontSize: 16,
    color: '#111',
  },
  statusError: {
    color: '#b00020',
    fontWeight: '600',
  },
});
