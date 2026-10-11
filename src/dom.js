const {
    FlexLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QWidget,
} = require("@nodegui/nodegui")

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8
const DOCUMENT_NODE = 9
const DOCUMENT_FRAGMENT_NODE = 11

const eventNames = {
    change: "editingFinished",
    click: "clicked",
    input: "textChanged",
}

const containerTags = new Set([
    "article",
    "aside",
    "body",
    "div",
    "footer",
    "form",
    "header",
    "html",
    "main",
    "nav",
    "section",
])

const controlTags = new Set(["each", "if"])

function toKebabCase(value) {
    return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function descendantsOf(node) {
    return node.childNodes.flatMap((child) => [child, ...descendantsOf(child)])
}

function unquote(value) {
    return value.replace(
        /^(?:"(.*)"|'(.*)')$/,
        (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted,
    )
}

function matchesSimpleSelector(element, selector) {
    const tag = selector.match(/^[a-zA-Z][\w-]*/)?.[0]
    if (tag && element.localName !== tag.toLowerCase()) {
        return false
    }

    const id = selector.match(/#([\w-]+)/)?.[1]
    if (id && element.id !== id) {
        return false
    }

    for (const className of selector.matchAll(/\.([\w-]+)/g)) {
        if (!element.classList.contains(className[1])) {
            return false
        }
    }

    for (const attribute of selector.matchAll(/\[([\w-]+)(?:=([^\]]+))?\]/g)) {
        if (!element.hasAttribute(attribute[1])) {
            return false
        }
        if (
            attribute[2] !== undefined &&
            element.getAttribute(attribute[1]) !== unquote(attribute[2].trim())
        ) {
            return false
        }
    }

    return true
}

function matchesSelector(element, selector) {
    const parts = selector.trim().split(/\s+/)
    let candidate = element

    if (!matchesSimpleSelector(candidate, parts.pop())) {
        return false
    }

    while (parts.length) {
        const part = parts.pop()
        candidate = candidate.parentElement

        while (candidate && !matchesSimpleSelector(candidate, part)) {
            candidate = candidate.parentElement
        }

        if (!candidate) {
            return false
        }
    }

    return true
}

class QtEvent {
    constructor(type, options = {}) {
        this.type = type
        this.bubbles = options.bubbles ?? false
        this.cancelable = options.cancelable ?? false
        this.defaultPrevented = false
        this.target = null
        this.currentTarget = null
        this.detail = options.detail
    }

    preventDefault() {
        if (this.cancelable) {
            this.defaultPrevented = true
        }
    }

    stopPropagation() {
        this.propagationStopped = true
    }
}

class QtNode {
    constructor(ownerDocument, nodeType) {
        this.ownerDocument = ownerDocument
        this.nodeType = nodeType
        this.parentNode = null
        this.childNodes = []
    }

    get firstChild() {
        return this.childNodes[0] ?? null
    }

    get lastChild() {
        return this.childNodes.at(-1) ?? null
    }

    get parentElement() {
        return this.parentNode?.nodeType === ELEMENT_NODE
            ? this.parentNode
            : null
    }

    get previousSibling() {
        if (!this.parentNode) return null
        const index = this.parentNode.childNodes.indexOf(this)
        return this.parentNode.childNodes[index - 1] ?? null
    }

    get nextSibling() {
        if (!this.parentNode) return null
        const index = this.parentNode.childNodes.indexOf(this)
        return this.parentNode.childNodes[index + 1] ?? null
    }

    appendChild(child) {
        if (!(child instanceof QtNode)) {
            throw new TypeError("appendChild erwartet einen QtNode.")
        }
        if (child === this || descendantsOf(child).includes(this)) {
            throw new Error(
                "Ein Knoten kann nicht in sich selbst eingefügt werden.",
            )
        }
        if (child.nodeType === DOCUMENT_FRAGMENT_NODE) {
            while (child.firstChild) {
                this.appendChild(child.firstChild)
            }
            return child
        }

        child.parentNode?.removeChild(child)
        this.childNodes.push(child)
        child.parentNode = this
        this._attachQtChild?.(child)
        return child
    }

    insertBefore(child, referenceChild) {
        if (referenceChild === null) {
            return this.appendChild(child)
        }
        if (!this.childNodes.includes(referenceChild)) {
            throw new Error("Der Referenzknoten ist kein Kind dieses Elements.")
        }
        if (child === referenceChild) {
            return child
        }
        if (child.nodeType === DOCUMENT_FRAGMENT_NODE) {
            for (const fragmentChild of [...child.childNodes]) {
                this.insertBefore(fragmentChild, referenceChild)
            }
            return child
        }

        child.parentNode?.removeChild(child)
        const index = this.childNodes.indexOf(referenceChild)
        this.childNodes.splice(index, 0, child)
        child.parentNode = this
        this._attachQtChild?.(child, referenceChild)
        return child
    }

    append(...nodes) {
        for (const node of nodes) {
            this.appendChild(
                node instanceof QtNode
                    ? node
                    : this.ownerDocument.createTextNode(String(node)),
            )
        }
    }

    removeChild(child) {
        const index = this.childNodes.indexOf(child)
        if (index === -1) {
            throw new Error("Der Knoten ist kein Kind dieses Elements.")
        }

        this._detachQtChild?.(child)
        this.childNodes.splice(index, 1)
        child.parentNode = null
        return child
    }

    replaceChildren(...nodes) {
        for (const child of [...this.childNodes]) {
            this.removeChild(child)
        }
        this.append(...nodes)
    }

    remove() {
        this.parentNode?.removeChild(this)
    }

    contains(node) {
        return node === this || descendantsOf(this).includes(node)
    }

    get textContent() {
        return this.childNodes.map((child) => child.textContent).join("")
    }

    set textContent(value) {
        this.replaceChildren(String(value))
    }
}

class QtText extends QtNode {
    constructor(ownerDocument, data) {
        super(ownerDocument, TEXT_NODE)
        this.qt = new QLabel()
        this.data = String(data)
        this.qt.setText(this.data)
    }

    get textContent() {
        return this.data
    }

    set textContent(value) {
        this.data = String(value)
        this.qt.setText(this.data)
    }

    cloneNode() {
        return this.ownerDocument.createTextNode(this.data)
    }
}

class QtDocumentFragment extends QtNode {
    constructor(ownerDocument) {
        super(ownerDocument, DOCUMENT_FRAGMENT_NODE)
        this.nodeName = "#document-fragment"
    }

    get children() {
        return this.childNodes.filter(
            (child) => child.nodeType === ELEMENT_NODE,
        )
    }

    cloneNode(deep = false) {
        const clone = this.ownerDocument.createDocumentFragment()
        if (deep) {
            clone.append(
                ...this.childNodes.map((child) => child.cloneNode(true)),
            )
        }
        return clone
    }
}

class QtNamedNodeMap {
    constructor(element) {
        this.element = element

        return new Proxy(this, {
            get: (target, property) => {
                if (property in target || typeof property === "symbol")
                    return target[property]
                return target.getNamedItem(property)
            },
        })
    }

    get length() {
        return this.element._attributes.size
    }

    getNamedItem(name) {
        const normalizedName = String(name).toLowerCase()
        if (!this.element._attributes.has(normalizedName)) return null
        return {
            name: normalizedName,
            value: this.element._attributes.get(normalizedName),
        }
    }

    item(index) {
        return [...this][index] ?? null
    }

    *[Symbol.iterator]() {
        for (const [name, value] of this.element._attributes) {
            yield { name, value }
        }
    }
}

function createDataset(element) {
    const attributeName = (property) => `data-${toKebabCase(String(property))}`
    return new Proxy(
        {},
        {
            get: (_, property) => element.getAttribute(attributeName(property)),
            set: (_, property, value) => {
                element.setAttribute(attributeName(property), value)
                return true
            },
            ownKeys: () =>
                [...element._attributes.keys()]
                    .filter((name) => name.startsWith("data-"))
                    .map((name) =>
                        name
                            .slice(5)
                            .replace(/-([a-z])/g, (_, letter) =>
                                letter.toUpperCase(),
                            ),
                    ),
            getOwnPropertyDescriptor: () => ({
                enumerable: true,
                configurable: true,
            }),
        },
    )
}

class QtTokenList {
    constructor(element) {
        this.element = element
        this.tokens = new Set()
    }

    add(...tokens) {
        tokens.forEach((token) => this.tokens.add(token))
        this._sync()
    }

    remove(...tokens) {
        tokens.forEach((token) => this.tokens.delete(token))
        this._sync()
    }

    contains(token) {
        return this.tokens.has(token)
    }

    toggle(token, force) {
        const enabled = force ?? !this.contains(token)
        enabled ? this.tokens.add(token) : this.tokens.delete(token)
        this._sync()
        return enabled
    }

    set value(value) {
        this.tokens = new Set(String(value).split(/\s+/).filter(Boolean))
        this._sync()
    }

    get value() {
        return [...this.tokens].join(" ")
    }

    _sync() {
        this.element._attributes.set("class", this.value)
        this.element.qt.setProperty("class", this.value)
        this.element.qt.repolish()
    }

    toString() {
        return this.value
    }
}

class QtStyleDeclaration {
    constructor(element) {
        this.element = element
        this.properties = new Map()

        return new Proxy(this, {
            get: (target, property) =>
                property in target
                    ? target[property]
                    : target.getPropertyValue(toKebabCase(property)),
            set: (target, property, value) => {
                if (property in target) {
                    target[property] = value
                } else {
                    target.setProperty(toKebabCase(property), value)
                }
                return true
            },
        })
    }

    setProperty(name, value) {
        if (value === "" || value === null || value === undefined) {
            this.properties.delete(name)
        } else {
            this.properties.set(name, String(value))
        }
        this._sync()
    }

    getPropertyValue(name) {
        return this.properties.get(name) ?? ""
    }

    removeProperty(name) {
        const previous = this.getPropertyValue(name)
        this.properties.delete(name)
        this._sync()
        return previous
    }

    set cssText(value) {
        this.properties.clear()
        for (const declaration of String(value).split(";")) {
            const separator = declaration.indexOf(":")
            if (separator > -1) {
                this.properties.set(
                    declaration.slice(0, separator).trim(),
                    declaration.slice(separator + 1).trim(),
                )
            }
        }
        this._sync()
    }

    get cssText() {
        return [...this.properties]
            .map(([name, value]) => `${name}: ${value};`)
            .join(" ")
    }

    _sync() {
        const display = this.properties.get("display")
        if (display === "none") {
            this.element.qt.hide()
        } else if (
            display !== undefined ||
            this.element._attributes.has("style")
        ) {
            this.element.qt.show()
        }

        const qtStyle = [...this.properties]
            .filter(([name]) => name !== "display")
            .map(([name, value]) => `${name}: ${value};`)
            .join(" ")
        if (qtStyle) this.element.qt.setInlineStyle(qtStyle)
        this.element._attributes.set("style", this.cssText)
    }
}

class QtElement extends QtNode {
    constructor(ownerDocument, tagName, qt, acceptsChildren) {
        super(ownerDocument, ELEMENT_NODE)
        this.localName = tagName
        this.tagName = tagName.toUpperCase()
        this.nodeName = this.tagName
        this.qt = qt
        this._attributes = new Map()
        this._listeners = new Map()
        this._acceptsChildren = acceptsChildren
        this.attributes = new QtNamedNodeMap(this)
        this.classList = new QtTokenList(this)
        this.dataset = createDataset(this)
        this.style = new QtStyleDeclaration(this)

        if (acceptsChildren) {
            this._layout = new FlexLayout()
            this.qt.setLayout(this._layout)
        }
    }

    get id() {
        return this.getAttribute("id") ?? ""
    }

    set id(value) {
        this.setAttribute("id", value)
    }

    get className() {
        return this.classList.value
    }

    set className(value) {
        this.classList.value = value
    }

    get children() {
        return this.childNodes.filter(
            (child) => child.nodeType === ELEMENT_NODE,
        )
    }

    get value() {
        return this.qt instanceof QLineEdit
            ? this.qt.text()
            : (this.getAttribute("value") ?? "")
    }

    set value(value) {
        this._attributes.set("value", String(value))
        if (this.qt instanceof QLineEdit) {
            this.qt.setText(String(value))
        }
    }

    get textContent() {
        if (!this._acceptsChildren && typeof this.qt.text === "function") {
            return this.childNodes.length ? super.textContent : this.qt.text()
        }
        return super.textContent
    }

    set textContent(value) {
        if (!this._acceptsChildren && typeof this.qt.setText === "function") {
            for (const child of this.childNodes) child.parentNode = null
            this.childNodes = []
            const text = String(value)
            if (text) {
                const textNode = this.ownerDocument.createTextNode(text)
                textNode.parentNode = this
                this.childNodes.push(textNode)
            }
            this.qt.setText(text)
            return
        }
        super.textContent = value
    }

    get innerText() {
        return this.textContent
    }

    set innerText(value) {
        this.textContent = value
    }

    appendChild(child) {
        if (!this._acceptsChildren && child.nodeType !== TEXT_NODE) {
            throw new Error(
                `<${this.localName}> kann keine Qt-Kindelemente aufnehmen.`,
            )
        }
        return super.appendChild(child)
    }

    insertBefore(child, referenceChild) {
        if (!this._acceptsChildren && child.nodeType !== TEXT_NODE) {
            throw new Error(
                `<${this.localName}> kann keine Qt-Kindelemente aufnehmen.`,
            )
        }
        return super.insertBefore(child, referenceChild)
    }

    _attachQtChild(child, referenceChild = null) {
        if (!this._acceptsChildren) {
            this.qt.setText(super.textContent)
            return
        }
        if (child.localName === "template") return
        if (referenceChild) {
            this._layout.insertChildBefore(child.qt, referenceChild.qt)
        } else {
            this._layout.addWidget(child.qt)
        }
        if (!child.style || child.style.getPropertyValue("display") !== "none")
            child.qt.show()
    }

    _detachQtChild(child) {
        if (!this._acceptsChildren) {
            this.qt.setText(
                this.childNodes
                    .filter((candidate) => candidate !== child)
                    .map((candidate) => candidate.textContent)
                    .join(""),
            )
            return
        }
        if (child.localName === "template") return
        this._layout.removeWidget(child.qt)
        child.qt.hide()
    }

    setAttribute(name, value) {
        const normalizedName = name.toLowerCase()
        const normalizedValue = String(value)
        this._attributes.set(normalizedName, normalizedValue)

        if (normalizedName === "id") this.qt.setObjectName(normalizedValue)
        if (normalizedName === "class") this.classList.value = normalizedValue
        if (normalizedName === "placeholder" && this.qt instanceof QLineEdit)
            this.qt.setPlaceholderText(normalizedValue)
        if (normalizedName === "title") this.qt.setToolTip(normalizedValue)
        if (normalizedName === "disabled") this.qt.setEnabled(false)
        if (normalizedName === "style") this.style.cssText = normalizedValue
        if (normalizedName === "value") this.value = normalizedValue
    }

    getAttribute(name) {
        return this._attributes.get(name.toLowerCase()) ?? null
    }

    hasAttribute(name) {
        return this._attributes.has(name.toLowerCase())
    }

    removeAttribute(name) {
        const normalizedName = name.toLowerCase()
        this._attributes.delete(normalizedName)
        if (normalizedName === "id") this.qt.setObjectName("")
        if (normalizedName === "class") this.classList.value = ""
        if (normalizedName === "disabled") this.qt.setEnabled(true)
        if (normalizedName === "style") this.style.cssText = ""
    }

    toggleAttribute(name, force) {
        const enabled = force ?? !this.hasAttribute(name)
        enabled ? this.setAttribute(name, "") : this.removeAttribute(name)
        return enabled
    }

    addEventListener(type, callback, options = {}) {
        const qtEventName = eventNames[type] ?? type
        const record = {
            callback,
            once: typeof options === "object" && options.once,
            wrapper: (...detail) =>
                this._invokeListener(type, callback, detail),
        }
        const records = this._listeners.get(type) ?? []
        records.push(record)
        this._listeners.set(type, records)
        this.qt.addEventListener(qtEventName, record.wrapper)
    }

    removeEventListener(type, callback) {
        const records = this._listeners.get(type) ?? []
        for (const record of records.filter(
            (candidate) => candidate.callback === callback,
        )) {
            this.qt.removeEventListener(
                eventNames[type] ?? type,
                record.wrapper,
            )
        }
        this._listeners.set(
            type,
            records.filter((record) => record.callback !== callback),
        )
    }

    _invokeListener(
        type,
        callback,
        detail,
        event = new QtEvent(type, { detail }),
    ) {
        event.target ??= this
        event.currentTarget = this
        callback.call(this, event)

        const record = (this._listeners.get(type) ?? []).find(
            (candidate) => candidate.callback === callback,
        )
        if (record?.once) {
            this.removeEventListener(type, callback)
        }
    }

    dispatchEvent(event) {
        if (!(event instanceof QtEvent)) {
            throw new TypeError("dispatchEvent erwartet ein QtEvent.")
        }
        event.target ??= this
        for (const { callback } of [
            ...(this._listeners.get(event.type) ?? []),
        ]) {
            this._invokeListener(event.type, callback, event.detail, event)
            if (event.propagationStopped) break
        }
        if (event.bubbles && !event.propagationStopped) {
            this.parentElement?.dispatchEvent(event)
        }
        return !event.defaultPrevented
    }

    click() {
        if (typeof this.qt.click === "function") {
            this.qt.click()
        } else {
            this.dispatchEvent(new QtEvent("click"))
        }
    }

    focus() {
        this.qt.setFocus()
    }

    cloneNode(deep = false) {
        const clone = this.ownerDocument.createElement(this.localName)
        for (const { name, value } of this.attributes) {
            clone.setAttribute(name, value)
        }
        if (deep) {
            clone.append(
                ...this.childNodes.map((child) => child.cloneNode(true)),
            )
        }
        return clone
    }

    matches(selector) {
        return selector.split(",").some((part) => matchesSelector(this, part))
    }

    closest(selector) {
        let element = this
        while (element) {
            if (element.matches(selector)) return element
            element = element.parentElement
        }
        return null
    }

    querySelectorAll(selector) {
        return descendantsOf(this).filter(
            (node) => node.nodeType === ELEMENT_NODE && node.matches(selector),
        )
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null
    }

    getElementsByTagName(tagName) {
        const normalizedTag = String(tagName).toLowerCase()
        return descendantsOf(this).filter(
            (node) =>
                node.nodeType === ELEMENT_NODE &&
                (normalizedTag === "*" || node.localName === normalizedTag),
        )
    }

    getElementsByClassName(className) {
        const classes = String(className).split(/\s+/).filter(Boolean)
        return descendantsOf(this).filter(
            (node) =>
                node.nodeType === ELEMENT_NODE &&
                classes.every((name) => node.classList.contains(name)),
        )
    }
}

class QtTemplateElement extends QtElement {
    constructor(ownerDocument) {
        super(ownerDocument, "template", new QWidget(), false)
        this.content = new QtDocumentFragment(ownerDocument)
    }

    appendChild(child) {
        return this.content.appendChild(child)
    }

    insertBefore(child, referenceChild) {
        return this.content.insertBefore(child, referenceChild)
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
                    child.cloneNode(true),
                ),
            )
        }
        return clone
    }
}

class QtDocument extends QtNode {
    constructor() {
        super(null, DOCUMENT_NODE)
        this.ownerDocument = this
        this.documentElement = this.createElement("html")
        this.body = this.createElement("body")
        this.documentElement.appendChild(this.body)
        this.appendChild(this.documentElement)
        this.defaultView = null
    }

    createElement(tagName) {
        const normalizedTag = String(tagName).toLowerCase()
        let qt
        let acceptsChildren = false

        if (normalizedTag === "template") return new QtTemplateElement(this)
        if (normalizedTag === "button") qt = new QPushButton()
        else if (normalizedTag === "input") qt = new QLineEdit()
        else if (normalizedTag === "get") qt = new QLabel()
        else {
            qt = new QWidget()
            acceptsChildren =
                containerTags.has(normalizedTag) ||
                controlTags.has(normalizedTag) ||
                normalizedTag.includes("-") ||
                !["button", "input", "get"].includes(normalizedTag)
        }

        return new QtElement(this, normalizedTag, qt, acceptsChildren)
    }

    createTextNode(data) {
        return new QtText(this, data)
    }

    createDocumentFragment() {
        return new QtDocumentFragment(this)
    }

    getElementById(id) {
        return (
            [this.documentElement, ...descendantsOf(this.documentElement)].find(
                (node) => node.nodeType === ELEMENT_NODE && node.id === id,
            ) ?? null
        )
    }

    querySelectorAll(selector) {
        return [
            this.documentElement,
            ...descendantsOf(this.documentElement),
        ].filter(
            (node) => node.nodeType === ELEMENT_NODE && node.matches(selector),
        )
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null
    }

    getElementsByTagName(tagName) {
        const normalizedTag = String(tagName).toLowerCase()
        return [
            this.documentElement,
            ...descendantsOf(this.documentElement),
        ].filter(
            (node) =>
                node.nodeType === ELEMENT_NODE &&
                (normalizedTag === "*" || node.localName === normalizedTag),
        )
    }

    getElementsByClassName(className) {
        const classes = String(className).split(/\s+/).filter(Boolean)
        return [
            this.documentElement,
            ...descendantsOf(this.documentElement),
        ].filter(
            (node) =>
                node.nodeType === ELEMENT_NODE &&
                classes.every((name) => node.classList.contains(name)),
        )
    }

    mount(window) {
        this.defaultView = window
        window.setCentralWidget(this.documentElement.qt)
    }

    installGlobals(target = globalThis) {
        target.document = this
        target.Node = {
            ELEMENT_NODE,
            TEXT_NODE,
            COMMENT_NODE,
            DOCUMENT_NODE,
            DOCUMENT_FRAGMENT_NODE,
        }
        return this
    }

    setStyleSheet(css) {
        if (!this.defaultView) {
            throw new Error(
                "document.mount(window) muss vor setStyleSheet aufgerufen werden.",
            )
        }
        this.defaultView.setStyleSheet(css)
    }
}

function createQtDocument() {
    return new QtDocument()
}

module.exports = {
    COMMENT_NODE,
    ELEMENT_NODE,
    DOCUMENT_NODE,
    DOCUMENT_FRAGMENT_NODE,
    TEXT_NODE,
    QtDocument,
    QtDocumentFragment,
    QtElement,
    QtEvent,
    createQtDocument,
}
