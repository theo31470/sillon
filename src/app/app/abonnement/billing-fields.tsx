import { Field, Input, Select } from '@/components/ui';

export type BillingDefaults = {
  name: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  vat_number: string;
};

/** Champs « informations de facturation », partagés par le paiement et la page Abonnement. */
export function BillingFields({ defaults, idPrefix = 'b' }: { defaults: BillingDefaults; idPrefix?: string }) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Nom ou raison sociale" htmlFor={id('name')} hint="Tel qu’il doit apparaître sur vos factures (exploitation, GAEC, EARL…).">
          <Input id={id('name')} name="billing_name" defaultValue={defaults.name} required maxLength={120} autoComplete="organization" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Adresse" htmlFor={id('line1')}>
          <Input id={id('line1')} name="billing_line1" defaultValue={defaults.line1} required maxLength={200} autoComplete="address-line1" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Complément d’adresse (facultatif)" htmlFor={id('line2')}>
          <Input id={id('line2')} name="billing_line2" defaultValue={defaults.line2} maxLength={200} autoComplete="address-line2" placeholder="Lieu-dit, bâtiment…" />
        </Field>
      </div>
      <Field label="Code postal" htmlFor={id('cp')}>
        <Input id={id('cp')} name="billing_postal_code" defaultValue={defaults.postal_code} required maxLength={20} inputMode="numeric" autoComplete="postal-code" />
      </Field>
      <Field label="Commune" htmlFor={id('city')}>
        <Input id={id('city')} name="billing_city" defaultValue={defaults.city} required maxLength={100} autoComplete="address-level2" />
      </Field>
      <Field label="Pays" htmlFor={id('country')}>
        <Select id={id('country')} name="billing_country" defaultValue={defaults.country || 'FR'} autoComplete="country">
          <option value="FR">France</option>
          <option value="BE">Belgique</option>
          <option value="CH">Suisse</option>
          <option value="LU">Luxembourg</option>
          <option value="DE">Allemagne</option>
          <option value="ES">Espagne</option>
          <option value="IT">Italie</option>
        </Select>
      </Field>
      <Field label="SIRET (facultatif)" htmlFor={id('siret')}>
        <Input id={id('siret')} name="billing_siret" defaultValue={defaults.siret} inputMode="numeric" maxLength={20} placeholder="14 chiffres" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="N° de TVA intracommunautaire (facultatif)" htmlFor={id('vat')}>
          <Input id={id('vat')} name="billing_vat" defaultValue={defaults.vat_number} maxLength={20} placeholder="FR12345678901" />
        </Field>
      </div>
    </div>
  );
}
