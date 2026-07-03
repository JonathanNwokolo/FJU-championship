import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PendingItem, PendingItemSeverity, PENDING_SEVERITY_LABELS } from '../types/pending';
import { colors } from '../theme/colors';

// ── Cores e ícones por severidade ─────────────────────────────────────────────

type SeverityStyle = { bg: string; border: string; accent: string; icon: string };

const SEVERITY_CONFIG: Record<PendingItemSeverity, SeverityStyle> = {
  critical: {
    bg: 'rgba(255,59,71,0.08)',
    border: 'rgba(255,59,71,0.30)',
    accent: colors.danger,
    icon: 'alert-circle',
  },
  high: {
    bg: 'rgba(245,166,35,0.08)',
    border: 'rgba(245,166,35,0.28)',
    accent: colors.warning,
    icon: 'alert',
  },
  medium: {
    bg: 'rgba(0,212,255,0.06)',
    border: 'rgba(0,212,255,0.20)',
    accent: colors.neon,
    icon: 'information',
  },
  low: {
    bg: 'rgba(255,255,255,0.04)',
    border: colors.border,
    accent: colors.textSecondary,
    icon: 'information-outline',
  },
  info: {
    bg: 'rgba(255,255,255,0.03)',
    border: colors.border,
    accent: colors.textMuted,
    icon: 'circle-outline',
  },
};

function formatDeadline(dueAt?: string, tag?: string): string | null {
  if (!tag || tag === 'no_deadline' || !dueAt) return null;
  if (tag === 'overdue') return 'Vencido';
  if (tag === 'today') return 'Hoje';
  if (tag === 'within_24h') return 'Menos de 24h';
  if (tag === 'within_72h') {
    try {
      const d = new Date(dueAt);
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const month = d.toLocaleDateString('pt-BR', { month: 'short' });
      return `${day} ${month} · ${h}h${m}`;
    } catch {
      return null;
    }
  }
  return null;
}

interface Props {
  item: PendingItem;
  onPress?: () => void;
  testID?: string;
}

export function PendingItemCard({ item, onPress, testID }: Props) {
  const cfg = SEVERITY_CONFIG[item.severity];
  const deadlineText = formatDeadline(item.dueAt, item.deadlineTag);
  const severityLabel = PENDING_SEVERITY_LABELS[item.severity];

  const cardContent = (
    <View
      style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${item.title}. ${item.description}. Severidade: ${severityLabel}.${deadlineText ? ` Prazo: ${deadlineText}.` : ''}${item.actionLabel ? ` Ação: ${item.actionLabel}.` : ''}`}
      testID={testID}
    >
      {/* Linha de acento esquerda */}
      <View style={[styles.accentBar, { backgroundColor: cfg.accent }]} />

      {/* Ícone */}
      <View style={[styles.iconWrap, { backgroundColor: `${cfg.accent}18` }]}>
        <MaterialCommunityIcons
          name={cfg.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
          size={20}
          color={cfg.accent}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>

      {/* Conteúdo central */}
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {/* Severidade textual — não depende só de cor */}
          <Text style={[styles.severityTag, { color: cfg.accent }]}>
            {severityLabel.toUpperCase()}
          </Text>
        </View>

        <Text style={styles.description} numberOfLines={3}>{item.description}</Text>

        {/* Contexto opcional */}
        {(item.championshipName || item.teamName || deadlineText) && (
          <View style={styles.metaRow}>
            {item.championshipName && (
              <Text style={styles.metaText} numberOfLines={1}>
                {item.championshipName}
              </Text>
            )}
            {item.teamName && (
              <>
                {item.championshipName && <Text style={styles.metaDot}>·</Text>}
                <Text style={styles.metaText} numberOfLines={1}>{item.teamName}</Text>
              </>
            )}
            {deadlineText && (
              <>
                {(item.championshipName || item.teamName) && (
                  <Text style={styles.metaDot}>·</Text>
                )}
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={11}
                  color={item.deadlineTag === 'overdue' ? colors.danger : colors.textMuted}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text
                  style={[
                    styles.metaText,
                    item.deadlineTag === 'overdue' && { color: colors.danger },
                  ]}
                >
                  {deadlineText}
                </Text>
              </>
            )}
          </View>
        )}

        {/* CTA */}
        {item.actionLabel && onPress && (
          <Text style={[styles.cta, { color: cfg.accent }]}>
            {item.actionLabel} ›
          </Text>
        )}
      </View>

      {/* Chevron */}
      {onPress && (
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={colors.textMuted}
          style={styles.chevron}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
    </View>
  );

  if (!onPress) return cardContent;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: `${cfg.accent}20` }}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      {cardContent}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 14,
  },
  pressed: {
    opacity: 0.82,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 72,
    paddingVertical: 14,
    paddingRight: 12,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  severityTag: {
    fontFamily: 'Barlow-Bold',
    fontSize: 9,
    letterSpacing: 0.6,
    paddingTop: 1,
  },
  description: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
    marginTop: 2,
  },
  metaText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textMuted,
  },
  metaDot: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.textMuted,
  },
  cta: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    alignSelf: 'center',
    marginLeft: 4,
  },
});
