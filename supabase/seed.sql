-- Données de démonstration (facultatives).
-- Les fiches de démo restent « à relire » : aucune donnée technique
-- non vérifiée n'est publiée automatiquement.

insert into public.blog_posts (slug, title, excerpt, content_md, category, author_name, seo_description, status, published_at)
values (
  'bienvenue-sur-sillon',
  'Bienvenue sur le blog Sillon',
  'Des conseils pratiques pour votre exploitation : réglementation, matériel, météo et gestion.',
  E'Ce blog accompagne l''application Sillon.\n\n## Ce que vous trouverez ici\n\n- des guides réglementaires clairs ;\n- des conseils d''entretien du matériel ;\n- des repères météo et cultures ;\n- des méthodes de gestion simples.\n\nBonne lecture !',
  'gestion',
  'L''équipe Sillon',
  'Le blog Sillon : conseils pratiques pour les exploitations agricoles.',
  'published',
  now()
)
on conflict (slug) do nothing;

insert into public.tech_sheets (slug, title, category, brand, model, summary, status, content)
values (
  'tracteur-compact-25-ch-exemple',
  'Tracteur compact 25 ch (exemple)',
  'machine',
  '[Marque]',
  '[Modèle]',
  'Fiche d''exemple pour tester le circuit de relecture. Les valeurs sont à vérifier.',
  'review',
  '{
    "summary": "Petit tracteur polyvalent pour l''entretien et les travaux légers.",
    "specs": [
      { "group": "Moteur", "items": [
        { "label": "Type", "value": "Diesel 3 cylindres", "source": null, "needs_review": true },
        { "label": "Puissance", "value": "25 ch", "source": null, "needs_review": true }
      ]}
    ],
    "maintenance": [
      { "operation": "Vidange moteur + filtre", "interval_hours": 250, "interval_months": 12, "product": "Huile 15W-40", "capacity": null, "source": null, "needs_review": true }
    ],
    "faults": [
      { "symptom": "Démarre mal à froid", "difficulty": "facile", "causes": ["Bougies de préchauffage", "Batterie faible"], "checks": ["Mesurer la tension batterie au repos", "Vérifier le témoin de préchauffage"], "source": null, "needs_review": true }
    ],
    "parts": [
      { "name": "Filtre à huile", "reference": null, "quantity": "1", "source": null, "needs_review": true }
    ]
  }'::jsonb
)
on conflict (slug) do nothing;

-- Pour donner les droits d'administration à votre compte (après inscription) :
--   update public.profiles set role = 'admin' where email = 'votre@email.fr';
