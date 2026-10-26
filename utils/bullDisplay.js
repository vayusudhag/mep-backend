export const getBullDisplayName = (participant) => {
  const populatedName = participant?.bullId?.name;
  if (typeof populatedName === "string" && populatedName.trim().length > 0) {
    return populatedName.trim();
  }

  const snapshotName = participant?.bullSnapshot?.name;
  if (typeof snapshotName === "string" && snapshotName.trim().length > 0) {
    return snapshotName.trim();
  }

  return "Deleted Bull";
};
