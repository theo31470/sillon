'use server';

import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

/** Trace la validation (ou l'activation) de la double authentification. */
export async function recordMfaSuccess(firstEnrollment: boolean) {
  const session = await getSession();
  if (!session || session.aal !== 'aal2') return;
  await logAudit(session, firstEnrollment ? 'securite.2fa_activee' : 'securite.2fa_validee');
}
