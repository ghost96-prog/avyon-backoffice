// src/utils/communityPermissions.js
//
// Who can moderate the Community feed. Adjust the field checks below to
// match whatever your real user-profile / role schema looks like — this
// checks the common shapes (role string, boolean flag) so it works
// out of the box for most setups.

export function isCommunitySuperAdmin(userProfile) {
  if (!userProfile) return false;

  const role = (userProfile.role || "").toString().toLowerCase();
  return (
    role === "superadmin" ||
    role === "super_admin" ||
    role === "super-admin" ||
    userProfile.isSuperAdmin === true ||
    userProfile.superAdmin === true
  );
}
