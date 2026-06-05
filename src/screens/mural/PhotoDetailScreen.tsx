import React, { useCallback } from 'react';
import {
  Dimensions,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../theme/colors';
import { MuralPost } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { usePostLikes } from '../../hooks/usePostLikes';
import { toggleLike, deletePost } from '../../services/muralService';
import { MuralStackParamList } from '../../navigation/MuralStackNavigator';

type RouteType = RouteProp<MuralStackParamList, 'PhotoDetail'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function PhotoDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { post } = route.params;

  const user = useAuthStore((s) => s.user);
  const champId = useChampionshipStore((s) => s.selectedChampionshipId) ?? '';
  const { teams } = useTeamStore();
  const { count: likesCount, hasLiked } = usePostLikes(post.id);

  const teamColor = teams.find((t) => t.id === post.teamId)?.primaryColor ?? colors.accent;

  const canDelete =
    user?.id === post.authorId || user?.role === 'organizador';

  // ── Pinch-to-zoom ────────────────────────────────────────────────────────

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      }
    });

  // Double-tap to toggle zoom
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  // Single tap on overlay → go back
  const singleTap = Gesture.Tap().onEnd(() => {
    navigation.goBack();
  });

  const composed = Gesture.Exclusive(
    Gesture.Simultaneous(pinch, doubleTap),
    singleTap,
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleLike = useCallback(async () => {
    if (!user) return;
    try {
      await toggleLike(post.id, user.id);
    } catch (e) {
      console.warn('[PhotoDetail] toggleLike error:', e);
    }
  }, [post.id, user]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: post.caption
          ? `${post.authorName}: "${post.caption}"\n${post.imageUrl}`
          : `Foto de ${post.authorName}\n${post.imageUrl}`,
        url: post.imageUrl,
      });
    } catch (e) {
      console.warn('[PhotoDetail] share error:', e);
    }
  }, [post]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Excluir foto',
      'Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost(post.id, champId);
              navigation.goBack();
            } catch (e) {
              console.warn('[PhotoDetail] deletePost error:', e);
            }
          },
        },
      ],
    );
  }, [post.id, navigation]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Image with zoom gestures */}
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.imageContainer, imageStyle]}>
          <Animated.Image
            source={{ uri: post.imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </Animated.View>
      </GestureDetector>

      {/* Close button */}
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Bottom gradient overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={styles.overlay}
        pointerEvents="box-none"
      >
        {/* Author row */}
        <View style={styles.authorRow}>
          <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
          <Text style={styles.authorName}>{post.authorName}</Text>
        </View>

        {/* Caption */}
        {!!post.caption && (
          <Text style={styles.caption} numberOfLines={3}>
            {post.caption}
          </Text>
        )}

        {/* Meta */}
        <View style={styles.metaRow}>
          {post.round > 0 && (
            <View style={styles.roundBadge}>
              <Text style={styles.roundBadgeText}>Rodada {post.round}</Text>
            </View>
          )}
          <Text style={styles.dateMeta}>{formatDate(post.createdAt)}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {/* Like */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.75}>
            <Ionicons
              name={hasLiked ? 'heart' : 'heart-outline'}
              size={26}
              color={hasLiked ? colors.danger : '#fff'}
            />
            {likesCount > 0 && (
              <Text style={[styles.actionCount, hasLiked && styles.actionCountLiked]}>
                {likesCount}
              </Text>
            )}
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.75}>
            <Ionicons name="share-social-outline" size={26} color="#fff" />
          </TouchableOpacity>

          {/* Delete — só autor ou organizador */}
          {canDelete && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} activeOpacity={0.75}>
              <Ionicons name="trash-outline" size={24} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Image
  imageContainer: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },

  // Close
  safeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    margin: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom overlay
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 20,
    gap: 8,
  },

  // Author
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Caption
  caption: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },

  // Meta
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  roundBadge: {
    backgroundColor: `${colors.accent}30`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${colors.accent}60`,
  },
  roundBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  dateMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  actionCountLiked: {
    color: colors.danger,
  },
});
