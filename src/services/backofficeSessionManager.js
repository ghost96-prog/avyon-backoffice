// src/services/backofficeSessionManager.js
//
// Web analog of the mobile app's StaffSessionManager, scoped to what
// BackOffice needs: staff roster + PIN verification (so a second identity
// check happens after Firebase login, same as the POS), and per-role
// access rights so the sidebar/pages can hide what a role isn't allowed
// to see.
//
// Assumes the same backend surface as the mobile app:
//   GET /business/:businessId/staff                 -> roster (with .pin)
//   GET /business/:businessId/staff/owner/status     -> { hasPin }
//   GET /business/:businessId/branches               -> branch list
//   GET /business/:businessId/roles/:roleId/permissions
// If your API uses different paths, this is the one file to edit.

const LS_KEYS = {
  STAFF_ROSTER: "bo:staffRoster",
  ACCESS_RIGHTS: "bo:accessRights",
  ACTIVE_STAFF: "bo:activeStaff",
  BRANCHES: "bo:branches",
  OWNER_HAS_PIN: "bo:ownerHasPin",
};

const ROLE_IDS = ["owner", "admin", "manager", "cashier", "stock_controller"];

class BackofficeSessionManager {
  constructor() {
    this.apiFetch = null;
    this.businessId = null;
    this._staffCache = null;
    this._accessRightsCache = null;
  }

  setContext({ apiFetch, businessId }) {
    this.apiFetch = apiFetch;
    this.businessId = businessId;
  }

  // ── Owner PIN gate status ────────────────────────────────────────────────
  async getOwnerStatus() {
    try {
      const status = await this.apiFetch(`/business/${this.businessId}/staff/owner/status`);
      localStorage.setItem(LS_KEYS.OWNER_HAS_PIN, status.hasPin ? "1" : "0");
      return status;
    } catch (error) {
      const cached = localStorage.getItem(LS_KEYS.OWNER_HAS_PIN);
      return { hasPin: cached === "1" };
    }
  }

  // ── Branches ─────────────────────────────────────────────────────────────
  async getBranches() {
    try {
      const branches = await this.apiFetch(`/business/${this.businessId}/branches`);
      localStorage.setItem(LS_KEYS.BRANCHES, JSON.stringify(branches));
      return branches;
    } catch (error) {
      const cached = localStorage.getItem(LS_KEYS.BRANCHES);
      return cached ? JSON.parse(cached) : [];
    }
  }

  // ── Staff roster + PIN verification ─────────────────────────────────────
  async refreshStaffRoster() {
    try {
      const staff = await this.apiFetch(`/business/${this.businessId}/staff`);
      localStorage.setItem(LS_KEYS.STAFF_ROSTER, JSON.stringify(staff));
      this._staffCache = staff;
      return staff;
    } catch (error) {
      const cached = localStorage.getItem(LS_KEYS.STAFF_ROSTER);
      this._staffCache = cached ? JSON.parse(cached) : [];
      return this._staffCache;
    }
  }

  async refreshAccessRights() {
    const accessRights = {};
    await Promise.all(
      ROLE_IDS.map(async (roleId) => {
        try {
          accessRights[roleId] = await this.apiFetch(
            `/business/${this.businessId}/roles/${roleId}/permissions`
          );
        } catch (_) {
          // Leave missing roles out — hasPermissionForRole falls back to false.
        }
      })
    );
    localStorage.setItem(LS_KEYS.ACCESS_RIGHTS, JSON.stringify(accessRights));
    this._accessRightsCache = accessRights;
    return accessRights;
  }

  /** Pulls everything BackOffice needs in one go (called after login / on refresh). */
  async refreshAll() {
    const [staff, accessRights, branches, ownerStatus] = await Promise.all([
      this.refreshStaffRoster(),
      this.refreshAccessRights(),
      this.getBranches(),
      this.getOwnerStatus(),
    ]);
    return { staff, accessRights, branches, ownerStatus };
  }

  async verifyPin(pin) {
    try {
      let staffList = this._staffCache;
      if (!staffList) {
        const raw = localStorage.getItem(LS_KEYS.STAFF_ROSTER);
        staffList = raw ? JSON.parse(raw) : [];
        this._staffCache = staffList;
      }

      const staff = staffList.find((s) => s.pin === pin);
      if (!staff) return { success: false, error: "Invalid PIN" };
      if (staff.status && staff.status !== "active") {
        return { success: false, error: "Staff account inactive" };
      }

      const { pin: _discard, ...safeStaff } = staff;
      return { success: true, staff: safeStaff };
    } catch (error) {
      return { success: false, error: "Error verifying PIN" };
    }
  }

  // ── Active staff (the identity currently "at the wheel" in BackOffice) ──
  setActiveStaff(staff) {
    localStorage.setItem(LS_KEYS.ACTIVE_STAFF, JSON.stringify(staff));
  }

  getActiveStaff() {
    const raw = localStorage.getItem(LS_KEYS.ACTIVE_STAFF);
    return raw ? JSON.parse(raw) : null;
  }

  clearActiveStaff() {
    localStorage.removeItem(LS_KEYS.ACTIVE_STAFF);
  }

  // ── Permission checks ────────────────────────────────────────────────────
  getAccessRightsForRole(role) {
    if (this._accessRightsCache && this._accessRightsCache[role]) {
      return this._accessRightsCache[role];
    }
    const raw = localStorage.getItem(LS_KEYS.ACCESS_RIGHTS);
    const map = raw ? JSON.parse(raw) : {};
    this._accessRightsCache = map;
    return map[role] || { pos: { permissions: [] }, backoffice: { permissions: [] } };
  }

  // ✅ Get role permissions for a specific role
  getRolePermissions(roleId) {
    if (!roleId) return null;
    
    // Check cache first
    if (this._accessRightsCache && this._accessRightsCache[roleId]) {
      return this._accessRightsCache[roleId];
    }
    
    // Check localStorage
    const raw = localStorage.getItem(LS_KEYS.ACCESS_RIGHTS);
    const map = raw ? JSON.parse(raw) : {};
    this._accessRightsCache = map;
    
    return map[roleId] || null;
  }

  // ✅ Get a specific permission for a role
  hasPermissionForRole(role, permissionId, section = "backoffice") {
    if (!role) return false;
    if (role === "owner") return true;
    
    const rights = this.getAccessRightsForRole(role);
    const perms = rights?.[section]?.permissions || [];
    const found = perms.find((p) => p.id === permissionId);
    return found ? !!found.default : false;
  }

  hasPermission(permissionId, section = "backoffice") {
    const staff = this.getActiveStaff();
    if (!staff) return false;
    return this.hasPermissionForRole(staff.role, permissionId, section);
  }

  // ✅ Get cached access state for subscription checks
  getCachedAccessState() {
    try {
      const raw = localStorage.getItem(LS_KEYS.ACCESS_RIGHTS);
      if (!raw) return { hasAccess: true, subscriptionStatus: 'active' };
      
      // Check if there's any subscription status stored
      // This would come from your backend via the /me endpoint or similar
      const accessData = JSON.parse(raw);
      
      // If you store subscription status in the access rights, return it
      // Otherwise default to active
      return {
        hasAccess: accessData.hasAccess !== false,
        subscriptionStatus: accessData.subscriptionStatus || 'active',
        suspendedReason: accessData.suspendedReason || null,
      };
    } catch (error) {
      console.warn('Failed to get cached access state:', error);
      return { hasAccess: true, subscriptionStatus: 'active' };
    }
  }

  clearAll() {
    this._staffCache = null;
    this._accessRightsCache = null;
    Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
  }
}

export const backofficeSessionManager = new BackofficeSessionManager();
export { LS_KEYS, ROLE_IDS };