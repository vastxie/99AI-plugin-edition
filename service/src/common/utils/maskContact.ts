export function maskContact(contact: string): string {
  if (!contact) return '';

  const atIndex = contact.indexOf('@');
  if (atIndex > 0) {
    const local = contact.slice(0, atIndex);
    const domain = contact.slice(atIndex + 1);
    const visibleLocal = local.length <= 2 ? local.charAt(0) : `${local.charAt(0)}${local.at(-1)}`;
    return `${visibleLocal}${'*'.repeat(Math.max(1, local.length - visibleLocal.length))}@${domain}`;
  }

  if (contact.length <= 4) return '*'.repeat(contact.length);
  return `${contact.slice(0, 3)}${'*'.repeat(Math.max(4, contact.length - 5))}${contact.slice(-2)}`;
}
