# Carnet d’entraînement

Appli web installable sur téléphone pour préparer un semi-marathon avec un coach IA : allures calculées depuis tes perfs, plan semaine par semaine, séances validées ou déplacées, réajustement chaque soir par le coach (voir `coach/COACH.md`). La partie musculation existe toujours mais est masquée.

- **Appli** : Vite + React, publiée sur GitHub Pages à chaque push sur `main`
- **Données** : Supabase (Postgres + comptes email / mot de passe)
- **Sécurité** : chaque table est réservée aux comptes listés dans `public.members`. La clé présente dans `app.config.json` est la clé publique Supabase, prévue pour être visible ; ce sont les règles de la base qui protègent les données. La clé secrète (service_role) ne doit jamais apparaître ici.

## Ce que fait l’appli

| Écran | Contenu |
|---|---|
| Aujourd’hui | Compte à rebours, séance du jour avec allures cibles, semaine en cours (bleu = endurance, jaune = qualité, vert d’eau = sortie longue) |
| Plan | Toutes les semaines jusqu’à la course, phase et km prévus / faits |
| Séance | Déroulé, consigne du coach, valider, déplacer, modifier, sauter |
| Courses | Km par semaine, historique des sorties avec ressenti |
| Coach | Messages du coach, demandes de réajustement |
| Profil | Objectif, perfs, allures par zone (VDOT), disponibilités |
| Muscu, réglages | Masqués de la navigation, accessibles via `#/muscu` et `#/reglages` |

## Accès

Pour l’instant l’appli s’ouvre **sans connexion** (`"requireAuth": false` dans `app.config.json`, migration `0003_open_access.sql`). Pour réactiver les comptes : exécuter le bloc « Retour aux comptes » de cette migration, créer les comptes (étapes 2 et 3 ci-dessous), passer `requireAuth` à `true` et republier.

## Mise en place

1. Exécuter `supabase/migrations/0001_schema.sql` sur le projet Supabase
2. Créer les comptes dans Supabase (Authentication, Users, email + mot de passe), puis désactiver les nouvelles inscriptions
3. Autoriser les comptes : `insert into public.members (user_id) select id from auth.users on conflict do nothing;`
4. Renseigner `supabaseUrl` et `supabasePublishableKey` dans `app.config.json`
5. Dans le repo GitHub : Settings, Pages, Source = Deploy from a branch, branche `gh-pages`, dossier `/ (root)`

## Publier une nouvelle version

Le site servi par GitHub Pages est le contenu de la branche `gh-pages` : `npm run build`, puis publier le dossier `dist` sur cette branche.

## Option : éviter la mise en pause de Supabase

Supabase met en pause les projets gratuits après 7 jours sans activité. Pour l’éviter même pendant une pause d’entraînement, copier `setup/keepalive.yml` dans `.github/workflows/keepalive.yml` depuis l’interface GitHub (Add file, Create new file) : il appelle la base tous les 3 jours.

## Installer sur le téléphone

Ouvrir le lien GitHub Pages, puis :
- **iPhone** : Safari, bouton Partager, « Sur l’écran d’accueil »
- **Android** : Chrome, menu, « Installer l’application »

## Développement

```bash
npm install
npm run dev
npm run build
```
