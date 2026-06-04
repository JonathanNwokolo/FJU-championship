import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface State {
  hasError: boolean;
  error?: Error;
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={64} color={colors.textMuted} />
          <Text style={styles.title}>Algo deu errado</Text>
          <Text style={styles.description}>
            Ocorreu um erro inesperado. Tente novamente.
          </Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg100,
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 8,
  },
  description: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  buttonText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textOnAccent,
    letterSpacing: 0.5,
  },
});
