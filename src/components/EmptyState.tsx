import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { colors } from '../theme/colors';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// Mapeamento de emojis antigos para ícones do MaterialCommunityIcons
const EMOJI_TO_ICON: Record<string, IconName> = {
  // Esportes e competição
  '✅': 'calendar-blank-outline',
  '📅': 'calendar-blank-outline',
  '🏆': 'trophy-outline',
  '⚽': 'soccer',
  '🚩': 'flag-outline',
  '🔍': 'magnify',
  '🛡️': 'shield-outline',
  '👥': 'account-group-outline',
  '📊': 'chart-bar',
  '🎯': 'target',
  '🏅': 'medal-outline',
  // Padrão
  'default': 'alert-circle-outline',
};

interface Props {
  /** Ícone do MaterialCommunityIcons (ex: 'trophy-outline') ou emoji legado */
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  // Se for um emoji (1-2 chars ou comeca com emoji), converter para icone
  const isEmoji = icon.length <= 4 && !/^[a-z-]+$/.test(icon);
  const iconName: IconName = isEmoji
    ? (EMOJI_TO_ICON[icon] ?? EMOJI_TO_ICON['default'])
    : (icon as IconName);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={iconName} size={64} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <AppButton
          title={actionLabel}
          onPress={onAction}
          style={styles.button}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    minWidth: 160,
  },
});
