import React from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';

interface AppLogoProps {
  size?: number;
  showWordmark?: boolean;
}

export default function AppLogo({ size = 80, showWordmark = true }: AppLogoProps) {
  const logoSize = Math.max(40, size);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo-book-pen.png')}
        style={[styles.logoImage, { width: logoSize, height: logoSize }]}
        resizeMode="contain"
      />

      {showWordmark ? <Text style={styles.wordmark}>My days</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  logoImage: {
    borderRadius: 16,
  },
  wordmark: {
    marginTop: 12,
    fontSize: 32,
    fontWeight: '600',
    fontStyle: 'italic',
    fontFamily: Platform.select({
      ios: 'Snell Roundhand',
      android: 'cursive',
      default: undefined,
    }),
    color: '#0C4A6E',
    letterSpacing: 0.8,
  },
});
