// One time move of the family data (from before groups) into the group
// "Familie". The logic is in functions/migrate.js; nothing old is deleted.
//
// 1. Look first, nothing is written (members, people without an account, collections):
//      node functions/scripts/migrate-to-groups.mjs --project <project id>
// 2. Then for real. It asks for the group password (hidden) and prints the group code:
//      node functions/scripts/migrate-to-groups.mjs --project <project id> --write
//
// Needs Google credentials with access to the project
// (gcloud auth application-default login). With FIRESTORE_EMULATOR_HOST and
// FIREBASE_AUTH_EMULATOR_HOST set it runs on the local emulators instead;
// there FAMILY_GROUP_PASSWORD may give the password without asking.
import { createInterface } from 'node:readline';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { migrateToGroups } from '../migrate.js';

const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
const write = args.includes('--write');
if (!args.includes('--project') || !project || project.startsWith('--')) {
  console.error('Please give the project: --project <project id>');
  process.exit(1);
}
const local = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
console.log(`Project ${project}${local ? ' (local emulator)' : ''}, ${write ? 'WRITING' : 'only looking'}.`);

function askHidden(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Show the question, but not what is typed.
  rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); }));
}

async function groupPassword() {
  if (local && process.env.FAMILY_GROUP_PASSWORD) return process.env.FAMILY_GROUP_PASSWORD;
  const first = await askHidden('Group password (at least 8 characters): ');
  const second = await askHidden('Repeat the group password: ');
  if (first !== second) throw new Error('The two passwords are not the same.');
  return first;
}

initializeApp({ projectId: project });
const auth = getAuth();
const findAccount = async (mail) => {
  try {
    const user = await auth.getUserByEmail(mail);
    return { uid: user.uid, name: user.displayName || mail };
  } catch (err) {
    if (err.code === 'auth/user-not-found') return null;
    throw err;
  }
};

try {
  const password = write ? await groupPassword() : '';
  const result = await migrateToGroups({ db: getFirestore(), findAccount, password, write });
  if (write) {
    console.log(`Done: ${result.docs} documents copied into groups/familie.`);
    console.log(`Group code: ${result.code} (share it with the group password).`);
  } else {
    console.log('Nothing was written. Run again with --write to move the data.');
  }
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
