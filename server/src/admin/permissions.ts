export const ADMIN_ROLES = ['super', 'admin', 'readonly'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type Permission =
  | 'view'
  | 'edit_profile'
  | 'send_signin'
  | 'change_rates'
  | 'manage_accounts'
  | 'adjust_balances';

/**
 * Who may do what. Anything not listed is refused: a new permission is reachable by nobody until
 * someone adds it here on purpose.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  readonly: ['view'],
  admin: ['view', 'edit_profile', 'send_signin'],
  super: ['view', 'edit_profile', 'send_signin', 'change_rates', 'manage_accounts', 'adjust_balances'],
};

export function can(role: AdminRole | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}
