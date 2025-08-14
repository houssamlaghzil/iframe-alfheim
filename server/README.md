# README — Backend Alfheim (Upload GLB → Firebase Storage + Firestore)

Backend **Node.js/Express** qui :

* reçoit des `.glb` via `multipart/form-data` (Multer **en mémoire**, pas d’écritures disque),
* stocke le binaire dans **Firebase Storage** (SDK **firebase-admin**),
* génère une **URL Firebase + token** (CORS OK) pour l’affichage web,
* enregistre les métadonnées dans **Firestore** sous `clients/<CLIENT_ID>/environments/<ENV_ID>`,
* expose des **routes REST** (upload, list, get, POIs), **debug**, **proxy** (fallback CORS), et **migration** (anciens liens → nouveaux).

Tech principales : **Node.js 18+**, **Express 5**, **firebase-admin** (Firestore + Storage), **Multer**.
Optionnel : **OpenAI** (route `/api/chat`).

---

## Arborescence

```
.
├─ package.json
├─ .env
└─ src/
   ├─ index.js
   ├─ config/
   │  ├─ env.js
   │  └─ firebaseAdmin.js
   ├─ services/
   │  └─ storage.js
   ├─ utils/
   │  ├─ logger.js
   │  ├─ path.js
   │  └─ urls.js
   ├─ middlewares/
   │  ├─ requestId.js
   │  └─ upload.js
   └─ routes/
      ├─ environments.js
      ├─ pois.js
      ├─ debug.js
      ├─ files.js
      ├─ admin.js
      └─ chat.js
```

---

## Flux global (vue d’ensemble)

```
[Client] --(POST /api/environments: title + file.glb)-->
  [Express + Multer(memory)] --> [firebase-admin: Storage.save(buffer, token)]
    --> URL Firebase + token (CORS OK)
    --> [Firestore: clients/<CLIENT_ID>/environments/<ENV_ID>]
<--(201: { id, fileUrl, storagePath, ... })-- [Backend]

[Front] useGLTF(fileUrl)  // ou fallback /api/proxy-model?path=<storagePath>
```

* **CORS** : on utilise par défaut `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>` ⇒ **CORS ok nativement**.
* **Compat** : endpoint `/files/:alias(.glb)?` et `/api/proxy-model` pour servir via ton domaine si besoin.

---

## Détail par fichier

### `src/index.js`

* Bootstrap de l’API : Express, middlewares globaux, montage des routes.
* Démarrage : appelle `resolveBucket()` (sélection auto du bucket); logs d’état.
* **Fonctions utilisées** :

    * `resolveBucket`, `getSelectedBucket` (depuis `services/storage.js`)
    * `log`, `errlog` (depuis `utils/logger.js`)
    * `requestId` (middleware)
    * Routers (`routes/*.js`)

### `src/config/env.js`

* Charge `.env` (via `dotenv`), parse `FIREBASE_SA` (JSON **service\_account**).
* Définit :

    * `CLIENT_ID` (namespace multi-clients).
    * `SERVICE_ACCOUNT` (objet JSON parsé).
    * `BUCKET_CANDIDATES` : ordre d’essai (`FIREBASE_STORAGE_BUCKET`, puis `<project>.firebasestorage.app`, puis `<project>.appspot.com`).
* Logs clairs des valeurs chargées.

### `src/config/firebaseAdmin.js`

* Initialise **firebase-admin** avec `SERVICE_ACCOUNT`.
* Exporte `db` (**Firestore**) et `storage` (**Storage**).

### `src/services/storage.js`

* **Sélection du bucket** :

    * `resolveBucket()` : essaye chaque nom de `BUCKET_CANDIDATES`, vérifie existence (`bucket.exists()`), mémorise le bucket choisi.
    * `getSelectedBucket()` : renvoie le bucket retenu.
* **CORS (optionnel)** :

    * `setBucketCors(origins)` : pose une règle CORS sur le bucket (utile uniquement si tu tiens à utiliser des **signed URLs GCS**, sinon pas nécessaire).
* **I/O fichiers** :

    * `saveGlbWithToken(dstPath, buffer, token)` : écrit le `.glb` avec `firebaseStorageDownloadTokens=<token>` + `cacheControl` et `contentType`.
    * `fileExists(storagePath)` : bool exist.
    * `getFileAndMeta(storagePath)` : renvoie `{ file, meta }`.
* Partagé avec : `routes/environments.js`, `routes/files.js`, `routes/admin.js`.

### `src/utils/logger.js`

* Mini wrapper de logs : `log`, `warn`, `errlog` avec timestamp et scope.
* Utilisé partout.

### `src/utils/path.js`

* `pathFor(...segments)` : construit les chemins Firestore **namespacés** : `clients/<CLIENT_ID>/<...>`.
* `safeFileName(name)` : normalise un nom de fichier (sans espaces/caractères exotiques).
* Utilisé par : `routes/environments.js`, `routes/pois.js`, `routes/files.js`, `routes/admin.js`.

### `src/utils/urls.js`

* `isGcsSigned(url)` : détecte une URL `storage.googleapis.com` (souvent bloquée CORS si non configurée).
* `isFirebaseTokenUrl(url)` : détecte une URL Firebase + token (CORS OK).
* `firebaseMediaUrl(bucket, storagePath, token)` : construit l’URL Firebase `.../v0/b/<bucket>/o/<path>?alt=media&token=<token>`.
* `resolveFileUrlForFront(doc)` : renvoie toujours une URL **safe CORS** pour le front :

    * si `fileUrl` est déjà Firebase → on garde,
    * sinon si `storagePath` existe → on renvoie `/api/proxy-model?path=<storagePath>`,
    * sinon → `doc.fileUrl` (best effort).

### `src/middlewares/requestId.js`

* Ajoute `req._rid` (UUID) et log l’URL au passage.
* Aide à suivre une requête dans les logs de bout en bout.

### `src/middlewares/upload.js`

* Configure **Multer** en **mémoire** (pas d’écritures disque).
* `fileFilter` : n’accepte que `.glb` (`model/gltf-binary`, `application/octet-stream`, ou mimetype vide).
* Taille max : 1 Go (modifiable).

### `src/routes/environments.js`

* `POST /api/environments`

    * **Entrée** : `multipart/form-data` avec `title` et `file` (`.glb`).
    * **Traitement** :

        * crée un `ENV_ID` et `docPath = clients/<CLIENT_ID>/environments/<ENV_ID>`,
        * construit `dstPath` (chemin de stockage fichier), `alias` (UUID court), `token` (Firebase),
        * `saveGlbWithToken()` → écrit le binaire dans Storage,
        * construit l’**URL Firebase + token** (`firebaseMediaUrl`),
        * écrit le doc Firestore : `{ title, subtitle, description, alias, fileUrl, storagePath, createdAt }`,
        * relit le doc pour vérifier (`writeVerified`).
    * **Sortie** : `201` + `{ id, docPath, fileUrl, storagePath, ... }` (le `fileUrl` est **safe CORS**).
* `GET /api/environments`

    * Liste de `clients/<CLIENT_ID>/environments`.
    * Applique `resolveFileUrlForFront`: garantit une URL utilisable côté front (Firebase ou proxy).
* `GET /api/environments/raw`

    * Idem mais **sans** réécriture (debug).
* `GET /api/environments/:id`

    * Retourne un env avec `fileUrl` safe.

### `src/routes/pois.js`

* `GET /api/environments/:envId/pois` : lit `clients/<CLIENT_ID>/environments/<envId>/pois`.
* `POST /api/environments/:envId/pois` : upsert un POI (champ `id` généré si absent).

### `src/routes/debug.js`

* `GET /healthz` : état simple (clientId, bucket sélectionné).
* `GET /debug/storage` : (ré)évalue le bucket et renvoie le sélectionné.
* `POST /debug/set-cors` : **optionnel** : pose le CORS sur le bucket (si tu insistes pour utiliser des **signed URLs GCS** en frontal).
* `GET /debug/fs-check` : vérifie la sous-collection `clients/<CLIENT_ID>/environments` (compte + derniers IDs).

### `src/routes/files.js`

* `GET /files/:alias(.glb)?`

    * **Legacy** : sert un modèle par alias (stream depuis Storage, avec headers cachables, `Access-Control-Allow-Origin: *`).
* `GET /api/proxy-model?path=<storagePath>`

    * **Proxy direct** (fallback CORS) pour un `storagePath` donné.

### `src/routes/admin.js`

* `POST /admin/migrate-urls`

    * Parcourt `clients/<CLIENT_ID>/environments` :

        * si `storagePath` existe, garantit un `firebaseStorageDownloadTokens`,
        * met à jour `fileUrl` avec l’**URL Firebase + token** (CORS OK).
    * Utile pour convertir des environnements **anciens** (qui avaient des **signed URLs GCS** bloquées par CORS).

### `src/routes/chat.js` (optionnel)

* `POST /api/chat` : proxy basique vers OpenAI (si tu l’utilises).

---

## Données & conventions

### Firestore

* **Chemins** : `clients/<CLIENT_ID>/environments/<ENV_ID>`
* **Document environment** :

  ```json
  {
    "title": "string",
    "subtitle": "string",
    "description": "string",
    "alias": "uuid",
    "fileUrl": "https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<token>",
    "storagePath": "clients/<CLIENT_ID>/environments/<ENV_ID>-<name>.glb", // format exact selon implémentation
    "createdAt": 1710000000000
  }
  ```
* **Sous-collection POIs** : `clients/<CLIENT_ID>/environments/<ENV_ID>/pois/<POI_ID>`

> **Admin SDK** contourne les règles Firestore côté serveur. Garde des règles strictes côté client si tu as un front qui lit directement Firestore.

### Storage

* **Bucket** détecté dans l’ordre :

    1. `FIREBASE_STORAGE_BUCKET` (dans `.env`),
    2. `<project_id>.firebasestorage.app`,
    3. `<project_id>.appspot.com` (héritage).
* **Chemins fichiers** : `dstPath` unique (concat docPath ou client/models + timestamp + nom safe).
* **Metadata** : `firebaseStorageDownloadTokens=<uuid>` pour permettre l’URL Firebase **sans CORS**.

---

## Variables d’environnement (`.env`)

```
CLIENT_ID=1
FIREBASE_SA={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...","client_id":"...","token_uri":"https://oauth2.googleapis.com/token", ...}   # une SEULE ligne
FIREBASE_STORAGE_BUCKET=alfheim-1a00d.firebasestorage.app   # nom EXACT (sans "gs://")
OPENAI_API_KEY=sk-...   # si /api/chat utilisé
```

> **Ne mets jamais** la clé de service côté front. Pas de `NEXT_PUBLIC_*` pour `FIREBASE_SA`.

---

## Endpoints (résumé)

* **Environments**

    * `POST /api/environments` — form-data : `title`, `file(.glb)` → crée l’env, upload le `.glb`.
    * `GET  /api/environments` — liste (URLs safe CORS).
    * `GET  /api/environments/raw` — liste brute (debug).
    * `GET  /api/environments/:id` — détail (URL safe).

* **POIs**

    * `GET  /api/environments/:envId/pois`
    * `POST /api/environments/:envId/pois` — JSON body (id auto si absent)

* **Fichiers & proxy**

    * `GET /files/:alias(.glb)?` — compat legacy.
    * `GET /api/proxy-model?path=<storagePath>` — proxy (fallback CORS).

* **Debug / Admin**

    * `GET  /healthz` — ping.
    * `GET  /debug/storage` — bucket sélectionné.
    * `GET  /debug/fs-check` — contrôle Firestore.
    * `POST /debug/set-cors` — pose CORS sur le bucket (si tu veux utiliser **signed URLs GCS**).
    * `POST /admin/migrate-urls` — convertit les anciens docs vers **URL Firebase + token**.

---

## Intégration front

```js
// Après POST /api/environments, le backend renvoie { fileUrl, storagePath, ... }.
const url = env.fileUrl; // Déjà "safe CORS"
const gltf = useGLTF(url, true); // @react-three/drei
```

Fallback possible :

```js
const url = env.fileUrl || `/api/proxy-model?path=${encodeURIComponent(env.storagePath)}`;
```

---

## Nginx (reverse proxy)

```nginx
# API Node
location /api/    { proxy_pass http://127.0.0.1:4000; }
location /files/  { proxy_pass http://127.0.0.1:4000; }

# (ton front est servi ailleurs / sur un autre bloc)
```

---

## Dépannage (rapide)

* **“The specified bucket does not exist.”**
  → `FIREBASE_STORAGE_BUCKET` faux ou Storage non activé. Mets le **nom exact** du bucket (console Firebase → Storage → « gs\://<nom> »).
* **CORS (blocked by policy)** en chargeant une **signed URL GCS**
  → Utilise l’**URL Firebase + token** (ce repo le fait par défaut) **ou** pose le CORS sur le bucket (`POST /debug/set-cors`).
* **404 `/files/<uuid>.glb`**
  → Chemin legacy non géré : désormais `/files/:alias` lit en DB l’alias généré à l’upload. Ré-upload ou ajoute `alias`/`storagePath` en DB.
* **Rien en DB**
  → Tu regardes la racine `environments`. Ouvre **clients → \<CLIENT\_ID> → environments**.

---

## Scripts cURL utiles

Upload d’un modèle :

```bash
curl -s -F "title=Coupe cellule" \
     -F "file=@cell.glb;type=model/gltf-binary" \
     http://localhost:4000/api/environments | jq
```

Lister :

```bash
curl -s http://localhost:4000/api/environments | jq
curl -s http://localhost:4000/api/environments/raw | jq
```

Debug :

```bash
curl -s http://localhost:4000/healthz | jq
curl -s http://localhost:4000/debug/storage | jq
curl -s http://localhost:4000/debug/fs-check | jq
```

Migration (anciens docs → URLs Firebase) :

```bash
curl -s -X POST http://localhost:4000/admin/migrate-urls | jq
```

(Optionnel) Poser CORS sur le bucket (pour signed URLs GCS) :

```bash
curl -s -X POST http://localhost:4000/debug/set-cors | jq
```

---

## Sécurité & bonnes pratiques

* **Clé de service** : ne jamais exposer `FIREBASE_SA` au client. Côté serveur uniquement.
* **Taille fichiers** : limite 1 Go (Multer). Ajuste selon tes besoins.
* **Cache** : `Cache-Control: public, max-age=31536000, immutable` sur les objets Storage et les streams (proxy, files).
* **Logs** : chaque requête a `rid=<uuid>` (voir `requestId`).
* **Règles Firestore/Storage** : côté **client**, garde des règles minimales strictes. Côté **serveur**, l’Admin SDK contourne les règles (auth de service).

---

## Pas à pas

1. **Installer**

```bash
npm i
```

2. **Configurer `.env`**

```
CLIENT_ID=1
FIREBASE_SA={"type":"service_account","project_id":"alfheim-1a00d", ...}  # une seule ligne
FIREBASE_STORAGE_BUCKET=alfheim-1a00d.firebasestorage.app
OPENAI_API_KEY=sk-...  # si /api/chat
```

3. **Lancer**

```bash
npm run dev
# ou
npm start
```

4. **Vérifier le bucket**

```bash
curl -s http://localhost:4000/debug/storage | jq
```

5. **Uploader un .glb**

```bash
curl -s -F "title=Test" \
     -F "file=@cell.glb;type=model/gltf-binary" \
     http://localhost:4000/api/environments | jq
```

6. **Charger côté front**

* Utilise `fileUrl` renvoyé (Firebase + token) dans `useGLTF(fileUrl)`.

7. **(Optionnel) Migrer les anciens enregistrements**

```bash
curl -s -X POST http://localhost:4000/admin/migrate-urls | jq
```

8. **(Optionnel) Signed URLs GCS**
   Si tu veux absolument des signed URLs GCS en front :

```bash
curl -s -X POST http://localhost:4000/debug/set-cors | jq
```

Tu es prêt.
