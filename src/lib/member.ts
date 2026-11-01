/** Numéro de membre lisible, tiré de l'identifiant du compte : « TC-4F2A-91C0 ». */
export const memberNumber = (userId: string) => {
  const hex = userId.replace(/-/g, '').toUpperCase();
  return `TC-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
};
