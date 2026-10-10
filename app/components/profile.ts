/** Your Tabby profile on this device. Nothing here is a real account — it's just saved locally
 *  so your name, contact info, and wallet auto-fill next time you host or pay. */
const KEY = "tabby:profile";

export type Profile = {
  username: string;
  email: string;
  phone: string;
  wallet: string;
};

const empty: Profile = { username: "", email: "", phone: "", wallet: "" };

export function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

export function saveProfile(patch: Partial<Profile>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readProfile(), ...patch }));
  } catch {}
}
