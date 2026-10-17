import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  IconBadge,
  PrimaryButton,
  SheetHandle,
  Tap,
  TextField,
  TopBar,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import {
  COMMUNITY_THREAD_ID,
  createThread,
  deviceId,
  formatChatTime,
  loadLastMessages,
  loadThreads,
  type ChatMessage,
  type ChatThread,
} from '@/lib/chat';

export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [previews, setPreviews] = useState<Record<string, ChatMessage>>({});
  const [myId, setMyId] = useState('');
  const [draft, setDraft] = useState('');

  const reload = useCallback(async () => {
    const [nextThreads, nextPreviews] = await Promise.all([loadThreads(), loadLastMessages()]);
    setThreads(nextThreads);
    setPreviews(nextPreviews);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void deviceId().then(setMyId);
    }, [reload]),
  );

  const open = useCallback(
    (thread: ChatThread) =>
      router.push({ pathname: '/thread', params: { id: thread.id, title: thread.title } }),
    [router],
  );

  const startChat = useCallback(async () => {
    const title = draft.trim();
    if (!title) {
      return;
    }
    setDraft('');
    const thread = await createThread(title);
    open(thread);
  }, [draft, open]);

  const previewFor = (thread: ChatThread): { text: string; time: string | null } => {
    const last = previews[thread.id];
    if (!last) {
      return { text: 'No messages yet', time: null };
    }
    const time = formatChatTime(last.createdAt);
    if (last.kind === 'location') {
      return { text: last.authorId === myId ? 'You shared a location' : 'Shared a location', time };
    }
    const who = last.authorId === myId ? 'You' : last.authorName || 'Neighbour';
    return { text: `${who}: ${last.body}`, time };
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TopBar
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          title="Messages"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <SheetHandle />

        <View style={styles.list}>
          {threads.map((thread) => {
            const preview = previewFor(thread);
            const active = thread.id === COMMUNITY_THREAD_ID;
            return (
              <Tap
                accessibilityLabel={`Open chat with ${thread.title}`}
                key={thread.id}
                onPress={() => open(thread)}
                style={styles.row}>
                <IconBadge
                  icon={active ? 'chat' : 'user'}
                  size={40}
                  tone={active ? 'green' : 'blue'}
                />
                <View style={styles.rowCopy}>
                  <View style={styles.rowTop}>
                    <AppText numberOfLines={1} size={14} style={styles.rowTitle} weight="bold">
                      {thread.title}
                    </AppText>
                    {preview.time ? (
                      <AppText color="muted" size={10}>
                        {preview.time}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText color="muted" numberOfLines={1} variant="small">
                    {preview.text}
                  </AppText>
                  {active ? (
                    <AppText color="green" variant="tiny">
                      Everyone in your area is in this room
                    </AppText>
                  ) : null}
                </View>
                <Icon name="chevron" size={16} />
              </Tap>
            );
          })}
        </View>

        <View style={styles.newChat}>
          <AppText size={12} weight="bold">
            New chat
          </AppText>
          <AppText color="muted" size={11} style={styles.newChatHint}>
            Start a direct thread — with a neighbour helping you on a request, for example.
          </AppText>
          <View style={styles.newChatRow}>
            <TextField
              onChangeText={setDraft}
              placeholder="Who are you messaging?"
              style={styles.newChatInput}
              value={draft}
            />
            <PrimaryButton
              label="Start"
              onPress={() => void startChat()}
              small
              style={styles.newChatButton}
            />
          </View>
        </View>

        <View style={styles.tip}>
          <BareIconButton accessibilityLabel="Share location" color={Palette.green} icon="pin" />
          <AppText color="muted" size={11} style={styles.tipText}>
            Inside a chat you can send your live pin so someone can find you without
            describing directions.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  header: { paddingHorizontal: 12, backgroundColor: Palette.surface },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  list: {
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    paddingHorizontal: 12,
    ...Shadows.card,
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
  },
  rowCopy: { flex: 1, gap: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1 },
  newChat: {
    padding: 14,
    gap: 7,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: '#FAFCF9',
  },
  newChatHint: { lineHeight: 15 },
  newChatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  newChatInput: { flex: 1, height: 42 },
  newChatButton: { minWidth: 78 },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  tipText: { flex: 1, lineHeight: 15 },
});
