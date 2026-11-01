import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getMaintenance, isoToParisLocal } from '@/lib/maintenance-server';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Textarea } from '@/components/ui';
import { saveMaintenance } from './actions';

export const metadata = { title: 'Maintenance' };

export default async function MaintenanceAdminPage() {
  await requireAdmin('/admin/maintenance');
  const m = await getMaintenance();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[28px] font-bold tracking-tight">
            Mode maintenance {m.active ? <Badge tone="amber">Activé</Badge> : <Badge tone="green">Site ouvert</Badge>}
          </h1>
          <p className="max-w-3xl text-muted">
            Pendant une mise à jour délicate, fermez le site au public : visiteurs et membres voient une page d’attente animée (code 503, Google patiente sans rien
            désindexer). Vous, administrateur, continuez de naviguer normalement. Les paiements Stripe, les e-mails et les tâches planifiées continuent de tourner.
          </p>
        </div>
        <Link href="/maintenance?apercu=1" target="_blank" className="text-sm font-semibold text-brand">
          Voir la page de maintenance ↗
        </Link>
      </div>

      {m.active ? <Notice>Le site est fermé au public. Pensez à le rouvrir une fois la mise à jour terminée.</Notice> : null}

      <Card className="max-w-2xl">
        <ActionForm action={saveMaintenance} resetOnSuccess={false} className="flex flex-col gap-4">
          <Field label="Message aux visiteurs (facultatif)" htmlFor="message" hint="Laissé vide : « Le site fait sa révision et revient très vite. Vos données sont en sécurité. »">
            <Textarea id="message" name="message" maxLength={400} rows={3} defaultValue={m.message} placeholder="Ex. : nous installons la nouvelle version du carnet d’entretien." />
          </Field>
          <Field label="Retour prévu (heure de Paris, facultatif)" htmlFor="until">
            <Input id="until" name="until" type="datetime-local" defaultValue={isoToParisLocal(m.until)} className="sm:max-w-xs" />
          </Field>
          <div className="flex flex-wrap gap-2.5">
            {m.active ? (
              <>
                <SubmitButton name="op" value="desactiver" pendingLabel="Réouverture…">
                  Rouvrir le site
                </SubmitButton>
                <SubmitButton name="op" value="activer" variant="secondary" pendingLabel="Enregistrement…">
                  Mettre à jour le message
                </SubmitButton>
              </>
            ) : (
              <SubmitButton name="op" value="activer" variant="danger" pendingLabel="Fermeture…">
                Activer le mode maintenance
              </SubmitButton>
            )}
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
