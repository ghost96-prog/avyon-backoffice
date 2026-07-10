// src/context/AppContext.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { API_BASE, createApiFetch } from "../services/api";
import { backofficeSessionManager } from "../services/backofficeSessionManager";
import { BACKOFFICE_PERMISSIONS } from "../utils/permissions";

const AppContext = createContext(null);

// Stages of the post-login flow:
//   idle -> checking -> pin (PIN gate required) -> ready
//   idle -> checking -> ready (no PIN required, e.g. solo owner account)
export function AppProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true); // firebase auth resolving
  const [firebaseUser, setFirebaseUser] = useState(null);

  const [uid, setUid] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [branchId, setBranchId] = useState(null);
  const [businessName, setBusinessName] = useState(null);
  const [baseCurrency, setBaseCurrency] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  const [postLoginStage, setPostLoginStage] = useState("idle");
  const [requiresPin, setRequiresPin] = useState(false);
  const [activeStaff, setActiveStaff] = useState(null);
  const [branches, setBranches] = useState([]);
  const [profileError, setProfileError] = useState(null);

  const getFreshTokenRef = useRef(async () => null);

  const getFreshToken = useCallback(
    async (forceRefresh = false) => {
      if (!firebaseUser) return null;
      try {
        return await firebaseUser.getIdToken(forceRefresh);
      } catch (error) {
        console.error("Failed to get ID token:", error);
        return null;
      }
    },
    [firebaseUser]
  );

  useEffect(() => {
    getFreshTokenRef.current = getFreshToken;
  }, [getFreshToken]);

  // Stable apiFetch that always calls through the *latest* token getter,
  // without needing to be recreated every render.
  const apiFetch = useCallback(
    createApiFetch((force) => getFreshTokenRef.current(force)),
    []
  );

  const loadProfile = useCallback(async (user) => {
    setProfileError(null);
    try {
      const token = await user.getIdToken(false);
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profile = await res.json();
      if (!res.ok) throw new Error(profile.error || "Failed to load profile");

      setUserProfile(profile);
      setUid(profile.uid);
      setBusinessId(profile.activeBusinessId || null);
      setBranchId(profile.activeBranchId || null);
      setBusinessName(profile.businessName || null);
      setBaseCurrency(profile.baseCurrency || null);

      return profile;
    } catch (error) {
      console.error("loadProfile error:", error.message);
      setProfileError(error.message);
      return null;
    }
  }, []);

  // ── Post-login flow: decide if a PIN gate is needed, load permission data ──
  const beginPostLoginFlow = useCallback(
    async (profile) => {
      if (!profile?.activeBusinessId) {
        setPostLoginStage("ready"); // nothing to gate on — let the UI decide what to show
        return;
      }
      setPostLoginStage("checking");
      try {
        backofficeSessionManager.setContext({
          apiFetch,
          businessId: profile.activeBusinessId,
        });

        const { branches: branchList, ownerStatus } = await backofficeSessionManager.refreshAll();
        setBranches(branchList || []);

        const pinRequired = !!ownerStatus?.hasPin;
        setRequiresPin(pinRequired);

        if (!pinRequired) {
          const owner = { staffId: profile.uid, name: profile.name || "Owner", role: "owner" };
          backofficeSessionManager.setActiveStaff(owner);
          setActiveStaff(owner);
          setPostLoginStage("ready");
          return;
        }

        const cachedStaff = backofficeSessionManager.getActiveStaff();
        if (cachedStaff) {
          setActiveStaff(cachedStaff);
          setPostLoginStage("ready");
        } else {
          setPostLoginStage("pin");
        }
      } catch (error) {
        console.error("beginPostLoginFlow error:", error.message);
        // Fail open to "ready" with an owner identity so a backend hiccup
        // doesn't lock the owner out of their own BackOffice.
        const owner = { staffId: profile.uid, name: profile.name || "Owner", role: "owner" };
        setActiveStaff(owner);
        setPostLoginStage("ready");
      }
    },
    [apiFetch]
  );

  const completePinLogin = useCallback((staff) => {
    backofficeSessionManager.setActiveStaff(staff);
    setActiveStaff(staff);
    setPostLoginStage("ready");
  }, []);

  // ── Auth listener ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        const profile = await loadProfile(user);
        if (profile) await beginPostLoginFlow(profile);
      } else {
        setUid(null);
        setBusinessId(null);
        setBranchId(null);
        setBusinessName(null);
        setUserProfile(null);
        setPostLoginStage("idle");
        setRequiresPin(false);
        setActiveStaff(null);
        setBranches([]);
        backofficeSessionManager.clearAll();
      }
      setIsLoading(false);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchActiveStaff = useCallback((staff) => {
    backofficeSessionManager.setActiveStaff(staff);
    setActiveStaff(staff);
  }, []);

  const lockSession = useCallback(() => {
    if (!requiresPin) return;
    backofficeSessionManager.clearActiveStaff();
    setActiveStaff(null);
    setPostLoginStage("pin");
  }, [requiresPin]);

  const refreshPermissions = useCallback(async () => {
    await backofficeSessionManager.refreshAccessRights();
  }, []);

  // ✅ Backoffice permission check - uses the role permissions from the session manager
  const hasBackofficePermission = useCallback(
    (permissionId) => {
      if (!activeStaff) return false;
      
      // Owner has all permissions
      if (activeStaff.role === 'owner') return true;
      
      // Get the backoffice permissions for the active staff's role
      const rolePermissions = backofficeSessionManager.getRolePermissions(activeStaff.role);
      if (!rolePermissions) return false;
      
      // Check if the permission exists and is enabled
      const permission = rolePermissions.backoffice?.permissions?.find(p => p.id === permissionId);
      return permission?.default === true;
    },
    [activeStaff]
  );

  // ✅ Legacy hasPermission - keep for backward compatibility
  const hasPermission = useCallback(
    (permissionId) => {
      if (!activeStaff) return false;
      return backofficeSessionManager.hasPermissionForRole(activeStaff.role, permissionId, "backoffice");
    },
    [activeStaff]
  );

  const logout = useCallback(async () => {
    backofficeSessionManager.clearAll();
    await signOut(auth);
  }, []);

  const value = {
    // auth
    firebaseUser,
    isLoading,
    apiFetch,
    getFreshToken,

    // identity / business
    uid,
    businessId,
    branchId,
    businessName,
    baseCurrency,
    userProfile,
    branches,
    profileError,

    // PIN gate / active staff
    postLoginStage,
    requiresPin,
    activeStaff,
    completePinLogin,
    switchActiveStaff,
    lockSession,

    // permissions
    hasPermission,
    hasBackofficePermission, // ✅ New function for backoffice permissions
    refreshPermissions,

    // actions
    logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside <AppProvider>");
  return ctx;
}

export default AppContext;