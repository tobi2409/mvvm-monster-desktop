const assert = require('node:assert/strict')
const { Document } = require('../src/dom')
const { appendXml, parseXml } = require('../src/xml')

const document = new Document()
const layout = `
    <application>
        <template id="example"><label>Hallo</label></template>
        <main id="app" />
    </application>
`

appendXml(document, document.body, layout)

assert.equal(document.body.children.length, 2)
assert.equal(document.querySelector('template').content.children.length, 1)

assert.equal(
    document.querySelector('template').content.children[0].localName,
    'label'
)

assert.equal(document.getElementById('app').localName, 'main')
assert.throws(
    () => parseXml(document, '<application><main></application>'),
    /Ungültiges XML/
)

console.log('XML tests passed')
