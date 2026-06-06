import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { TEAM_SHIELDS } from '../data/teamShields';
import { colors } from '../theme/colors';

type SelectionType =
  | { type: 'preset'; id: string }
  | { type: 'custom'; url: string };

interface Props {
  primaryColor: string;
  selectedPreset?: string;
  selectedLogoUrl?: string;
  onSelect: (selection: SelectionType) => void;
  onUploadImage?: (localUri: string) => Promise<string>;
}

/**
 * TeamShieldPicker - Grid for selecting team shields or custom image
 */
export function TeamShieldPicker({
  primaryColor,
  selectedPreset,
  selectedLogoUrl,
  onSelect,
  onUploadImage,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const teamColor = primaryColor || colors.accent;

  const handlePickImage = async () => {
    if (!onUploadImage) {
      Toast.show({
        type: 'info',
        text1: 'Upload indisponivel',
        text2: 'Selecione um dos escudos disponiveis.',
        visibilityTime: 2500,
      });
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Toast.show({
        type: 'error',
        text1: 'Permissao negada',
        text2: 'Permita acesso a galeria nas configuracoes.',
        visibilityTime: 2500,
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setUploading(true);
    try {
      const url = await onUploadImage(result.assets[0].uri);
      onSelect({ type: 'custom', url });
      Toast.show({
        type: 'success',
        text1: 'Logo enviado!',
        visibilityTime: 1800,
      });
    } catch (error) {
      console.warn('[TeamShieldPicker] upload failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Falha no upload',
        text2: 'Tente novamente.',
        visibilityTime: 2500,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Custom image button */}
        <TouchableOpacity
          style={[
            styles.shieldItem,
            selectedLogoUrl && styles.shieldItemSelected,
          ]}
          onPress={handlePickImage}
          disabled={uploading}
          activeOpacity={0.7}
        >
          {uploading ? (
            <View style={[styles.shieldCircle, { backgroundColor: `${teamColor}22` }]}>
              <ActivityIndicator size="small" color={teamColor} />
            </View>
          ) : selectedLogoUrl ? (
            <Image
              source={{ uri: selectedLogoUrl }}
              style={[styles.shieldCircle, styles.customImage]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.shieldCircle, { backgroundColor: colors.bg300 }]}>
              <MaterialCommunityIcons name="camera-plus" size={24} color={colors.textMuted} />
            </View>
          )}
          <Text style={styles.shieldLabel}>Foto</Text>
        </TouchableOpacity>

        {/* Preset shields */}
        {TEAM_SHIELDS.map((shield) => {
          const isSelected = selectedPreset === shield.id && !selectedLogoUrl;
          return (
            <TouchableOpacity
              key={shield.id}
              style={[styles.shieldItem, isSelected && styles.shieldItemSelected]}
              onPress={() => onSelect({ type: 'preset', id: shield.id })}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.shieldCircle,
                  { backgroundColor: `${teamColor}22` },
                  isSelected && { transform: [{ scale: 1.08 }] },
                ]}
              >
                <MaterialCommunityIcons
                  name={shield.icon as any}
                  size={28}
                  color={teamColor}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: 12,
  },
  shieldItem: {
    alignItems: 'center',
    gap: 6,
  },
  shieldItemSelected: {
    // Border handled by shieldCircle
  },
  shieldCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  customImage: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  shieldLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textSecondary,
  },
});
