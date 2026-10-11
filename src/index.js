const { Document, Node } = require("./dom")
const {
    FlexLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QWidget,
} = require("@nodegui/nodegui")

function createElement(document, tagName, attributes = {}, ...children) {
    const element = document.createElement(tagName)

    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value)
    }

    element.append(...children.flat())
    return element
}

function applyElementMetadata(widget, element) {
    widget.setProperty("tagName", element.localName)
    widget.setProperty("class", element.className)

    if (element.id) {
        widget.setObjectName(element.id)
    }

    if (element.style.display === "none") {
        widget.hide()
    }
}

function renderNode(node, context = { actions: {}, widgets: new Map() }) {
    if (node.nodeType === Node.TEXT_NODE) {
        const label = new QLabel()
        label.setText(node.textContent)
        label.setWordWrap(true)
        return label
    }

    if (node.localName === "input") {
        const input = new QLineEdit()
        input.setPlaceholderText(node.getAttribute("placeholder") ?? "")
        applyElementMetadata(input, node)

        if (node.id) {
            context.widgets.set(node.id, input)
        }

        return input
    }

    if (node.localName === "button") {
        const button = new QPushButton()
        button.setText(node.textContent)
        applyElementMetadata(button, node)

        const actionName = node.getAttribute("desktop-action")
        if (actionName && context.actions[actionName]) {
            button.addEventListener("clicked", context.actions[actionName])
        }

        return button
    }

    const hasOnlyText = node.childNodes.every(
        (child) => child.nodeType === Node.TEXT_NODE,
    )

    if (hasOnlyText) {
        const label = new QLabel()
        label.setText(node.textContent)
        label.setWordWrap(true)
        applyElementMetadata(label, node)
        return label
    }

    const widget = new QWidget()
    const layout = new FlexLayout()
    widget.setLayout(layout)
    applyElementMetadata(widget, node)

    for (const child of node.childNodes) {
        layout.addWidget(renderNode(child, context))
    }

    return widget
}

function createDesktopRenderer() {
    const window = new QMainWindow()
    const centralWidget = new QWidget()
    const centralLayout = new FlexLayout()
    centralWidget.setLayout(centralLayout)
    window.setCentralWidget(centralWidget)
    window.setWindowTitle("MVVM Monster Desktop")
    window.resize(760, 560)
    window.setStyleSheet(`
        #app {
            background-color: #f4f1e8;
            padding: 36px;
        }

        QLabel[tagName="h1"] {
            color: #17201d;
            font-size: 30px;
            font-weight: bold;
            margin-bottom: 12px;
        }

        QLabel[tagName="strong"] {
            background-color: #e2e9dc;
            color: #25332e;
            padding: 12px;
            margin: 12px 0;
        }

        QWidget[class="tasks"] {
            margin-top: 16px;
        }

        QWidget[class="task-form"] {
            flex-direction: row;
            margin-top: 16px;
        }

        QLineEdit {
            min-height: 40px;
            margin-right: 8px;
        }

        QPushButton {
            min-height: 40px;
            min-width: 120px;
        }

        QWidget[class="task"] {
            background-color: #ffffff;
            border-bottom: 1px solid #d8dcd7;
            flex-direction: row;
            min-height: 48px;
            padding: 12px;
        }

        QWidget[class="task"] QLabel[tagName="span"] {
            color: #b6402c;
            font-weight: bold;
            min-width: 36px;
        }

        QWidget[class="task"] QLabel[tagName="h2"] {
            color: #25332e;
            font-size: 15px;
        }
    `)

    let shown = false
    let renderedWidget = null

    return {
        render(document, viewModel) {
            const app = document.getElementById("app")
            const widgets = new Map()
            const nextWidget = renderNode(app, {
                actions: {
                    addTask: () => {
                        const title = widgets.get("new-task")?.text().trim()

                        if (!title) {
                            return
                        }

                        viewModel.tasks.push({
                            position: viewModel.tasks.length + 1,
                            title,
                        })
                        this.render(document, viewModel)
                    },
                },
                widgets,
            })

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

            global.renderedWidget = nextWidget
        },
        window,
    }
}

async function main(onRender = () => {}) {
    const document = new Document()
    global.document = document
    global.Node = Node

    const { default: TemplateEngine } = await import("@tobi2409/mvvm-monster")
    const element = (tagName, attributes, ...children) =>
        createElement(document, tagName, attributes, ...children)

    const mountPoint = element("main", { id: "app" })
    const template = element(
        "template",
        { id: "dashboard-template" },
        element("h1", {}, element("get", {}, "title")),
        element("p", {}, "Angemeldet als ", element("get", {}, "user.name")),
        element(
            "if",
            { test: "showNotice", wrapper: "section" },
            element("strong", {}, element("get", {}, "notice")),
        ),
        element(
            "section",
            { class: "tasks" },
            element(
                "each",
                { of: "tasks", as: "task" },
                element(
                    "article",
                    { class: "task" },
                    element("span", {}, element("get", {}, "task.position")),
                    element("h2", {}, element("get", {}, "task.title")),
                ),
            ),
        ),
        element(
            "section",
            { class: "task-form" },
            element("input", {
                id: "new-task",
                placeholder: "Neue Aufgabe",
            }),
            element("button", { "desktop-action": "addTask" }, "Hinzufügen"),
        ),
    )
    const templateUse = element("template-use", {
        "template-id": "dashboard-template",
        "mount-id": "app",
    })

    document.body.append(template, mountPoint, templateUse)

    const viewModel = TemplateEngine.reactive(
        {
            title: "MVVM Monster Desktop",
            user: { name: "Tobias" },
            showNotice: false,
            notice: "Die Daten wurden aktualisiert",
            tasks: [
                { position: 1, title: "DOM aufbauen" },
                { position: 2, title: "Template rendern" },
            ],
        },
        templateUse,
    )

    onRender(document, viewModel)

    await new Promise((resolve) => {
        setTimeout(() => {
            viewModel.title = "Reaktives Dashboard"
            viewModel.user.name = "Tobi"
            viewModel.showNotice = true
            viewModel.tasks.push({
                position: viewModel.tasks.length + 1,
                title: "Liste aktualisieren",
            })
            onRender(document, viewModel)
            resolve()
        }, 1000)
    })

    return { document, viewModel }
}

if (require.main === module) {
    const desktop = createDesktopRenderer()
    global.mainWindow = desktop.window

    main((document, viewModel) => desktop.render(document, viewModel)).catch(
        (error) => {
            console.error(error)
            process.exitCode = 1
        },
    )
}

module.exports = { createDesktopRenderer, main, renderNode }
