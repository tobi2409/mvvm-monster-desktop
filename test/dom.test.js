const assert = require("node:assert/strict")
const {
    Document,
    Element,
    EventTarget,
    HTMLElement,
    Node,
} = require("../src/dom")

const document = new Document()
const main = document.createElement("main")
const section = document.createElement("section")
const button = document.createElement("button")

main.id = "app"
main.className = "layout desktop"
section.className = "panel active"
button.id = "save"
button.className = "action primary"

section.appendChild(button)
main.appendChild(section)
document.body.appendChild(main)

assert.ok(document instanceof EventTarget)
assert.ok(document instanceof Node)
assert.ok(main instanceof Element)
assert.ok(main instanceof HTMLElement)

assert.equal(document.getElementById("save"), button)
assert.deepEqual(document.getElementsByTagName("section"), [section])
assert.deepEqual(document.getElementsByClassName("panel active"), [section])
assert.equal(document.querySelector("#app .action"), button)
assert.deepEqual(document.querySelectorAll("main .primary"), [button])
assert.equal(main.querySelector("section #save"), button)
assert.deepEqual(main.querySelectorAll(".panel"), [section])

button.remove()
assert.equal(section.querySelector("#save"), null)

console.log("DOM tests passed")
