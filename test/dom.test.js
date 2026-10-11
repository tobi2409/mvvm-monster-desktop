const assert = require("node:assert/strict")
const { QtEvent, createQtDocument } = require("../src/dom")

const document = createQtDocument().installGlobals()
const panel = document.createElement("section")
const button = document.createElement("button")
const label = document.createElement("span")

panel.id = "tasks"
panel.classList.add("panel", "active")
panel.style.backgroundColor = "#ffffff"
button.className = "action primary"
button.setAttribute("data-kind", "create")
button.textContent = "Hinzufügen"
panel.append(button)
panel.insertBefore(label, button)
document.body.append(panel)

assert.equal(document.getElementById("tasks"), panel)
assert.equal(
    document.querySelector("section.panel .action[data-kind=create]"),
    button,
)
assert.deepEqual(document.querySelectorAll(".primary"), [button])
assert.deepEqual(document.getElementsByTagName("button"), [button])
assert.deepEqual(panel.getElementsByClassName("action primary"), [button])
assert.equal(button.closest("#tasks"), panel)
assert.equal(panel.style.backgroundColor, "#ffffff")
assert.equal(label.nextSibling, button)
assert.equal(panel.contains(button), true)

let eventCount = 0
button.addEventListener("custom", () => eventCount++, { once: true })
button.dispatchEvent(new QtEvent("custom"))
button.dispatchEvent(new QtEvent("custom"))
assert.equal(eventCount, 1)

button.remove()
assert.deepEqual(panel.children, [label])
;(async () => {
    const { default: TemplateEngine } = await import("@tobi2409/mvvm-monster")
    const template = document.createElement("template")
    template.id = "reactive-template"

    const heading = document.createElement("h1")
    const headingGet = document.createElement("get")
    heading.id = "heading"
    headingGet.textContent = "title"
    heading.append(headingGet)

    const each = document.createElement("each")
    each.setAttribute("of", "items")
    each.setAttribute("as", "item")
    const row = document.createElement("div")
    row.className = "row"
    const itemGet = document.createElement("get")
    itemGet.textContent = "item.name"
    row.append(itemGet)
    each.append(row)

    const condition = document.createElement("if")
    condition.setAttribute("test", "visible")
    const message = document.createElement("p")
    message.id = "message"
    const messageGet = document.createElement("get")
    messageGet.textContent = "message"
    message.append(messageGet)
    condition.append(message)

    template.append(heading, each, condition)
    document.body.append(template)

    const templateUse = document.createElement("template-use")
    templateUse.setAttribute("template-id", "reactive-template")
    templateUse.setAttribute("mount-id", "tasks")

    const viewModel = TemplateEngine.reactive(
        {
            title: "Vorher",
            visible: false,
            message: "Sichtbar",
            items: [{ name: "Eins" }],
        },
        templateUse,
    )

    assert.equal(panel.querySelector("#heading").textContent, "Vorher")
    assert.equal(panel.querySelectorAll(".row").length, 1)
    assert.equal(panel.querySelector("#message"), null)

    viewModel.title = "Nachher"
    viewModel.items.push({ name: "Zwei" })
    viewModel.visible = true

    assert.equal(panel.querySelector("#heading").textContent, "Nachher")
    assert.equal(panel.querySelectorAll(".row").length, 2)
    assert.equal(panel.querySelector("#message").textContent, "Sichtbar")

    console.log("Qt-DOM and mvvm-monster tests passed")
    process.exit(0)
})().catch((error) => {
    console.error(error)
    process.exit(1)
})
