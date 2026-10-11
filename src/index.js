const { QMainWindow } = require("@nodegui/nodegui")
const { createQtDocument } = require("./dom")

function createElement(document, tagName, attributes = {}, ...children) {
    const element = document.createElement(tagName)
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value)
    }
    element.append(...children.flat())
    return element
}

async function main() {
    const window = new QMainWindow()
    window.setWindowTitle("MVVM Monster Desktop")
    window.resize(720, 560)

    const document = createQtDocument().installGlobals()
    const { default: TemplateEngine } = await import("@tobi2409/mvvm-monster")
    const element = (tagName, attributes, ...children) =>
        createElement(document, tagName, attributes, ...children)

    const root = document.body
    root.id = "root"

    const template = element(
        "template",
        { id: "task-template" },
        element("span", { id: "eyebrow" }, "MVVM MONSTER + NODEGUI"),
        element("h1", { id: "title" }, element("get", {}, "heading")),
        element("p", { id: "subtitle" }, element("get", {}, "subtitle")),
        element(
            "form",
            { id: "form" },
            element("input", {
                id: "taskInput",
                placeholder: "Was möchtest du erledigen?",
                "bind-input-value": "draft",
            }),
            element(
                "button",
                { id: "addButton", "action-click": "addTask" },
                "Hinzufügen",
            ),
        ),
        element(
            "if",
            { test: "showStatus", wrapper: "section" },
            element("output", { id: "status" }, element("get", {}, "status")),
        ),
        element(
            "section",
            { id: "tasks" },
            element(
                "each",
                { of: "tasks", as: "task" },
                element(
                    "div",
                    { class: "task-row" },
                    element(
                        "span",
                        { class: "task-index" },
                        element("get", {}, "task.position"),
                    ),
                    element(
                        "span",
                        { class: "task-title" },
                        element("get", {}, "task.title"),
                    ),
                ),
            ),
        ),
    )

    const templateUse = element("template-use", {
        "template-id": "task-template",
        "mount-id": "root",
    })

    root.append(template)

    const viewModel = TemplateEngine.reactive(
        {
            heading: "Heute im Blick",
            subtitle:
                "Die Oberfläche wird deklarativ durch mvvm-monster gerendert.",
            draft: "",
            showStatus: false,
            status: "",
            tasks: [
                { position: "01", title: "Qt-DOM aufbauen" },
                { position: "02", title: "MVVM-Tags rendern" },
            ],
            addTask: (_event, data) => {
                const title = data.draft.trim()
                if (!title) return
                data.tasks.push({
                    position: String(data.tasks.length + 1).padStart(2, "0"),
                    title,
                })
                data.status = `Erfasst: ${title}`
                data.showStatus = true
                data.draft = ""
                document.getElementById("taskInput").focus()
            },
        },
        templateUse,
    )

    document.mount(window)
    document.setStyleSheet(`
  #root {
    background-color: #f4f1e8;
    flex: 1;
    padding: 42px;
  }

  #eyebrow {
    color: #b6402c;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 6px;
  }

  #title {
    color: #17201d;
    font-size: 34px;
    font-weight: bold;
    margin-bottom: 8px;
  }

  #subtitle {
    color: #57615d;
    font-size: 15px;
    margin-bottom: 28px;
  }

  #form {
    flex-direction: row;
    margin-bottom: 20px;
  }

  #taskInput {
    background-color: #ffffff;
    border: 1px solid #c9cec9;
    border-radius: 4px;
    color: #17201d;
    flex: 1;
    font-size: 15px;
    min-height: 42px;
    padding: 0 12px;
    margin-right: 10px;
  }

  #taskInput:focus {
    border: 2px solid #26745f;
  }

  #addButton {
    background-color: #26745f;
    border: 0;
    border-radius: 4px;
    color: #ffffff;
    font-size: 14px;
    font-weight: bold;
    min-height: 42px;
    min-width: 120px;
    padding: 0 16px;
  }

  #addButton:hover {
    background-color: #1e5e4d;
  }

  #status {
    background-color: #e2e9dc;
    border-radius: 4px;
    color: #25332e;
    font-size: 14px;
    min-height: 96px;
    padding: 18px;
    margin-bottom: 16px;
  }

  #tasks {
    flex: 1;
  }

  .task-row {
    background-color: #ffffff;
    border-bottom: 1px solid #d8dcd7;
    flex-direction: row;
    min-height: 48px;
    padding: 12px 14px;
  }

  .task-index {
    color: #b6402c;
    font-size: 12px;
    font-weight: bold;
    min-width: 40px;
  }

  .task-title {
    color: #25332e;
    flex: 1;
    font-size: 14px;
  }
`)

    window.show()
    global.mainWindow = window
    global.viewModel = viewModel

    setTimeout(() => {
        viewModel.heading = "Reaktiv verbunden"
        viewModel.tasks[0].title = "Qt-DOM steht"
        viewModel.tasks.push({
            position: "03",
            title: "Variablen nach DOM-Aufbau geändert",
        })
        viewModel.status = "Das ViewModel hat den nativen Qt-DOM aktualisiert."
        viewModel.showStatus = true
    }, 3000)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
