const fs = require('node:fs/promises')
const path = require('node:path')
const { Document, Node } = require('../src/dom')
const { createDesktopRenderer } = require('../src/render')
const { appendXml } = require('../src/xml')

async function main(desktop) {
    const document = new Document()
    global.document = document
    global.Node = Node

    const layout = await fs.readFile(path.join(__dirname, 'app.xml'), 'utf8')
    appendXml(document, document.body, layout)

    const { default: TemplateEngine } = await import('@tobi2409/mvvm-monster')
    const templateUse = document.querySelector('template-use')
    const widgets = new Map()
    let viewModel

    desktop.mount(document.getElementById('app'), {
        actions: {
            addTask: () => {
                const title = widgets.get('new-task')?.text().trim()

                if (!title) {
                    return
                }

                viewModel.tasks.push({
                    position: viewModel.tasks.length + 1,
                    title
                })
            }
        },
        widgets
    })

    viewModel = TemplateEngine.reactive(
        {
            title: 'MVVM Monster Desktop',
            user: { name: 'Tobias' },
            showNotice: false,
            notice: 'Die Daten wurden aktualisiert',
            tasks: [
                { position: 1, title: 'DOM aufbauen' },
                { position: 2, title: 'Template rendern' },
            ]
        },
        templateUse
    )

    await new Promise((resolve) => {
        setTimeout(() => {
            viewModel.title = 'Reaktives Dashboard'
            viewModel.user.name = 'Tobi'
            viewModel.showNotice = true
            viewModel.tasks.push({
                position: viewModel.tasks.length + 1,
                title: 'Liste aktualisieren'
            })

            resolve()
        }, 1000)
    })

    return { document, viewModel }
}

async function start() {
    const styleSheet = await fs.readFile(
        path.join(__dirname, 'style.qss'),
        'utf8'
    )

    const desktop = createDesktopRenderer({
        height: 560,
        styleSheet,
        title: 'MVVM Monster Desktop',
        width: 760
    })

    global.mainWindow = desktop.window

    return main(desktop)
}

if (require.main === module) {
    start().catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
}

module.exports = { main, start }
