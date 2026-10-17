import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasBackend } from '@/lib/api';
import { Icon } from '@/components/myroute/icon';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  RoundButton,
  SheetHandle,
  Tap,
  TextField,
  TopBar,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import {
  COMMUNITY_THREAD_ID,
  COMMUNITY_THREAD_TITLE,
  deviceId,
  formatChatTime,
  loadMessages,
  sendLocation,
  sendText,
  syncMessages,
  type ChatMessage,
} from '@/lib/chat';
import { getCurrentCoords } from '@/lib/location';

/** How often to ask the Worker for new messages when a backend is configured. */
const POLL_MS = 6000;

export default function ThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; title?: string }>();
  const threadId =
    typeof params.id === 'string' && params.id.length > 0 ? params.id : COMMUNITY_THREAD_ID;
  const title =
    typeof params.title === 'string' && params.title.length > 0
      ? params.title
      : COMMUNITY_THREAD_TITLE;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myId, setMyId] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Load what is on the device, then ask the Worker for anything newer.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await syncMessages(threadId);
      if (active) {
        setMessages(next);
      }
    };

    void deviceId().then((id) => {
      if (active) {
        setMyId(id);
      }
    });
    void loadMessages(threadId).then((local) => {
      if (active) {
        setMessages(local);
      }
    });
    void refresh();

    const timer = hasBackend ? setInterval(() => void refresh(), POLL_MS) : null;
    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [threadId]);

  // Keep the newest message in view.
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) {
      return;
    }
    setDraft('');
    setNotice(null);
    const message = await sendText(threadId, body);
    setMessages((current) => [...current, message]);
  };

  const shareLocation = async () => {
    const coords = await getCurrentCoords();
    if (!coords) {
      setNotice('We could not read your location yet — check the location permission.');
      return;
    }
    setNotice(null);
    const message = await sendLocation(threadId, coords, 'My current location');
    setMessages((current) => [...current, message]);
  };

  const openOnMap = (message: ChatMessage) => {
    if (message.latitude == null || message.longitude == null) {
      return;
    }
    router.push({
      pathname: '/place',
      params: {
        name: 'Shared location',
        lat: String(message.latitude),
        lng: String(message.longitude),
        area: 'Shared in chat',
      },
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TopBar
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/chat'))}
          title={title}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
        showsVerticalScrollIndicator={false}>
        <SheetHandle />

        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Icon color={Palette.green} name="chat" size={26} />
            <AppText size={13} weight="bold">
              No messages yet
            </AppText>
            <AppText color="muted" size={11} style={styles.emptyText}>
              Say hello, or share your location so the other person can find you.
            </AppText>
          </View>
        ) : null}

        {messages.map((message) => {
          const mine = message.authorId !== '' && message.authorId === myId;

          if (message.kind === 'location') {
            return (
              <Tap
                accessibilityLabel="Open shared location on the map"
                key={message.id}
                onPress={() => openOnMap(message)}
                style={[styles.locationCard, mine && styles.locationCardMine]}>
                <View style={styles.locationIcon}>
                  <Icon color={Palette.green} name="pin" size={18} />
                </View>
                <View style={styles.locationCopy}>
                  <AppText size={12} weight="bold">
                    {message.body}
                  </AppText>
                  <AppText color="muted" size={10}>
                    {message.latitude?.toFixed(5)}, {message.longitude?.toFixed(5)} · tap to open
                  </AppText>
                </View>
                <Icon color={Palette.muted} name="chevron" size={16} />
              </Tap>
            );
          }

          return (
            <View
              key={message.id}
              style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!mine ? (
                  <AppText color="greenDark" size={10} style={styles.author} weight="bold">
                    {message.authorName || 'Neighbour'}
                  </AppText>
                ) : null}
                <AppText color={mine ? 'white' : 'ink'} size={13}>
                  {message.body}
                </AppText>
                <AppText color={mine ? 'white' : 'muted'} size={9} style={styles.time}>
                  {formatChatTime(message.createdAt)}
                </AppText>
              </View>
            </View>
          );
        })}

        {notice ? (
          <AppText color="red" size={11} style={styles.notice}>
            {notice}
          </AppText>
        ) : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
        <BareIconButton
          accessibilityLabel="Share my location"
          color={Palette.blue}
          icon="pin"
          onPress={() => void shareLocation()}
        />
        <TextField
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          placeholder="Message"
          style={styles.input}
          value={draft}
        />
        <RoundButton
          accessibilityLabel="Send message"
          icon="send"
          onPress={() => void submit()}
          size={42}
          tone="green"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8F6' },
  header: { paddingHorizontal: 12, backgroundColor: Palette.surface },
  list: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  empty: {
    marginTop: 40,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyText: { textAlign: 'center', lineHeight: 16 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    gap: 2,
  },
  bubbleMine: { backgroundColor: Palette.green, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: Palette.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Palette.line,
  },
  author: { marginBottom: 1 },
  time: { opacity: 0.8, alignSelf: 'flex-end' },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '85%',
    padding: 11,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  locationCardMine: { alignSelf: 'flex-end', borderColor: '#BDE1CA', backgroundColor: '#F2FBF5' },
  locationIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.greenSoft,
  },
  locationCopy: { flex: 1, gap: 1 },
  notice: { marginTop: 6, textAlign: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Palette.line,
    backgroundColor: Palette.surface,
  },
  input: { flex: 1, height: 44, borderRadius: Radius.xl },
});
