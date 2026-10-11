const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8
const DOCUMENT_NODE = 9
const DOCUMENT_FRAGMENT_NODE = 11

// Hilfsfunktion, um alle Nachkommen eines Nodes rekursiv zu sammeln
function descendantsOf(node) {
    return node.childNodes.flatMap((child) => [child, ...descendantsOf(child)])
}

function parseSimpleSelector(selector) {
    return {
        tagName: selector.match(/^[a-zA-Z][\w-]*/)?.[0]?.toLowerCase(),
        id: selector.match(/#([\w-]+)/)?.[1],
        classNames: [...selector.matchAll(/\.([\w-]+)/g)].map(
            (match) => match[1]
        )
    }
}

function matchesSimpleSelector(element, selector) {
    const { tagName, id, classNames } = parseSimpleSelector(selector)

    // wenn kein Tagname, keine ID und keine Klassen angegeben sind, stimmt der Selektor immer
    return (
        (!tagName || element.localName === tagName) &&
        (!id || element.id === id) &&
        classNames.every((className) => element.classList.includes(className))
    )
}

function matchesSelector(element, selector) {
    const parts = selector.trim().split(/\s+/)
    let candidate = element

    if (!matchesSimpleSelector(candidate, parts.pop())) {
        return false
    }

    while (parts.length > 0) {
        const part = parts.pop()
        candidate = candidate.parentElement

        // durch Vererbung der Elternkette nach oben gehen, um einen matchenden Vorfahren zu finden
        while (candidate && !matchesSimpleSelector(candidate, part)) {
            candidate = candidate.parentElement
        }

        if (!candidate) {
            return false
        }
    }

    return true
}

class EventTarget {}

class Node extends EventTarget {
    constructor(nodeType, ownerDocument = null) {
        super()
        this.nodeType = nodeType
        this.ownerDocument = ownerDocument
        this.parentNode = null
        this.childNodes = []
        this.qt = null
        this._renderBinding = null
    }

    get firstChild() {
        return this.childNodes[0] ?? null
    }

    get lastChild() {
        return this.childNodes.at(-1) ?? null
    }

    get parentElement() {
        return this.parentNode instanceof Element ? this.parentNode : null
    }

    appendChild(node) {
        if (!(node instanceof Node)) {
            throw new TypeError('appendChild erwartet einen Node')
        }

        if (node === this || node.contains(this)) {
            throw new Error(
                'Ein Node kann nicht in sich selbst eingefügt werden'
            )
        }

        if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
            // Wenn der Node ein Dokumentfragment ist, werden seine Kinder durchlaufen und eingefügt, nicht das Fragment selbst
            while (node.firstChild) {
                this.appendChild(node.firstChild)
            }

            return node
        }

        node.remove()
        node.parentNode = this

        this.childNodes.push(node)
        this._notify({
            addedNodes: [node],
            nextSibling: null,
            removedNodes: []
        })

        return node
    }

    append(...nodes) {
        for (const node of nodes) {
            this.appendChild(
                node instanceof Node
                    ? node
                    : this.ownerDocument.createTextNode(node)
            )
        }
    }

    insertBefore(node, referenceNode) {
        if (referenceNode === null || referenceNode === undefined) {
            return this.appendChild(node)
        }

        const referenceIndex = this.childNodes.indexOf(referenceNode)

        if (referenceIndex === -1) {
            throw new Error('Der Referenz-Node ist kein Kind dieses Nodes')
        }

        if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
            for (const child of [...node.childNodes]) {
                this.insertBefore(child, referenceNode)
            }

            return node
        }

        node.remove()
        node.parentNode = this
        this.childNodes.splice(referenceIndex, 0, node)
        this._notify({
            addedNodes: [node],
            nextSibling: referenceNode,
            removedNodes: []
        })

        return node
    }

    removeChild(node) {
        const index = this.childNodes.indexOf(node)

        if (index === -1) {
            throw new Error('Der Node ist kein Kind dieses Nodes')
        }

        this.childNodes.splice(index, 1)
        node.parentNode = null
        this._notify({
            addedNodes: [],
            nextSibling: this.childNodes[index] ?? null,
            removedNodes: [node]
        })

        return node
    }

    remove() {
        this.parentNode?.removeChild(this)
    }

    replaceChildren(...nodes) {
        for (const child of [...this.childNodes]) {
            this.removeChild(child)
        }

        this.append(...nodes)
    }

    contains(node) {
        return node === this || descendantsOf(this).includes(node)
    }

    get textContent() {
        return this.childNodes.map((child) => child.textContent).join('')
    }

    set textContent(value) {
        this.replaceChildren(String(value))
    }

    _notify(record) {
        this._updateRenderBinding({
            target: this,
            type: 'childList',
            ...record
        })
    }

    // Die Render-Bindung verbindet einen DOM-Knoten mit seinem Qt-Widget und
    // leitet DOM-Änderungen an die RenderEngine weiter. Nicht jeder Knoten hat
    // eine eigene Bindung: Textknoten innerhalb eines atomar gerenderten
    // Elements werden etwa vom Widget ihres Elternelements dargestellt.
    // Deshalb wird die Elternkette bis zur nächsten Bindung durchlaufen.
    _updateRenderBinding(change) {
        let node = this

        while (node && !node._renderBinding) {
            node = node.parentNode
        }

        node?._renderBinding.update(change)
    }
}

Object.assign(Node, {
    COMMENT_NODE,
    DOCUMENT_FRAGMENT_NODE,
    DOCUMENT_NODE,
    ELEMENT_NODE,
    TEXT_NODE
})

class Text extends Node {
    constructor(data, ownerDocument) {
        super(TEXT_NODE, ownerDocument)
        this.data = String(data)
    }

    get textContent() {
        return this.data
    }

    set textContent(value) {
        this.data = String(value)

        this._updateRenderBinding({
            target: this,
            type: 'characterData'
        })
    }

    cloneNode() {
        return new Text(this.data, this.ownerDocument)
    }
}

class DocumentFragment extends Node {
    constructor(ownerDocument) {
        super(DOCUMENT_FRAGMENT_NODE, ownerDocument)
    }

    get children() {
        return this.childNodes.filter((child) => child instanceof Element)
    }

    cloneNode(deep = false) {
        const clone = new DocumentFragment(this.ownerDocument)

        if (deep) {
            clone.append(
                ...this.childNodes.map((child) => child.cloneNode(true))
            )
        }

        return clone
    }
}

class NamedNodeMap {
    constructor() {
        this.values = new Map()
    }

    get length() {
        return this.values.size
    }

    set(name, value) {
        this.values.set(name, value)
    }

    get(name) {
        return this.values.get(name)
    }

    has(name) {
        return this.values.has(name)
    }

    delete(name) {
        return this.values.delete(name)
    }

    getNamedItem(name) {
        const normalizedName = String(name).toLowerCase()

        return this.has(normalizedName)
            ? { name: normalizedName, value: this.get(normalizedName) }
            : null
    }

    // Iterator für die NamedNodeMap, gibt jedes Attribut als { name, value } zurück
    *[Symbol.iterator]() {
        for (const [name, value] of this.values) {
            yield { name, value }
        }
    }
}

class DOMTokenList {
    constructor(element) {
        this.element = element
    }

    add(...tokens) {
        const values = new Set(this._values())
        tokens.forEach((token) => values.add(String(token)))
        this.element.className = [...values].join(' ')
    }

    contains(token) {
        return this._values().includes(String(token))
    }

    includes(token) {
        return this.contains(token)
    }

    _values() {
        return this.element.className.split(/\s+/).filter(Boolean)
    }
}

class Element extends Node {
    constructor(tagName, ownerDocument = null) {
        super(ELEMENT_NODE, ownerDocument)
        this.localName = String(tagName).toLowerCase()
        this.tagName = this.localName.toUpperCase()
        this.attributes = new NamedNodeMap()
        this.classList = new DOMTokenList(this)
        this.dataset = {}

        // Der Proxy macht direkte Änderungen wie style.display = 'none'
        // beobachtbar, obwohl style weiterhin wie ein normales Objekt nutzbar ist.
        this.style = new Proxy(
            {},
            {
                deleteProperty: (target, name) => {
                    delete target[name]
                    this._notifyAttribute(`style.${String(name)}`)
                    return true
                },
                set: (target, name, value) => {
                    target[name] = value
                    this._notifyAttribute(`style.${String(name)}`)
                    return true
                }
            }
        )
    }

    get children() {
        return this.childNodes.filter((child) => child instanceof Element)
    }

    get id() {
        return this.getAttribute('id') ?? ''
    }

    set id(value) {
        this.setAttribute('id', value)
    }

    get className() {
        return this.getAttribute('class') ?? ''
    }

    set className(value) {
        this.setAttribute('class', value)
    }

    setAttribute(name, value) {
        const normalizedName = String(name).toLowerCase()
        this.attributes.set(normalizedName, String(value))
        this._notifyAttribute(normalizedName)
    }

    getAttribute(name) {
        return this.attributes.get(String(name).toLowerCase()) ?? null
    }

    hasAttribute(name) {
        return this.attributes.has(String(name).toLowerCase())
    }

    removeAttribute(name) {
        const normalizedName = String(name).toLowerCase()
        this.attributes.delete(normalizedName)
        this._notifyAttribute(normalizedName)
    }

    _notifyAttribute(attributeName) {
        this._updateRenderBinding({
            attributeName,
            target: this,
            type: 'attributes'
        })
    }

    cloneNode(deep = false) {
        const clone = this.ownerDocument.createElement(this.localName)

        for (const { name, value } of this.attributes) {
            clone.setAttribute(name, value)
        }

        Object.assign(clone.style, this.style)

        if (deep) {
            clone.append(
                ...this.childNodes.map((child) => child.cloneNode(true))
            )
        }

        return clone
    }

    matches(selector) {
        return selector
            .split(',')
            .some((part) => matchesSelector(this, part.trim()))
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector) {
        return descendantsOf(this).filter(
            (node) => node instanceof Element && node.matches(selector)
        )
    }
}

class HTMLElement extends Element {}

class HTMLTemplateElement extends HTMLElement {
    constructor(ownerDocument) {
        super('template', ownerDocument)
        this.content = new DocumentFragment(ownerDocument)
    }

    appendChild(node) {
        return this.content.appendChild(node)
    }

    append(...nodes) {
        this.content.append(...nodes)
    }

    replaceChildren(...nodes) {
        this.content.replaceChildren(...nodes)
    }

    cloneNode(deep = false) {
        const clone = super.cloneNode(false)
        if (deep) {
            clone.content.append(
                ...this.content.childNodes.map((child) =>
                    child.cloneNode(true)
                )
            )
        }
        return clone
    }
}

class Document extends Node {
    constructor() {
        super(DOCUMENT_NODE)
        this.ownerDocument = this
        this.documentElement = this.createElement('html')
        this.body = this.createElement('body')
        this.documentElement.appendChild(this.body)
        this.appendChild(this.documentElement)
    }

    createElement(tagName) {
        if (String(tagName).toLowerCase() === 'template') {
            return new HTMLTemplateElement(this)
        }

        return new HTMLElement(tagName, this)
    }

    createTextNode(data) {
        return new Text(data, this)
    }

    createDocumentFragment() {
        return new DocumentFragment(this)
    }

    getElementById(id) {
        return this.querySelector(`#${id}`)
    }

    getElementsByTagName(tagName) {
        const normalizedTagName = String(tagName).toLowerCase()

        return this._elements().filter(
            (element) =>
                normalizedTagName === '*' ||
                element.localName === normalizedTagName
        )
    }

    getElementsByClassName(className) {
        const classNames = String(className).split(/\s+/).filter(Boolean)

        return this._elements().filter((element) =>
            classNames.every((name) => element.classList.includes(name))
        )
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null
    }

    querySelectorAll(selector) {
        return this._elements().filter((element) => element.matches(selector))
    }

    _elements() {
        return [
            this.documentElement,
            ...descendantsOf(this.documentElement),
        ].filter((node) => node instanceof Element)
    }
}

module.exports = {
    COMMENT_NODE,
    DOCUMENT_FRAGMENT_NODE,
    DOCUMENT_NODE,
    ELEMENT_NODE,
    TEXT_NODE,
    Document,
    DocumentFragment,
    Element,
    EventTarget,
    HTMLTemplateElement,
    HTMLElement,
    NamedNodeMap,
    Node,
    Text
}
