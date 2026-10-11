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

Die Oberfläche in `src/index.js` wird als programmatisches `<template>` mit
`<get>`, `<each>` und `<if>` aufgebaut. `TemplateEngine.reactive(...)` rendert
dieses Template in den Qt-DOM. Bindings und Aktionen verwenden dieselben
Attribute wie im Browser:

```javascript
input.setAttribute("bind-input-value", "draft");
button.setAttribute("action-click", "addTask");
```

Änderungen am zurückgegebenen ViewModel aktualisieren die nativen Widgets:

```javascript
viewModel.heading = "Reaktiv verbunden";
viewModel.tasks.push({ position: "03", title: "Neue Aufgabe" });
viewModel.showStatus = true;
```

## Qt-DOM

`src/dom.js` bildet eine Browser-ähnliche API auf native Qt-Widgets ab:

```javascript
const { createQtDocument } = require("./dom");

const document = createQtDocument();
const button = document.createElement("button");

button.id = "save";
button.classList.add("primary");
button.textContent = "Speichern";
button.addEventListener("click", () => console.log("Gespeichert"));
document.body.append(button);
document.mount(window);
```

Unterstützt werden unter anderem `createElement`, `createTextNode`, `append`,
`appendChild`, `insertBefore`, `remove`, `replaceChildren`, `getElementById`,
`querySelector(All)`, `getElementsByTagName`, `getElementsByClassName`,
`closest`, Attribute, `classList`, `style` und Events. Die native NodeGui-Instanz
ist über `element.qt` verfügbar.

Das Modul ist kein vollständiger WHATWG-DOM: HTML-Parsing, CSS-Kaskade,
Live-Collections, Browser-Navigation und Web-APIs wie Canvas oder Fetch werden
nicht emuliert. Layout und Darstellung erfolgen nativ durch Qt.
