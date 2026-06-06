import React from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getShieldById } from '../data/teamShields';
import { Team } from '../types';
import { colors } from '../theme/colors';

interface Props {
  team: Team;
  size: number;
  style?: ViewStyle;
}

/**
 * Get initials from team name (max 2 letters)
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

/**
 * TeamLogo - Displays team logo/shield
 * Priority: logoUrl > logoPreset > initials fallback
 */
export function TeamLogo({ team, size, style }: Props) {
  const teamColor = team.primaryColor || colors.accent;

  // Custom logo URL
  if (team.logoUrl) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
        <Image
          source={{ uri: team.logoUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  // Preset shield icon
  if (team.logoPreset) {
    const shield = getShieldById(team.logoPreset);
    if (shield) {
      const iconSize = Math.round(size * 0.55);
      return (
        <View
          style={[
            styles.container,
            styles.iconContainer,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: `${teamColor}22`,
            },
            style,
          ]}
        >
          <MaterialCommunityIcons
            name={shield.icon as any}
            size={iconSize}
            color={teamColor}
          />
        </View>
      );
    }
  }

  // Fallback: Team initials
  const initials = getInitials(team.name);
  const fontSize = Math.round(size * 0.38);

  return (
    <View
      style={[
        styles.container,
        styles.initialsContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${teamColor}22`,
        },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize, color: teamColor }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    backgroundColor: colors.bg200,
  },
  iconContainer: {
    // Styled via inline
  },
  initialsContainer: {
    // Styled via inline
  },
  initials: {
    fontFamily: 'Barlow-Bold',
    textAlign: 'center',
  },
});
