const enc = new TextEncoder();
export const to64 = bytes => btoa(String.fromCharCode(...bytes));
const from64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export const randomSalt = () => to64(crypto.getRandomValues(new Uint8Array(32)));
async function material(password) {
  return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
}
export async function authSecret(username, password) {
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:enc.encode(`health-app:auth:v1:${username}`), iterations:600000}, await material(password), 256);
  return to64(new Uint8Array(bits));
}
export async function vaultKey(password, salt) {
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:from64(salt), iterations:600000}, await material(password), {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
export async function encrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('health-app:vault:v1')}, key, enc.encode(JSON.stringify(data))));
  // Chunk encoding to support larger journals without overflowing the JS call stack.
  let binary = '';
  for (let i=0; i<ciphertext.length; i+=8192) binary += String.fromCharCode(...ciphertext.subarray(i,i+8192));
  return {version:1,iv:to64(iv),ciphertext:btoa(binary)};
}
export async function decrypt(key, envelope) {
  if(envelope.version !== 1) throw new Error('Unbekanntes Tresorformat.');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(envelope.iv),additionalData:enc.encode('health-app:vault:v1')},key,from64(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
