import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type NavigationProp,
  type ParamListBase,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/platform/haptics';
import { useFeedback } from '@/ui/feedback/store';
import { breakpoints, motion, space, useTheme } from '@/ui/theme';
import type { IconName } from '@/ui/icons';
import { NavDestination } from './NavItems';

export type AdaptiveTabOptions = { title: string; icon: IconName };

type EventMap = { tabPress: { data: undefined; canPreventDefault: true } };

type Props = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  AdaptiveTabOptions,
  EventMap,
  NavigationProp<ParamListBase>
> &
  TabRouterOptions;

const BAR_HEIGHT = 80;

/**
 * Top-level destinations. Phones: bottom navigation bar. ≥600dp: navigation rail on the left.
 * Screens mount on first visit and stay mounted (scroll position, search text survive tab switches).
 */
function AdaptiveTabsNavigator({ id, initialRouteName, backBehavior = 'firstRoute', children, screenOptions }: Props) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    AdaptiveTabOptions,
    EventMap
  >(TabRouter, { id, initialRouteName, backBehavior, children, screenOptions });

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, reduceMotion } = useTheme();
  const rail = width >= breakpoints.medium;
  const setObstruction = useFeedback(s => s.setBottomObstruction);
  const [visited, setVisited] = useState<Set<string>>(() => new Set([state.routes[state.index]!.key]));

  const activeKey = state.routes[state.index]!.key;
  useEffect(() => {
    setVisited(v => (v.has(activeKey) ? v : new Set(v).add(activeKey)));
  }, [activeKey]);

  useEffect(() => {
    setObstruction(rail ? 0 : BAR_HEIGHT + insets.bottom);
    return () => setObstruction(0);
  }, [rail, insets.bottom, setObstruction]);

  const go = (routeKey: string, routeName: string) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true, data: undefined });
    if (!event.defaultPrevented && routeKey !== activeKey) {
      haptic('tick');
      navigation.navigate(routeName);
    }
  };

  const destinations = state.routes.map((route, i) => {
    const { title, icon } = descriptors[route.key]!.options;
    return (
      <NavDestination
        key={route.key}
        item={{ key: route.key, label: title, icon }}
        active={i === state.index}
        onPress={() => go(route.key, route.name)}
        orientation={rail ? 'rail' : 'bar'}
      />
    );
  });

  return (
    <NavigationContent>
      <View style={[styles.root, { flexDirection: rail ? 'row' : 'column', backgroundColor: colors.canvas }]}>
        {rail && (
          <View
            accessibilityRole="tablist"
            style={[styles.rail, { paddingTop: insets.top + space.xxl, paddingLeft: insets.left, backgroundColor: colors.canvas, borderRightColor: colors.borderSubtle }]}
          >
            {destinations}
          </View>
        )}
        <View style={styles.content}>
          {state.routes.map(route => {
            if (!visited.has(route.key)) return null;
            const focused = route.key === activeKey;
            return (
              <View key={route.key} style={[StyleSheet.absoluteFill, !focused && styles.hidden]} importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}>
                {focused && !reduceMotion ? (
                  <Animated.View key={`${route.key}-in`} entering={FadeIn.duration(motion.duration.base)} style={styles.fill}>
                    {descriptors[route.key]!.render()}
                  </Animated.View>
                ) : (
                  descriptors[route.key]!.render()
                )}
              </View>
            );
          })}
        </View>
        {!rail && (
          <View
            accessibilityRole="tablist"
            style={[styles.bar, { height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom, backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}
          >
            {destinations}
          </View>
        )}
      </View>
    </NavigationContent>
  );
}

export const createAdaptiveTabs = createNavigatorFactory(AdaptiveTabsNavigator);

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  content: { flex: 1 },
  hidden: { display: 'none' },
  rail: { width: 88, alignItems: 'center', gap: space.md, borderRightWidth: StyleSheet.hairlineWidth },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
});
