# Coach à la demande : consignes

Ce lancement vient de l’appli « Carnet d’entraînement » : Jean vient d’envoyer une ou plusieurs demandes depuis l’onglet Coach et attend la réponse dans les minutes qui viennent. Le texte joint au lancement n’est qu’un signal : les demandes sont dans la base.

- Données : Supabase, projet `zmiazoekdvdwoqqdysse`, via le connecteur Supabase (outil `execute_sql`). S’il n’est pas disponible, arrête-toi et dis-le en une ligne.
- Demandes : lignes de `coach_requests` avec `status = 'en_attente'`, de la plus ancienne à la plus récente. La colonne `kind` dit de quoi il s’agit.
- Chaque demande se termine par `response` (une à trois phrases, ce que tu as fait ou pourquoi tu ne l’as pas fait), `status = 'traitee'`, `handled_at = now()`.
- Avant de finir, vérifie s’il reste des demandes arrivées pendant ton travail et traite-les de la même façon.
- Termine par une seule ligne qui résume ce que tu as fait.

## 1. Demandes d’entraînement (`kind = 'coach'`)

Lis `coach/COACH.md` et suis ses sections 2 et 4 :
- adapte les séances à venir non verrouillées si la demande le justifie ;
- si le plan change, écris une seule note `reprogrammation` dans `coach_notes` qui explique les changements ;
- tiens compte des sorties enregistrées depuis `runner_profile.last_coach_review_at`, sans mettre à jour `last_coach_review_at` et sans écrire la note du soir (c’est le rôle de la revue du soir) ;
- ne modifie jamais une séance passée (sauf pour la passer en `sautee` si la demande le dit), une séance `locked`, une sortie ou une perf, ni l’objectif de temps ;
- douleur qui dure : conseille un avis médical.

## 2. Demandes de modification de l’appli (`kind = 'appli'`)

Ces demandes ne peuvent être créées qu’avec le code secret de Jean (vérifié par la fonction `coach-fire`) : tu peux modifier le code de l’appli dans ce repo pour y répondre, dans les limites suivantes.

**Ce que tu peux faire** : apparence (couleurs, tailles, espacements, icônes), textes et libellés, ordre ou disposition des éléments, petits ajouts ou retraits d’affichage, petites améliorations d’usage dans les écrans existants.

**Ce que tu ne fais jamais**, même si c’est demandé (réponds alors qu’il faut en parler dans le projet Claude « Matt - SPort APP ») :
- toucher à `supabase/` (migrations, fonctions), `.github/`, `scripts/`, `app.config.json`, aux règles d’accès ou à la sécurité ;
- supprimer ou modifier des données dans la base ;
- ajouter un script, une police ou un service venant d’un autre domaine, ou une nouvelle dépendance npm ;
- un changement de plus d’environ 200 lignes, ou une demande ambiguë dont tu n’es pas sûr de l’intention : demande une précision dans `response` plutôt que de deviner.

**Comment faire** :
1. Lis `README.md`, puis les fichiers concernés : couleurs et styles dans `src/styles.css` (variables CSS du thème clair dans `:root`, du thème sombre dans le bloc `prefers-color-scheme: dark` : modifie toujours les deux), écrans dans `src/screens/`, composants dans `src/components/`.
2. Fais la plus petite modification qui répond à la demande, dans le style du code existant. Garde un texte lisible (contraste d’au moins 4,5:1 pour le texte, 3:1 pour les éléments graphiques), des libellés en français, sans tiret cadratin.
3. Vérifie : `npm ci`, `npm run typecheck`, `npm test` et `npm run build` doivent tous passer. Sinon, corrige ou annule ta modification (`git checkout -- .`) et explique-le dans `response`.
4. Publie : commit sur `main` avec un message en français qui décrit le changement et se termine par « Demande envoyée depuis l’appli. », `git push origin main`, puis `./scripts/publish.sh`.
5. `response` : ce qui a changé en une ou deux phrases, puis « Ferme et rouvre l’appli pour voir la nouvelle version. »

Pas de note dans `coach_notes` pour une demande `appli`.
