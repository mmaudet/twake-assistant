# Configuration du Backend Whisper

## Configuration par défaut

Par défaut, l'application utilise l'URL configurée dans `src/config.js`.

## Utiliser un serveur distant

Pour utiliser un backend Whisper sur un autre serveur :

### 1. Modifier le fichier de configuration

Éditez le fichier `src/config.js` :

```javascript
export const WHISPER_BACKEND_URL = 'http://votre-serveur.example.com:8000'
```

### 2. Rebuilder l'application

```bash
yarn build
```

### 3. Recharger la page

Rechargez la page dans votre navigateur (Cmd+R ou F5)

## Exemples de configuration

### Backend local
```javascript
export const WHISPER_BACKEND_URL = 'http://localhost:8000'
```

### Backend sur serveur distant
```javascript
export const WHISPER_BACKEND_URL = 'http://51.210.167.184:8000'
```

### Backend sur domaine
```javascript
export const WHISPER_BACKEND_URL = 'https://whisper-api.example.com'
```

## Notes importantes

- Après modification du `src/config.js`, vous devez **rebuilder l'application** (`yarn build`)
- Le backend doit autoriser les requêtes CORS depuis votre domaine Cozy
- Le fichier `src/config.js` peut être commité dans Git (il contient une configuration par défaut)

## Déployer le backend sur un serveur distant

Pour éviter de faire tourner le backend MLX sur votre Mac :

1. **Installez le backend** sur un serveur avec GPU (ou CPU puissant)
   ```bash
   # Sur le serveur distant
   cd /path/to/TheWhisper-api
   uv sync
   uv run python server.py
   ```

2. **Configurez CORS** dans `server.py` pour autoriser votre domaine Cozy
   ```python
   allow_origins=[
       "http://localhost:8080",
       "http://twake-assistant.cozy.localhost:8080",
       "http://votre-cozy.example.com"  # Ajoutez votre domaine
   ]
   ```

3. **Mettez à jour** le fichier `src/config.js` dans twake-assistant avec l'URL du serveur distant

4. **Rebuilder** l'application

Cela permettra de soulager votre Mac et d'utiliser un serveur dédié pour la transcription.
