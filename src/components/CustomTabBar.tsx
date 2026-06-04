import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useMuralBadge } from '../hooks/useMuralBadge';
import { useLiveMatch } from '../hooks/useLiveMatch';

const CHAMP_ID = 'champ-001';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  'Início': { active: 'home', inactive: 'home-outline' },
  'Confrontos': { active: 'calendar', inactive: 'calendar-outline' },
  'Mural': { active: 'camera', inactive: 'camera-outline' },
  'Classificação': { active: 'trophy', inactive: 'trophy-outline' },
  'Artilheiros': { active: 'football', inactive: 'football-outline' },
  'Mais': { active: 'stats-chart', inactive: 'stats-chart-outline' },
};

function TabItem({
  routeName,
  focused,
  onPress,
  onLongPress,
  showBadge,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  showBadge: boolean;
}) {
  const scale = useSharedValue(1);
  const config = TAB_CONFIG[routeName] ?? {
    active: 'apps' as IoniconName,
    inactive: 'apps-outline' as IoniconName,
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(
      withTiming(1.2, { duration: 80 }),
      withSpring(1.0, { stiffness: 280, damping: 18 }),
    );
    onPress();
  }, [onPress]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabItem}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={routeName}
      accessibilityState={{ selected: focused }}
    >
      {focused && <View style={styles.activeBar} />}
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <View style={styles.iconWrapper}>
          <Ionicons
            name={focused ? config.active : config.inactive}
            size={focused ? 26 : 22}
            color={focused ? colors.accent : colors.textMuted}
          />
          {showBadge && <View style={styles.badge} />}
        </View>
        {focused && <View style={styles.activeDot} />}
      </Animated.View>
      <Text
        style={[
          styles.label,
          { color: focused ? colors.accent : colors.textMuted },
          focused && styles.labelActive,
        ]}
        numberOfLines={1}
      >
        {routeName}
      </Text>
    </TouchableOpacity>
  );
}

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const muralHasNew = useMuralBadge(CHAMP_ID);
  const hasLiveMatch = useLiveMatch(CHAMP_ID);

  const showBadge = useCallback(
    (name: string) => {
      if (name === 'Mural') return muralHasNew;
      if (name === 'Confrontos') return hasLiveMatch;
      return false;
    },
    [muralHasNew, hasLiveMatch],
  );

  const safeBottom = insets.bottom;

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: safeBottom, height: 72 + safeBottom },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabItem
            key={route.key}
            routeName={route.name}
            focused={focused}
            onPress={onPress}
            onLongPress={onLongPress}
            showBadge={showBadge(route.name)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.bg200,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    alignItems: 'flex-start',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 4,
    position: 'relative',
  },
  activeBar: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: colors.accent,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  iconContainer: {
    alignItems: 'center',
  },
  iconWrapper: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.bg200,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Barlow-Medium',
    marginTop: 2,
  },
  labelActive: {
    fontFamily: 'Barlow-SemiBold',
  },
});
