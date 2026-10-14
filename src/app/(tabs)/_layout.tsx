import { Tabs } from 'expo-router';

import { BottomNav, type TabKey } from '@/components/myroute/bottom-nav';

/** Order of the tab routes, used to resolve the active bar item. */
const TAB_ORDER: TabKey[] = ['explore', 'saved', 'requests', 'profile'];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state }) => <BottomNav active={TAB_ORDER[state.index] ?? 'explore'} />}>
      <Tabs.Screen name="index" options={{ title: 'Explore' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
