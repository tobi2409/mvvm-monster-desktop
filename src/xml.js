const { XMLParser, XMLValidator } = require('fast-xml-parser')

const parser = new XMLParser({
    attributeNamePrefix: '',
    ignoreAttributes: false,
    preserveOrder: true,
    trimValues: false
})

function parseXml(document, source) {
    const validation = XMLValidator.validate(source)

    if (validation !== true) {
        const { line, col, msg } = validation.err

        throw new SyntaxError(
            `Ungültiges XML in Zeile ${line}, Spalte ${col}: ${msg}`
        )
    }

    const entries = parser.parse(source).filter(isElementEntry)

    if (entries.length !== 1) {
        throw new SyntaxError('Das Layout muss genau ein Wurzelelement haben')
    }

    return createNode(document, entries[0])
}

function appendXml(document, parentNode, source) {
    const root = parseXml(document, source)

    // Append all child nodes of the root element to the parent node
    while (root.firstChild) {
        parentNode.appendChild(root.firstChild)
    }

    return parentNode
}

function createNode(document, entry) {
    // If the entry represents a text node, create and return it immediately
    if (Object.hasOwn(entry, '#text')) {
        const text = entry['#text']
        // Trim the text content to check if it's only whitespace
        return /^\s*$/.test(text) ? null : document.createTextNode(text)
    }

    const tagName = Object.keys(entry).find(
        (name) => name !== ':@' && !name.startsWith('#')
    )

    if (!tagName) {
        return null
    }

    const element = document.createElement(tagName)

    for (const [name, value] of Object.entries(entry[':@'] ?? {})) {
        element.setAttribute(name, value)
    }

    for (const childEntry of entry[tagName] ?? []) {
        const child = createNode(document, childEntry)

        if (child) {
            element.appendChild(child)
        }
    }

    return element
}

function isElementEntry(entry) {
    return Object.keys(entry).some(
        (name) => name !== ':@' && !name.startsWith('#')
    )
}

module.exports = { appendXml, parseXml }
