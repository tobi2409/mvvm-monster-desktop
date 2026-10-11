# MVVM Monster Desktop

Eine native Desktop-Anwendung mit Node.js und [NodeGui](https://docs.nodegui.org/).

## Voraussetzungen

- Node.js 18 oder neuer
- Linux: die von NodeGui vorausgesetzten Qt-Systembibliotheken

## Starten

```bash
npm install
npm start
```

`npm start` verwendet NodeGuis eigene Node-Laufzeit `qode`, damit die nativen Bindings mit der passenden ABI geladen werden.

## Prüfung

```bash
npm run check
npm test
```

## MVVM Monster

Das ausführbare Beispiel liegt getrennt vom wiederverwendbaren Code:

```text
example/
	app.xml
	index.js
	style.qss
src/
	dom.js
	render.js
	xml.js
```

`example/app.xml` beschreibt die Oberfläche mit normalen Elementen sowie
`<get>`, `<each>` und `<if>`. `src/xml.js` validiert und parst das Layout. Dabei
wird jeder Text- und Elementknoten erzeugt und rekursiv mit `appendChild` in den
DOM eingefügt. Anschließend verarbeitet `TemplateEngine.reactive(...)` das
Template.

```xml
<application>
	<template id="dashboard-template">
		<h1><get>title</get></h1>
	</template>
	<main id="app" />
	<template-use template-id="dashboard-template" mount-id="app" />
</application>
```

`src/render.js` verbindet beim Mounten jeden DOM-Knoten direkt mit seinem
NodeGui-Widget. Die native Instanz ist anschließend über `node.qt` erreichbar.
Spätere DOM-Änderungen aktualisieren dieses Widget oder Layout unmittelbar und
benötigen keinen zusätzlichen Renderaufruf:

```javascript
viewModel.title = 'Reaktives Dashboard'
viewModel.tasks.push({ position: 3, title: 'Neue Aufgabe' })
viewModel.showNotice = true
```

## DOM

`src/dom.js` stellt eine kleine, plattformunabhängige Browser-ähnliche API für
`mvvm-monster` bereit. Der XML-Parser kann so ohne NodeGui-Abhängigkeit getestet
und wiederverwendet werden.

```javascript
const { Document } = require('./src/dom')
const { appendXml } = require('./src/xml')

const document = new Document()
appendXml(
    document,
    document.body,
    '<application><main id="app" /></application>',
)
```

Unterstützt werden unter anderem `createElement`, `createTextNode`, `append`,
`appendChild`, `insertBefore`, `remove`, `replaceChildren`, `getElementById`,
`querySelector(All)`, `getElementsByTagName`, `getElementsByClassName`, Attribute,
`classList` und `style`.

Das Modul ist kein vollständiger WHATWG-DOM: HTML-Parsing, CSS-Kaskade,
Live-Collections, Browser-Navigation und Web-APIs wie Canvas oder Fetch werden
nicht emuliert.
