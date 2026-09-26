import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

/** For code outside screens (pedal host, deep links) that needs to navigate or read the route. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
