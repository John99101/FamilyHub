// Test data shared by the rules tests: one group with its admins and members.
import { doc, setDoc, Timestamp } from 'firebase/firestore';

export const GROUP = 'g1';

export function memberEntry(user, role) {
  return { uid: user.uid, mail: user.email, name: user.name, role, joinedAt: Timestamp.now() };
}

/** Writes groups/g1 and one members document per person (with rules disabled). */
export async function seedGroup(db, { admins = [], members = [] }) {
  await setDoc(doc(db, 'groups', GROUP), {
    name: 'Familie', icon: '🏡', code: 'FAM 7K2Q', features: {}, design: {}, marketsUnlocked: false,
    createdBy: admins[0]?.uid ?? '', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), updatedBy: admins[0]?.uid ?? '',
  });
  for (const user of admins) await setDoc(doc(db, 'groups', GROUP, 'members', user.uid), memberEntry(user, 'admin'));
  for (const user of members) await setDoc(doc(db, 'groups', GROUP, 'members', user.uid), memberEntry(user, 'member'));
}
