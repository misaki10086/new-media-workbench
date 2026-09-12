import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';

export async function up(): Promise<void> {
  const password = await bcrypt.hash('123456', 12);
  const [user, created] = await User.findOrCreate({
    where: { username: 'admin' },
    defaults: { username: 'admin', password },
  });
  if (!created) await user.update({ password });
}

export async function down(): Promise<void> {
  await User.destroy({ where: { username: 'admin' } });
}
