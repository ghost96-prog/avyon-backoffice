// src/utils/communityPermissions.js
//
// Who can moderate the Community feed, checked by email.
//
// IMPORTANT: this list controls the UI only (whether the Edit/Delete
// menu shows up). The actual enforcement — whether Firestore/Storage
// will honor the delete — happens in your security rules, which must
// have the SAME emails hardcoded (see the rules snippet you were given
// alongside this file). If you add someone here, add them there too,
// or their delete button will show but the delete will fail with
// "missing or insufficient permissions".

const SUPERADMIN_EMAILS = [
  "gkmangezi09@gmail.com",
  // add more admin emails here
];

export function isCommunitySuperAdmin(userProfile) {
  const email = userProfile?.email;
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(email.toLowerCase().trim());
}
