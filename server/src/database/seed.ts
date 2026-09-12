import { down, up } from '../seeders/202609040001-admin.js';

export async function seedAdmin(): Promise<void> {
  await up();
  console.log('Development administrator is ready: admin / 123456');
}

export async function unseedAdmin(): Promise<void> {
  await down();
  console.log('Development administrator removed');
}
