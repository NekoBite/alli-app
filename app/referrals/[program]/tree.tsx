import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  Chips,
  EmptyState,
  Gradient,
  Screen,
  ScreenHeader,
  Segmented,
  Text,
} from '@/components';
import { useAuthStore } from '@/features/auth/store';
import { useReferralStore } from '@/features/referrals/store';
import type { DownlineMember, ReferralProgramId } from '@/features/referrals/types';
import { TIER_COLOR, TierBadge } from '@/features/referrals/ui';
import { SHOES, type ShoeTier } from '@/features/run/shoes';
import { colors, fonts, radius } from '@/theme';

type TreeProgram = Exclude<ReferralProgramId, 'card'>;
const PROGRAMS: { value: TreeProgram; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'garden', label: 'Garden' },
  { value: 'market', label: 'Market' },
];
/** Children drawn per node before the rest fold into "+N more". */
const FOLD = 2;

/** 6.6 Downline (list) and 6.6b (org chart) — one tree per program. */
export default function DownlineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ program: string }>();
  const initial = (PROGRAMS.find((p) => p.value === params.program)?.value ?? 'run') as TreeProgram;
  const [program, setProgram] = useState<TreeProgram>(initial);
  const [gen, setGen] = useState<string>('all');
  const { downlines, loadDownline, treeView, setTreeView } = useReferralStore();
  const downline = downlines[program];

  useEffect(() => {
    void loadDownline(program);
  }, [program, loadDownline]);

  const members = downline?.members ?? [];
  const maxGen = Math.max(1, ...members.map((m) => m.generation));

  const detail = (m: DownlineMember) =>
    Alert.alert(m.handle, `${SHOES[m.tier].name} · Gen ${m.generation}\n${m.note}${m.qualified ? '' : '\n\nNot qualified — their share rolls up to the next qualified member above.'}`);

  return (
    <Screen>
      <ScreenHeader
        eyebrow={`${downline?.total ?? '…'} members`}
        title="Downline"
        back={() => router.back()}
        right={
          <Segmented
            options={[
              { value: 'list', label: 'List' },
              { value: 'chart', label: 'Chart' },
            ]}
            value={treeView}
            onChange={setTreeView}
            style={styles.viewToggle}
          />
        }
      />

      <Segmented options={PROGRAMS} value={program} onChange={setProgram} />

      {members.length === 0 ? (
        <EmptyState glyph="·" title="No team yet" body="Share your invite link — people who join through it show up here." />
      ) : treeView === 'list' ? (
        <>
          <View style={styles.chips}>
            <Chips
              options={[
                { value: 'all', label: 'All' },
                ...Array.from({ length: maxGen }, (_, i) => ({ value: String(i + 1), label: `Gen ${i + 1}` })),
              ]}
              value={gen}
              onChange={setGen}
            />
          </View>
          <Card style={styles.list}>
            {members
              .filter((m) => gen === 'all' || m.generation === Number(gen))
              .map((m, i) => (
                <MemberRow key={m.id} m={m} indent={gen === 'all' ? m.generation - 1 : 0} first={i === 0} onPress={() => detail(m)} />
              ))}
          </Card>
          <Text variant="caption" color={colors.inkFaint} style={styles.note}>
            Emails are masked. You can’t message downline members or see their balances.
          </Text>
        </>
      ) : (
        <OrgChart members={members} onNode={detail} />
      )}
    </Screen>
  );
}

function Initial({ handle, size = 32 }: { handle: string; size?: number }) {
  return (
    <Gradient style={[styles.initial, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text variant="bodyStrong" style={{ fontSize: size * 0.4 }}>
        {handle[0]?.toUpperCase()}
      </Text>
    </Gradient>
  );
}

function MemberRow({ m, indent, first, onPress }: { m: DownlineMember; indent: number; first: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${m.handle}, generation ${m.generation}, ${m.tier}`}
      onPress={onPress}
      style={[styles.member, { paddingLeft: indent * 22 }, !first && indent === 0 && styles.divider]}
    >
      {indent > 0 ? (
        <Text variant="mono" color={colors.inkFaint}>
          └
        </Text>
      ) : null}
      <Initial handle={m.handle} />
      <View style={styles.flex}>
        <Text style={styles.handle} numberOfLines={1}>
          {m.handle}
        </Text>
        <Text variant="caption" color={m.qualified ? colors.inkDim : colors.warn} style={styles.sub}>
          Gen {m.generation} · {m.note}
        </Text>
      </View>
      <TierBadge tier={m.tier} />
    </Pressable>
  );
}

type Node = DownlineMember & { children: Node[] };

function buildTree(members: DownlineMember[]): Node[] {
  const nodes = new Map(members.map((m) => [m.id, { ...m, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const parent = n.sponsorId ? nodes.get(n.sponsorId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  return roots;
}

/** The org chart: you on top, each generation one row down, elbow connectors, folded branches. */
function OrgChart({ members, onNode }: { members: DownlineMember[]; onNode: (m: DownlineMember) => void }) {
  const roots = useMemo(() => buildTree(members), [members]);
  const [scale, setScale] = useState(1);
  const user = useAuthStore((s) => s.user);
  const legend: ShoeTier[] = ['gold', 'silver', 'leather'];

  return (
    <View style={styles.chartWrap}>
      <View style={styles.legend}>
        {legend.map((t) => (
          <View key={t} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: TIER_COLOR[t] }]} />
            <Text variant="mono" color={colors.inkFaint}>
              {SHOES[t].name}
            </Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dashed]} />
          <Text variant="mono" color={colors.inkFaint}>
            rolls up
          </Text>
        </View>
      </View>

      <View style={styles.canvas}>
        <View style={styles.zoom}>
          {[
            { g: '+', f: () => setScale((s) => Math.min(1.6, s + 0.15)) },
            { g: '−', f: () => setScale((s) => Math.max(0.55, s - 0.15)) },
            { g: 'Fit', f: () => setScale(1) },
          ].map((b) => (
            <Pressable key={b.g} accessibilityRole="button" accessibilityLabel={b.g === 'Fit' ? 'Fit' : b.g === '+' ? 'Zoom in' : 'Zoom out'} onPress={b.f} style={styles.zoomBtn}>
              <Text variant="mono">{b.g}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pan}>
          <View style={{ transform: [{ scale }] }}>
            <View style={styles.col}>
              <Gradient style={[styles.node, styles.you]}>
                <Text variant="bodyStrong">You</Text>
                <Text variant="mono" color={colors.ink} style={styles.small}>
                  {user?.displayName ?? 'sponsor'}
                </Text>
              </Gradient>
              <Branch nodes={roots} onNode={onNode} />
            </View>
          </View>
        </ScrollView>
      </View>
      <Text variant="caption" color={colors.inkFaint} center style={styles.note}>
        Drag to pan · + / − to zoom · tap a node for its details or “+N more” to open a branch.
      </Text>
    </View>
  );
}

function Branch({ nodes, onNode }: { nodes: Node[]; onNode: (m: DownlineMember) => void }) {
  const [open, setOpen] = useState(false);
  if (nodes.length === 0) return null;
  const shown = open ? nodes : nodes.slice(0, FOLD);
  const hidden = nodes.length - shown.length;
  return (
    <View style={styles.col}>
      <View style={styles.stem} />
      <View style={styles.row}>
        {shown.map((n, i) => (
          <View key={n.id} style={styles.col}>
            {/* The elbow: a stub up to the bar, and the bar spanning to the siblings. */}
            <View style={styles.bar}>
              <View style={[styles.barHalf, i === 0 && styles.clear]} />
              <View style={[styles.barHalf, i === shown.length - 1 && hidden === 0 && styles.clear]} />
            </View>
            <View style={styles.stem} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${n.handle}, ${n.tier}${n.qualified ? '' : ', rolls up'}`}
              onPress={() => onNode(n)}
              style={[styles.node, !n.qualified && styles.unq, { borderColor: n.qualified ? TIER_COLOR[n.tier] : colors.warn }]}
            >
              <View style={styles.nodeHead}>
                <Initial handle={n.handle} size={20} />
                <Text style={styles.nodeHandle} numberOfLines={1}>
                  {n.handle.replace(/\*+/, '**').slice(0, 9)}
                </Text>
              </View>
              <Text variant="mono" color={n.qualified ? TIER_COLOR[n.tier] : colors.warn} style={styles.small}>
                {n.qualified ? SHOES[n.tier].name : `${SHOES[n.tier].name} · rolls up`}
              </Text>
            </Pressable>
            <Branch nodes={n.children} onNode={onNode} />
          </View>
        ))}
        {hidden > 0 ? (
          <View style={styles.col}>
            <View style={styles.bar}>
              <View style={styles.barHalf} />
              <View style={[styles.barHalf, styles.clear]} />
            </View>
            <View style={styles.stem} />
            <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.node, styles.more]}>
              <Text variant="figure" color={colors.redHot}>
                +{hidden}
              </Text>
              <Text variant="mono" color={colors.inkFaint} style={styles.small}>
                more
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const LINE = colors.lineStrong;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewToggle: { width: 130 },
  chips: { marginVertical: 14 },
  list: { gap: 4, paddingVertical: 8 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 4, paddingTop: 12 },
  initial: { alignItems: 'center', justifyContent: 'center' },
  handle: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink },
  sub: { fontSize: 11 },
  note: { marginTop: 14 },
  chartWrap: { marginTop: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.warn, borderRadius: 2 },
  canvas: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    minHeight: 420,
    overflow: 'hidden',
  },
  zoom: { position: 'absolute', right: 10, top: 10, gap: 6, zIndex: 2 },
  zoomBtn: {
    minWidth: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pan: { padding: 20, paddingRight: 56, minWidth: '100%', justifyContent: 'center' },
  col: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  stem: { width: 1.5, height: 16, backgroundColor: LINE },
  bar: { flexDirection: 'row', alignSelf: 'stretch', height: 1.5 },
  barHalf: { flex: 1, backgroundColor: LINE },
  clear: { backgroundColor: 'transparent' },
  node: {
    minWidth: 108,
    marginHorizontal: 5,
    padding: 8,
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.raised2,
  },
  you: { alignItems: 'center', borderWidth: 0, minWidth: 120 },
  unq: { borderStyle: 'dashed', backgroundColor: colors.warnFill },
  more: { borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center' },
  nodeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nodeHandle: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.ink },
  small: { fontSize: 10 },
});
