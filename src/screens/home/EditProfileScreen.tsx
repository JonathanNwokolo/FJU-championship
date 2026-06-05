import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { colors } from '../../theme/colors';
import { POSITION_OPTIONS, POSITION_LABELS, POSITION_COLORS } from '../../utils/constants';
import { uploadUserPhoto, uploadPlayerPhoto } from '../../services/imageUpload';
import { updateDocument } from '../../services/firestore';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { PlayerPosition } from '../../types';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'EditProfile'>;

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function EditProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { players, updatePlayer } = useTeamStore();

  // Find the player record for this user
  const myPlayer = useMemo(
    () => players.find((p) => p.userId === user?.id),
    [players, user?.id]
  );

  const isAthlete = user?.role === 'atleta';

  // Form state
  const [name, setName] = useState(user?.name ?? '');
  const [position, setPosition] = useState<PlayerPosition>(myPlayer?.position ?? 'meia');
  const [shirtNumber, setShirtNumber] = useState(myPlayer?.number?.toString() ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(myPlayer?.photoUrl);
  const [showPositionPicker, setShowPositionPicker] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasChanges = useMemo(() => {
    const nameChanged = name.trim() !== (user?.name ?? '');
    const positionChanged = isAthlete && myPlayer && position !== myPlayer.position;
    const numberChanged = isAthlete && myPlayer && shirtNumber !== (myPlayer.number?.toString() ?? '');
    const photoChanged = photoUrl !== myPlayer?.photoUrl;
    return nameChanged || positionChanged || numberChanged || photoChanged;
  }, [name, position, shirtNumber, photoUrl, user, myPlayer, isAthlete]);

  const handlePickPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à sua galeria para selecionar fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploading(true);
    try {
      const localUri = result.assets[0].uri;

      // Upload for user profile
      const userPhotoUrl = await uploadUserPhoto(localUri, user!.id);

      // If this user has a player record, update that too
      if (myPlayer) {
        const playerPhotoUrl = await uploadPlayerPhoto(localUri, myPlayer.id);
        setPhotoUrl(playerPhotoUrl);
      } else {
        setPhotoUrl(userPhotoUrl);
      }

      Toast.show({
        type: 'success',
        text1: 'Foto atualizada!',
        visibilityTime: 2000,
      });
    } catch (error) {
      console.error('Upload failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Erro ao enviar foto',
        text2: 'Tente novamente mais tarde.',
        visibilityTime: 3000,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Nome é obrigatório', visibilityTime: 2500 });
      return;
    }

    if (isAthlete && myPlayer) {
      const num = parseInt(shirtNumber, 10);
      if (isNaN(num) || num < 1 || num > 99) {
        Toast.show({ type: 'error', text1: 'Número da camisa inválido', text2: 'Use um número de 1 a 99', visibilityTime: 2500 });
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Update Firestore users collection
      await updateDocument('users', user.id, { name: trimmedName });

      // 2. Update Firebase Auth displayName
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }

      // 3. Update local auth state
      setUser({ ...user, name: trimmedName });

      // 4. If athlete with player record, update player too
      if (isAthlete && myPlayer) {
        const playerUpdates: any = {
          name: trimmedName,
          position,
          number: parseInt(shirtNumber, 10),
        };
        if (photoUrl && photoUrl !== myPlayer.photoUrl) {
          playerUpdates.photoUrl = photoUrl;
        }

        await updateDocument('players', myPlayer.id, playerUpdates);
        updatePlayer(myPlayer.id, playerUpdates);
      }

      Toast.show({
        type: 'success',
        text1: 'Perfil atualizado!',
        text2: 'Suas informações foram salvas.',
        visibilityTime: 2500,
      });

      navigation.goBack();
    } catch (error) {
      console.error('Save failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Erro ao salvar',
        text2: 'Tente novamente.',
        visibilityTime: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Perfil</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !hasChanges}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}>
              Salvar
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={handlePickPhoto}
              disabled={uploading}
              style={styles.avatarContainer}
              activeOpacity={0.8}
            >
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(name || user?.name)}</Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <Ionicons name="camera" size={18} color={colors.textOnDark} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Toque para alterar a foto</Text>
          </View>

          {/* Name Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nome completo</Text>
            <AppTextField
              value={name}
              onChangeText={setName}
              placeholder="Seu nome completo"
              autoCapitalize="words"
            />
          </View>

          {/* Athlete-specific fields */}
          {isAthlete && myPlayer && (
            <>
              {/* Position Picker */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Posição</Text>
                <Pressable
                  style={styles.pickerButton}
                  onPress={() => setShowPositionPicker(!showPositionPicker)}
                >
                  <View style={styles.pickerContent}>
                    <View style={[styles.positionDot, { backgroundColor: POSITION_COLORS[position] }]} />
                    <Text style={styles.pickerText}>{POSITION_LABELS[position]}</Text>
                  </View>
                  <Ionicons
                    name={showPositionPicker ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>

                {showPositionPicker && (
                  <View style={styles.positionOptions}>
                    {POSITION_OPTIONS.map((opt) => {
                      const isSelected = position === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          style={[styles.positionOption, isSelected && styles.positionOptionSelected]}
                          onPress={() => {
                            setPosition(opt.value as PlayerPosition);
                            setShowPositionPicker(false);
                          }}
                        >
                          <View style={[styles.positionDot, { backgroundColor: POSITION_COLORS[opt.value] }]} />
                          <Text style={[styles.positionOptionText, isSelected && styles.positionOptionTextSelected]}>
                            {opt.label}
                          </Text>
                          {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Shirt Number */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Número da camisa</Text>
                <AppTextField
                  value={shirtNumber}
                  onChangeText={(text) => setShirtNumber(text.replace(/\D/g, '').slice(0, 2))}
                  placeholder="Ex: 10"
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
  },
  headerTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  saveButton: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 16,
    color: colors.accent,
  },
  saveButtonDisabled: {
    color: colors.textMuted,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bg300,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: 'Barlow-Bold',
    fontSize: 36,
    color: colors.accent,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg100,
  },
  avatarHint: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textMuted,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 16,
    color: colors.textPrimary,
  },
  positionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  positionOptions: {
    marginTop: 8,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  positionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  positionOptionSelected: {
    backgroundColor: colors.accentGlow,
  },
  positionOptionText: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  positionOptionTextSelected: {
    color: colors.accent,
    fontFamily: 'Barlow-SemiBold',
  },
});
