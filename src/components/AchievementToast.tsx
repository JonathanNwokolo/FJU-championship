import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { AchievementDefinition } from '../types';
import { RARITY_ORDER } from '../utils/achievementDefinitions';

interface Props {
  queue: AchievementDefinition[];
  onDismiss?: () => void;
}

const DISPLAY_MS = 3000;
const GAP_MS = 500;

export function AchievementToast({ queue, onDismiss }: Props) {
  const [current, setCurrent] = useState<AchievementDefinition | null>(null);
  const [index, setIndex] = useState(0);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const showNext = (idx: number) => {
    if (idx >= queue.length) {
      onDismiss?.();
      return;
    }
    setCurrent(queue[idx]);
    opacity.value = 0;
    translateY.value = 40;

    // Slide in
    opacity.value = withTiming(1, { duration: 300 });
    translateY.value = withTiming(0, { duration: 300 });

    // Auto dismiss after DISPLAY_MS
    timer.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 250 });
      translateY.value = withDelay(50, withTiming(20, { duration: 250 }));
      timer.current = setTimeout(() => {
        setIndex(idx + 1);
      }, GAP_MS);
    }, DISPLAY_MS);
  };

  useEffect(() => {
    if (queue.length === 0) return;
    setIndex(0);
  }, [queue]);

  useEffect(() => {
    clearTimer();
    if (queue.length > 0) {
      showNext(index);
    }
    return clearTimer;
  }, [index, queue]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!current || queue.length === 0) return null;

  const bg = current.rarityColor;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <View style={[styles.toast, { borderColor: bg }]}>
        <View style={[styles.iconBg, { backgroundColor: `${bg}33` }]}>
          <Text style={styles.icon}>{current.icon}</Text>
        </View>
        <View style={styles.textArea}>
          <Text style={[styles.label, { color: bg }]}>CONQUISTA DESBLOQUEADA</Text>
          <Text style={styles.name}>{current.name}</Text>
          <Text style={styles.desc} numberOfLines={2}>{current.description}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B2838',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    fontSize: 30,
  },
  textArea: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  desc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
  },
});
