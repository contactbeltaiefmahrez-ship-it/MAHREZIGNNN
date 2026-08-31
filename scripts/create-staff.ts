/** Provision an ops user. Invitation-only; there is no self-registration route. */
import { getPool, closePool } from '../platform/db.ts';
import { hashPassword } from '../modules/identity/service.ts';
const [email, password, role = 'OPS'] = process.argv.slice(2);
if (!email || !password) { console.error('usage: create-staff <email> <password> [OPS|ADMIN]'); process.exit(1); }
await getPool().query(
  `insert into staff_user (email,password_hash,role) values ($1,$2,$3::staff_role)
   on conflict (email) do update set password_hash=excluded.password_hash, role=excluded.role`,
  [email, await hashPassword(password), role]);
console.log(`staff user ${email} (${role}) provisioned`);
await closePool();
