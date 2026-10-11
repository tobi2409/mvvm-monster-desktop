const { Node } = require('./dom')
const {
    FlexLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QWidget
} = require('@nodegui/nodegui')

class RenderEngine {
    render(element, context = { actions: {}, widgets: new Map() }) {
        switch (element.localName) {
            case 'label':
                return this.renderLabel(element)
            case 'button':
                return this.renderButton(element, context)
            case 'input':
                return this.renderInput(element, context)
            default:
                return null
        }
    }

    renderTree(node, context = { actions: {}, widgets: new Map() }) {
        if (node.nodeType === Node.TEXT_NODE) {
            const widget = this.createLabel(node.textContent)
            this.track(node, widget, context, { atomic: true })
            return widget
        }

        const renderedElement = this.render(node, context)

        if (renderedElement) {
            this.track(node, renderedElement, context, {
                atomic: true
            })
            return renderedElement
        }

        if (['h1', 'h2', 'p', 'span', 'strong'].includes(node.localName)) {
            // Diese Elemente bilden ihren gesamten Textinhalt in einem QLabel ab
            // und werden deshalb als atomar registriert.
            const label = this.createLabel(node.textContent)
            this.applyElementMetadata(label, node)
            this.track(node, label, context, { atomic: true })
            return label
        }

        const widget = new QWidget()
        const layout = new FlexLayout()

        widget.setLayout(layout)
        this.applyElementMetadata(widget, node)
        this.track(node, widget, context, { layout })

        for (const child of node.childNodes) {
            layout.addWidget(this.renderTree(child, context))
        }

        return widget
    }

    mount(rootNode, context = { actions: {}, widgets: new Map() }) {
        return this.renderTree(rootNode, context)
    }

    // Speichert die direkte Verbindung zwischen einem DOM-Knoten und seinem
    // Qt-Widget. Kontext und Layout werden für spätere DOM-Änderungen benötigt.
    // Atomare Knoten bilden ihren gesamten Inhalt in genau einem Widget ab.
    track(node, widget, context, { atomic = false, layout = null } = {}) {
        node.qt = widget
        node._renderBinding = {
            atomic,
            context,
            layout,
            update: (change) => this.update(change)
        }
    }

    // Übersetzt eine DOM-Änderung unmittelbar in die passende Qt-Operation.
    // Atomare Inhalte und Attribute aktualisieren bestehende Widgets; geänderte
    // Kindlisten fügen Widgets in das gebundene Layout ein oder entfernen sie.
    update(change) {
        const atomicNode = this.findAtomicNode(change.target)

        if (atomicNode) {
            this.updateAtomicNode(atomicNode)
            return
        }

        if (change.type === 'attributes') {
            this.updateMetadata(change.target)
            return
        }

        const { layout, context } = change.target._renderBinding ?? {}

        if (change.type !== 'childList' || !layout) {
            return
        }

        for (const node of change.removedNodes) {
            if (node.qt) {
                layout.removeWidget(node.qt)
                node.qt.hide()
            }
        }

        for (const node of change.addedNodes) {
            const widget = node.qt ?? this.renderTree(node, context)
            const nextWidget = change.nextSibling?.qt

            if (nextWidget) {
                layout.insertChildBefore(widget, nextWidget)
            } else {
                layout.addWidget(widget)
            }

            widget.show()
        }
    }

    // Sucht vom Änderungsziel aufwärts den nächsten atomaren DOM-Knoten.
    // Dessen gesamter Teilbaum wird durch ein einziges Qt-Widget dargestellt,
    // das bei Änderungen eines enthaltenen Knotens aktualisiert werden muss.
    findAtomicNode(node) {
        while (node) {
            if (node._renderBinding?.atomic) {
                return node
            }

            node = node.parentNode
        }

        return null
    }

    // Überträgt Inhalt und Metadaten eines atomaren DOM-Knotens auf sein bereits
    // vorhandenes Widget, ohne eine neue native Qt-Instanz zu erzeugen.
    updateAtomicNode(node) {
        if (node.nodeType === Node.TEXT_NODE || node.localName !== 'input') {
            node.qt.setText(node.textContent)
        }

        if (node.nodeType !== Node.TEXT_NODE) {
            this.updateMetadata(node)
        }
    }

    // Synchronisiert DOM-Metadaten, Sichtbarkeit und eingabespezifische
    // Attribute mit dem direkt am Element gespeicherten Qt-Widget.
    updateMetadata(element) {
        if (!element.qt) {
            return
        }

        this.applyElementMetadata(element.qt, element)
        
        if (element.style.display !== 'none') {
            element.qt.show()
        }

        if (element.localName === 'input') {
            element.qt.setPlaceholderText(
                element.getAttribute('placeholder') ?? ''
            )
        }
    }

    renderLabel(element) {
        const label = this.createLabel(element.textContent)
        this.applyElementMetadata(label, element)
        return label
    }

    renderButton(element, context) {
        const button = new QPushButton()
        button.setText(element.textContent)
        this.applyElementMetadata(button, element)

        const actionName = element.getAttribute('desktop-action')
        if (actionName && context.actions[actionName]) {
            button.addEventListener('clicked', context.actions[actionName])
        }

        return button
    }

    renderInput(element, context) {
        const input = new QLineEdit()
        input.setPlaceholderText(element.getAttribute('placeholder') ?? '')
        this.applyElementMetadata(input, element)

        if (element.id) {
            context.widgets.set(element.id, input)
        }

        return input
    }

    createLabel(text) {
        const label = new QLabel()
        label.setText(text)
        label.setWordWrap(true)
        return label
    }

    applyElementMetadata(widget, element) {
        widget.setProperty('tagName', element.localName)
        widget.setProperty('class', element.className)

        if (element.id) {
            widget.setObjectName(element.id)
        }

        if (element.style.display === 'none') {
            widget.hide()
        }
    }
}

function createDesktopRenderer({
    styleSheet = '',
    title = '',
    width = 800,
    height = 600
} = {}) {
    const renderEngine = new RenderEngine()
    const window = new QMainWindow()
    const centralWidget = new QWidget()
    const centralLayout = new FlexLayout()

    centralWidget.setLayout(centralLayout)
    window.setCentralWidget(centralWidget)
    window.setWindowTitle(title)
    window.resize(width, height)
    window.setStyleSheet(styleSheet)

    let shown = false
    let renderedWidget = null

    return {
        mount(rootNode, context) {
            const nextWidget = renderEngine.mount(rootNode, context)

            if (renderedWidget) {
                centralLayout.removeWidget(renderedWidget)
                renderedWidget.hide()
                renderedWidget.deleteLater()
            }

            centralLayout.addWidget(nextWidget)
            nextWidget.show()
            renderedWidget = nextWidget

            if (!shown) {
                window.show()
                shown = true
            }

            return nextWidget
        },
        renderEngine,
        window
    }
}

module.exports = { RenderEngine, createDesktopRenderer }
