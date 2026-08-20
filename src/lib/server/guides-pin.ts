export function getGuidesLockPin(): string {
  return process.env.GUIDES_LOCK_PIN?.trim() || "2828";
}

export function isValidGuidesLockPin(pin: string): boolean {
  return pin.trim() === getGuidesLockPin();
}
