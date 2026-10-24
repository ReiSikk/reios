import 'server-only';

import { Buffer } from 'node:buffer';

function getEncryptionKey(): Promise<CryptoKey> {
  const encodedKey = process.env.ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error('ENCRYPTION_KEY is not configured.');
  }

  const keyBytes = Buffer.from(encodedKey, 'base64');
  if (keyBytes.byteLength !== 32 || keyBytes.toString('base64') !== encodedKey) {
    throw new Error('ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }

  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );

  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(encrypted).toString('base64')}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [encodedIv, encodedCiphertext, extra] = value.split('.');
  if (!encodedIv || !encodedCiphertext || extra) {
    throw new Error('Encrypted secret has an invalid format.');
  }

  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(encodedIv, 'base64') },
    key,
    Buffer.from(encodedCiphertext, 'base64')
  );

  return new TextDecoder().decode(decrypted);
}
