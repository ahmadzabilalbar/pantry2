/**
 * Build the PANTRY_USERS environment value.
 *
 *   npm run hash-password -- <username> "<full name>"
 *       prompts for a password and prints PANTRY_USERS with that account
 *       added (merged into the current PANTRY_USERS if it is set).
 *
 *   npm run hash-password -- --from-file ../pantry/credentials/local_users.json
 *       prints the old app's accounts as PANTRY_USERS (bcrypt hashes carry
 *       over unchanged, so everyone keeps their password).
 *
 * Paste the printed value into Vercel -> Settings -> Environment Variables.
 */
import fs from "node:fs";
import readline from "node:readline";
import bcrypt from "bcryptjs";

const args = process.argv.slice(2);

if (args[0] === "--from-file") {
  const users = JSON.parse(fs.readFileSync(args[1], "utf8"));
  console.log(JSON.stringify(users));
  process.exit(0);
}

const username = String(args[0] || "").trim().toLowerCase();
if (!username) {
  console.error('Penggunaan: npm run hash-password -- <username> "<nama penuh>"');
  process.exit(1);
}

let users = {};
try {
  users = JSON.parse(process.env.PANTRY_USERS || "{}");
} catch {
  users = {};
}

async function promptHidden(question) {
  if (process.env.PANTRY_NEW_PASSWORD) return process.env.PANTRY_NEW_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); };
  const answer = await new Promise(resolve => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = await promptHidden(`Kata laluan untuk ${username}: `);
if (password.length < 8) {
  console.error("Kata laluan mesti sekurang-kurangnya 8 aksara.");
  process.exit(1);
}

users[username] = {
  hash: await bcrypt.hash(password, 12),
  full_name: String(args[1] || "").trim() || users[username]?.full_name || username
};

console.log("\nPANTRY_USERS=");
console.log(JSON.stringify(users));
