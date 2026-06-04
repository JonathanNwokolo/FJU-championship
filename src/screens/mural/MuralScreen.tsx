import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';

import { colors } from '../../theme/colors';
import { MuralPost } from '../../types';
import { useMuralPosts } from '../../hooks/useMuralPosts';
import { useAuthStore } from '../../stores/authStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { createPost } from '../../services/muralService';
import { isFirebaseConfigured } from '../../services/firebase';
import { markMuralVisited } from '../../hooks/useMuralBadge';
import { MuralStackParamList } from '../../navigation/MuralStackNavigator';
import { AppButton } from '../../components/AppButton';

const CHAMP_ID = 'champ-001';
const SCREEN_WIDTH = Dimensions.get('window').width;
const TILE_SIZE = SCREEN_WIDTH / 2;

type NavProp = NativeStackNavigationProp<MuralStackParamList, 'MuralMain'>;

// ── Round filter chip ─────────────────────────────────────────────────────────

function RoundChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Photo tile ────────────────────────────────────────────────────────────────

function PhotoTile({ post, onPress }: { post: MuralPost; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.tile}>
      <Image source={{ uri: post.imageUrl }} style={styles.tileImage} resizeMode="cover" />
      {post.likesCount > 0 && (
        <View style={styles.tileLikeOverlay}>
          <Ionicons name="heart" size={11} color="#fff" />
          <Text style={styles.tileLikeCount}>{post.likesCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Shimmer placeholder tile ──────────────────────────────────────────────────

function TilePlaceholder() {
  return <View style={[styles.tile, styles.tilePlaceholder]} />;
}

// ── Post create bottom sheet content ─────────────────────────────────────────

interface CreateSheetProps {
  rounds: number[];
  onPublish: (imageUri: string, caption: string, round: number) => Promise<void>;
  onClose: () => void;
  isPublishing: boolean;
}

function PostCreateContent({ rounds, onPublish, onClose, isPublishing }: CreateSheetProps) {
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedRound, setSelectedRound] = useState(0);

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images' as ImagePicker.MediaType],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setSelectedUri(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images' as ImagePicker.MediaType],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setSelectedUri(result.assets[0].uri);
  }

  function handlePublish() {
    if (!selectedUri) return;
    onPublish(selectedUri, caption, selectedRound);
  }

  return (
    <View style={styles.sheetContent}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>Compartilhar momento</Text>

      {/* Media pickers */}
      {!selectedUri ? (
        <View style={styles.pickerRow}>
          <TouchableOpacity style={styles.pickerBtn} onPress={pickFromCamera} activeOpacity={0.8}>
            <Ionicons name="camera" size={28} color={colors.accent} />
            <Text style={styles.pickerLabel}>Câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerBtn} onPress={pickFromGallery} activeOpacity={0.8}>
            <Ionicons name="images" size={28} color={colors.accent} />
            <Text style={styles.pickerLabel}>Galeria</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Preview */}
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedUri }} style={styles.previewImage} resizeMode="cover" />
            <TouchableOpacity
              style={styles.previewRemove}
              onPress={() => setSelectedUri(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Caption */}
          <Text style={styles.fieldLabel}>Legenda</Text>
          <BottomSheetTextInput
            style={styles.captionInput}
            placeholder="Adicione uma legenda..."
            placeholderTextColor="#B0B0B0"
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
            multiline
          />
          <Text style={styles.charCount}>{caption.length}/200</Text>

          {/* Round selector */}
          <Text style={styles.fieldLabel}>Rodada (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roundScroll}>
            <View style={styles.roundChipsRow}>
              <RoundChip
                label="Geral"
                active={selectedRound === 0}
                onPress={() => setSelectedRound(0)}
              />
              {rounds.map((r) => (
                <RoundChip
                  key={r}
                  label={`Rodada ${r}`}
                  active={selectedRound === r}
                  onPress={() => setSelectedRound(r)}
                />
              ))}
            </View>
          </ScrollView>

          {/* Publish */}
          <AppButton
            title={isPublishing ? 'Publicando...' : 'Publicar'}
            onPress={handlePublish}
            loading={isPublishing}
            disabled={!selectedUri || isPublishing}
            fullWidth
            style={styles.publishBtn}
          />
        </>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function MuralScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const { matches } = useMatchStore();
  const { teams, players } = useTeamStore();

  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);
  const [isPublishing, setIsPublishing] = useState(false);

  const sheetRef = useRef<BottomSheet>(null);
  const sheetSnapPoints = useMemo(() => ['88%'], []);

  const { posts, loading } = useMuralPosts(CHAMP_ID, selectedRound);

  useFocusEffect(
    useCallback(() => {
      markMuralVisited(CHAMP_ID);
    }, []),
  );

  const rounds = useMemo(() => {
    const champMatches = matches.filter((m) => m.championshipId === CHAMP_ID);
    return [...new Set(champMatches.map((m) => m.round))].sort((a, b) => a - b);
  }, [matches]);

  const canPost = user?.role === 'organizador' || user?.role === 'capitao' || user?.role === 'atleta';

  const myTeamId = useMemo(() => {
    if (!user) return '';
    if (user.role === 'atleta') {
      return players.find((p) => p.userId === user.id)?.teamId ?? '';
    }
    if (user.role === 'capitao') {
      return teams.find((t) => t.captainId === user.id)?.id ?? '';
    }
    return teams[0]?.id ?? '';
  }, [user, players, teams]);

  function openSheet() {
    sheetRef.current?.expand();
  }

  function closeSheet() {
    sheetRef.current?.close();
  }

  async function handlePublish(imageUri: string, caption: string, round: number) {
    if (!user) return;
    setIsPublishing(true);
    try {
      await createPost(CHAMP_ID, round, user.id, user.name, myTeamId, imageUri, caption);
      closeSheet();
    } catch (e) {
      console.warn('[MuralScreen] createPost error:', e);
    } finally {
      setIsPublishing(false);
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: MuralPost }) => (
      <PhotoTile post={item} onPress={() => navigation.navigate('PhotoDetail', { post: item })} />
    ),
    [navigation],
  );

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.55} />
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Hero header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Mural</Text>
          <Text style={styles.headerSub}>Copa Tribo de Judá 2026</Text>
        </View>
        <Ionicons name="camera" size={28} color={colors.accent} />
      </View>

      {/* Round filter */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          <RoundChip
            label="Todos"
            active={selectedRound === undefined}
            onPress={() => setSelectedRound(undefined)}
          />
          {rounds.map((r) => (
            <RoundChip
              key={r}
              label={`Rodada ${r}`}
              active={selectedRound === r}
              onPress={() => setSelectedRound(r)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Photo grid */}
      {!isFirebaseConfigured ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyIcon}>🔧</Text>
          <Text style={styles.emptyTitle}>Firebase não configurado</Text>
          <Text style={styles.emptyDesc}>
            Preencha as credenciais em src/services/firebase.ts para ativar o mural.
          </Text>
        </View>
      ) : loading ? (
        <FlatList
          data={[1, 2, 3, 4, 5, 6]}
          keyExtractor={(i) => String(i)}
          numColumns={2}
          renderItem={() => <TilePlaceholder />}
          scrollEnabled={false}
        />
      ) : posts.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyIcon}>📸</Text>
          <Text style={styles.emptyTitle}>Nenhuma foto ainda</Text>
          <Text style={styles.emptyDesc}>
            {canPost
              ? 'Toque no + para compartilhar o primeiro momento!'
              : 'Aguarde os atletas compartilharem fotos do campeonato.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={2}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gridContent}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* FAB */}
      {canPost && (
        <TouchableOpacity style={styles.fab} onPress={openSheet} activeOpacity={0.85}>
          <Ionicons name="add" size={30} color={colors.textOnAccent} />
        </TouchableOpacity>
      )}

      {/* Post creation bottom sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleComponent={() => null}
        backgroundStyle={styles.sheetBg}
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PostCreateContent
            rounds={rounds}
            onPublish={handlePublish}
            onClose={closeSheet}
            isPublishing={isPublishing}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primaryDark,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: { gap: 2 },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textOnDark,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Filter bar
  filterBar: {
    backgroundColor: colors.background,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },

  // Chips
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: `${colors.accent}18`,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },

  // Grid
  gridContent: {
    backgroundColor: colors.background,
  },

  // Photo tile
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    backgroundColor: colors.surface,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileLikeOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tileLikeCount: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },

  // Placeholder tile
  tilePlaceholder: {
    opacity: 0.4,
  },

  // Empty / unconfigured state
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.background,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      default: {
        shadowColor: colors.accent,
        shadowOpacity: 0.45,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 8,
      },
      web: {},
    }),
  },

  // Bottom sheet
  sheetBg: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },

  // Media picker buttons
  pickerRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  pickerBtn: {
    flex: 1,
    height: 100,
    backgroundColor: colors.surface,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pickerLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },

  // Image preview
  previewContainer: { borderRadius: 16, overflow: 'hidden', height: 260, position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  previewRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 13,
  },

  // Form
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  captionInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    minHeight: 80,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1.5,
    borderColor: 'transparent',
    textAlignVertical: 'top' as const,
  },
  charCount: { fontSize: 12, color: colors.textSecondary, textAlign: 'right', marginTop: -4 },

  // Round chips row in sheet
  roundScroll: { flexGrow: 0 },
  roundChipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },

  // Publish button
  publishBtn: { marginTop: 4 },
});
