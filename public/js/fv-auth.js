// Serveren setter fv-auth (ikke-HttpOnly markør): '1' = innlogget, '2' =
// innlogget med FLOGVIT.plus. Markøren er UX, ikke sikkerhet — den reelle
// håndhevingen skjer server-side (requirePlus). Ingen side-effekter ved import.

export function hasPlus() {
  try {
    return /(?:^|;\s*)fv-auth=2/.test(document.cookie);
  } catch {
    return false;
  }
}

export function loggedIn() {
  try {
    return /(?:^|;\s*)fv-auth=[12]/.test(document.cookie);
  } catch {
    return false;
  }
}
