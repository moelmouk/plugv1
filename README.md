# Plugin Rec Pro v2.0 🎯

Extension Chrome MV3 avancée pour l'automatisation RPA (Robotic Process Automation), similaire à UI Vision.

## ✨ Fonctionnalités

### Capture d'actions
- **Clics** : simple, double, clic droit
- **Saisie** : champs texte, textarea, select, checkbox, radio
- **Clavier** : touches spéciales (Enter, Tab, Escape, etc.)
- **Scroll** : capture du défilement
- **Drag & Drop** : glisser-déposer
- **Focus/Blur** : événements de focus

### Support Angular/React
- Détection automatique des attributs Angular (`ng-model`, `formcontrolname`, `mat-*`)
- Attributs de test prioritaires (`data-testid`, `data-test`, `data-cy`)
- Trigger des événements de changement Angular

### Navigation
- `navigate` / `goto` : aller à une URL
- `back` : page précédente
- `forward` : page suivante
- `refresh` : recharger la page

### Attentes
- `waitForSelector` : attendre un élément
- `waitForText` : attendre un texte
- `waitForVisible` : attendre qu'un élément soit visible
- `waitForNotVisible` : attendre qu'un élément disparaisse
- `pause` / `wait` : pause fixe

### Variables
- `store` : stocker une valeur
- `storeText` : stocker le texte d'un élément
- `storeValue` : stocker la valeur d'un input
- `storeAttribute` : stocker un attribut
- `storeEval` : stocker le résultat d'une expression JavaScript
- Utilisation : `${nomVariable}` dans les sélecteurs et valeurs

### Conditions
- `if` / `else` / `elseif` / `endif` : exécution conditionnelle
- Conditions JavaScript : `${count} > 5`, `${name} == "John"`

### Boucles
- `times` / `endtimes` : répéter N fois
- `while` / `endwhile` : boucle tant que condition vraie
- `break` : sortir de la boucle
- `continue` : passer à l'itération suivante

### Assertions
- `assertText` : vérifier le texte
- `assertValue` : vérifier la valeur
- `assertVisible` : vérifier la visibilité
- `assertNotVisible` : vérifier l'invisibilité
- `assertChecked` : vérifier l'état coché

### Gestion des macros
- Sauvegarde automatique des enregistrements
- Bibliothèque de macros avec recherche
- Organisation par dossiers
- Tags pour catégoriser
- Import/Export JSON
- Duplication de macros

### Mode Debug
- Exécution pas à pas (Step)
- Pause/Reprise
- Highlight des éléments ciblés
- Logs détaillés
- Inspecteur d'éléments
- Option "Continuer en cas d'erreur"

## 🚀 Installation

1. Ouvrez `chrome://extensions` dans Chrome
2. Activez le "Mode développeur" (coin supérieur droit)
3. Cliquez "Charger l'extension non empaquetée"
4. Sélectionnez le dossier du plugin

## 📖 Utilisation

### Enregistrement
1. Cliquez sur l'icône de l'extension
2. Cliquez "Démarrer" pour commencer l'enregistrement
3. Effectuez vos actions sur la page web
4. Cliquez "Arrêter" pour terminer
5. Les actions sont listées dans l'onglet "Enregistrer"

### Lecture
1. Cliquez "Jouer" pour rejouer les actions
2. Utilisez les contrôles de lecture :
   - Pause/Reprendre
   - Step (pas à pas)
   - Stop

### Macros
1. Après enregistrement, cliquez "Sauvegarder la macro"
2. Donnez un nom et des tags
3. Retrouvez vos macros dans l'onglet "Macros"
4. Double-cliquez pour jouer une macro

### Variables
1. Créez des variables dans l'onglet "Variables"
2. Utilisez `${nomVariable}` dans vos actions
3. Les variables sont persistées entre les sessions

## 🛠 Paramètres

- **Délai entre étapes** : temps d'attente entre chaque action (ms)
- **Timeout de recherche** : temps max pour trouver un élément (ms)
- **Mode de saisie** : 
  - Instant : définit la valeur directement
  - Progressif : simule la frappe caractère par caractère
- **Highlight éléments** : surligne les éléments pendant le playback
- **Continuer sur erreur** : ne pas arrêter en cas d'erreur

## 📁 Structure des fichiers

```
plugin-rec-pro/
├── manifest.json       # Configuration MV3
├── background.js       # Service Worker
├── content-script.js   # Capture et lecture
├── content-styles.css  # Styles injectés (highlight, tooltip)
├── popup.html          # Interface utilisateur
├── popup.js            # Logique de l'interface
├── icons/              # Icônes de l'extension
├── testForm.html       # Page de test complète
└── README.md           # Documentation
```

## 🧪 Page de test

Ouvrez `testForm.html` dans votre navigateur pour tester toutes les fonctionnalités :
- Formulaires avec tous types d'inputs
- Composants interactifs (tabs, accordion, modal)
- Attributs Angular simulés
- Drag & Drop
- Compteur interactif
- Tableau dynamique

## 🔒 Permissions

- `storage` : sauvegarde des actions et macros
- `activeTab` : accès à l'onglet actif
- `tabs` : gestion des onglets
- `scripting` : injection du content script
- `downloads` : export des fichiers
- `clipboardRead/Write` : copier/coller

## 📝 Changelog

### v2.0.0
- ✨ Support complet Angular (ng-model, formcontrolname, mat-*)
- ✨ Capture étendue (hover, scroll, drag&drop, double-click, right-click)
- ✨ Navigation (goto, back, forward, refresh)
- ✨ Variables et conditions (store, if/else, loops)
- ✨ Boucles (times, while, break, continue)
- ✨ Gestion avancée des macros (dossiers, tags, recherche)
- ✨ Mode debug complet (step-by-step, pause/resume, highlight)
- ✨ Assertions (assertText, assertValue, assertVisible)
- 🛠 Interface utilisateur complètement redessinée
- 🛠 Amélioration des sélecteurs (priorité aux attributs stables)

### v0.1.0
- Version initiale avec capture click/input basique

## 💬 Support

Pour toute question ou problème, consultez la documentation ou créez une issue.

---

**Plugin Rec Pro** - Automatisation web simple et puissante 🚀
