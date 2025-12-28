# Plugin Rec Pro

Extension Chrome MV3 légère qui enregistre des actions utilisateur (click/input) et les rejoue.

## Installation (mode développeur)
1. Ouvrez chrome://extensions
2. Activez « Mode développeur » (coin supérieur droit)
3. Cliquez « Charger l’extension non empaquetée »
4. Sélectionnez le dossier `plugin-rec-pro/`

## Utilisation
- Ouvrez la popup de l’extension.
- Boutons:
  - Start: commence l’enregistrement (clicks, changements d’inputs/selects).
  - Stop: arrête l’enregistrement.
  - Play: rejoue la séquence enregistrée sur l’onglet actif.
  - Clear: efface les actions enregistrées.
- Statut: indique si l’enregistrement est actif et le nombre d’actions.

## Limitations actuelles
- Sélecteurs CSS générés simples (id, classes, nth-of-type). Peut échouer si le DOM change.
- Relecture avec délais fixes (300ms) par action.
- Événements pris en charge: click, input/change. (Pas encore: scroll, keypress avancés, drag&drop, navigation.)

## Roadmap
- Export/Import JSON des actions.
- Ajout d’événements (keydown, submit, scroll, navigation).
- Attente de conditions (waitForSelector, waitForText).
- Éditeur simple des steps dans la popup.

## Développement
- Fichiers:
  - `manifest.json` — déclaration MV3
  - `background.js` — service worker (contrôle start/stop/play/clear)
  - `content-script.js` — capture et relecture des actions sur la page
  - `popup.html`, `popup.js` — interface utilisateur

## Sécurité/Permissions
- Permissions: `storage`, `activeTab`, `tabs`, `scripting`, `host_permissions: <all_urls>`
- Les actions sont stockées dans `chrome.storage.local` sous la clé `plugin_rec_pro_actions`.
"# plugv1" 
