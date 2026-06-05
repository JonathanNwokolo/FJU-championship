import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { listenToNotifications, markAllAsRead, markAsRead } from '../../services/inAppNotifications';
import { InAppNotification, InAppNotificationType } from '../../types';
import { colors } from '../../theme/colors';

const TYPE_META: Record<InAppNotificationType, { icon: string; color: string }> = {
  goal: { icon: '⚽', color: colors.accent },
  match_started: { icon: '🏟️', color: colors.neon },
  match_finished: { icon: '🔚', color: colors.textSecondary as string },
  match_scheduled: { icon: '📅', color: colors.success },
  team_approved: { icon: '✅', color: colors.success },
  team_rejected: { icon: '❌', color: colors.danger },
  join_request: { icon: '📨', color: colors.accent },
  join_request_approved: { icon: '✅', color: colors.success },
  join_request_rejected: { icon: '❌', color: colors.danger },
};

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}min atras`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h atras`;
    const days = Math.floor(hours / 24);
    return `${days}d atras`;
  } catch {
    return '';
  }
}

function NotificationRow({
  item,
  onPress,
}: {
  item: InAppNotification;
  onPress: (id: string) => void;
}) {
  const meta = TYPE_META[item.type] ?? { icon: '🔔', color: colors.accent };

  return (
    <Pressable style={[styles.row, !item.read && styles.rowUnread]} onPress={() => onPress(item.id)}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}20` }]}>
        <Text style={styles.icon}>{meta.icon}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, !item.read && styles.rowTitleBold]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{formatRelative(item.createdAt)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

export function NotificationCenterScreen() {
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = listenToNotifications(user.id, (data) => {
      setNotifications(data);
      setLoading(false);
    });
    return unsub;
  }, [user?.id]);

  const handlePress = useCallback(async (id: string) => {
    await markAsRead(id);
  }, []);

  const handleMarkAll = useCallback(async () => {
    if (!user?.id) return;
    await markAllAsRead(user.id);
  }, [user?.id]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificacoes</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAll} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Ler tudo</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>Nenhuma notificacao</Text>
          <Text style={styles.emptyDesc}>Gols, resultados e solicitacoes aparecerao aqui.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationRow item={item} onPress={handlePress} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  list: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: colors.bg100,
  },
  rowUnread: {
    backgroundColor: colors.bg200,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    fontSize: 20,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowTitleBold: {
    fontFamily: 'Barlow-Bold',
  },
  rowBody: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  rowTime: {
    marginTop: 4,
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 4,
    flexShrink: 0,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
