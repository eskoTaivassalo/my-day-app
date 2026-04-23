/**
 * Design System - Yhtenäiset tyylit koko sovellukselle
 */

import { Platform } from 'react-native';

const scriptFontFamily = Platform.select({
  ios: 'Snell Roundhand',
  android: 'cursive',
  default: undefined,
});

export const colors = {
  // Primary colors - Päiväkirjan pehmeä violetti/sininen teema
  primary: '#6366F1', // Indigo
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  
  // Secondary colors
  secondary: '#EC4899', // Pink
  secondaryLight: '#F472B6',
  
  // Accent colors
  accent: '#F59E0B', // Amber
  success: '#10B981', // Green
  warning: '#F59E0B', // Amber
  error: '#EF4444', // Red
  
  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',
  
  // Grays
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  
  // Background colors
  background: '#FFFFFF',
  backgroundLight: '#F9FAFB',
  backgroundDark: '#F3F4F6',
  
  // Text colors
  text: '#111827',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  textInverse: '#FFFFFF',
  
  // Border colors
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderDark: '#D1D5DB',
  
  // Status colors with transparency
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

export const typography = {
  // Font sizes
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 48,
  },
  
  // Font weights
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
  
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const shadows = {
  sm: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },
};

export const animations = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
  },
};

// Common component styles
export const commonStyles = {
  // Cards
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
  },
  
  // Buttons
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  
  buttonSecondary: {
    backgroundColor: colors.gray100,
  },
  
  // Inputs
  input: {
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  
  // Text styles
  heading1: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.semibold,
    fontStyle: 'italic' as const,
    fontFamily: scriptFontFamily,
    color: colors.text,
    lineHeight: typography.fontSizes.xxxl * typography.lineHeights.tight,
  },
  
  heading2: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.semibold,
    fontStyle: 'italic' as const,
    fontFamily: scriptFontFamily,
    color: colors.text,
    lineHeight: typography.fontSizes.xxl * typography.lineHeights.tight,
  },
  
  heading3: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    fontStyle: 'italic' as const,
    fontFamily: scriptFontFamily,
    color: colors.text,
    lineHeight: typography.fontSizes.xl * typography.lineHeights.normal,
  },
  
  body: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.regular,
    fontStyle: 'italic' as const,
    fontFamily: scriptFontFamily,
    color: colors.text,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
  },
  
  bodySecondary: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.regular,
    fontStyle: 'italic' as const,
    fontFamily: scriptFontFamily,
    color: colors.textSecondary,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
  },
  
  caption: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.regular,
    fontStyle: 'italic' as const,
    fontFamily: scriptFontFamily,
    color: colors.textLight,
    lineHeight: typography.fontSizes.xs * typography.lineHeights.normal,
  },
};

export default {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  animations,
  commonStyles,
};
