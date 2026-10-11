const assert = require('node:assert/strict')
const { Document } = require('../src/dom')
const { RenderEngine } = require('../src/render')

const document = new Document()
const renderEngine = new RenderEngine()
const widgets = new Map()
const app = document.createElement('main')
const title = document.createElement('label')
const tasks = document.createElement('section')
const input = document.createElement('input')
const button = document.createElement('button')

app.id = 'app'
title.className = 'title'
title.textContent = 'Vorher'
tasks.className = 'tasks'
input.id = 'new-task'
input.setAttribute('placeholder', 'Neue Aufgabe')
button.setAttribute('desktop-action', 'addTask')
button.textContent = 'Hinzufügen'

app.append(title, tasks, input, button)
document.body.appendChild(app)

function appendTask(text) {
    const task = document.createElement('article')
    const taskTitle = document.createElement('label')

    task.className = 'task'
    taskTitle.className = 'task-title'
    taskTitle.textContent = text
    task.appendChild(taskTitle)
    tasks.appendChild(task)

    return task
}

appendTask('Erste Aufgabe')

try {
    const rootWidget = renderEngine.mount(app, {
        actions: {
            addTask() {
                appendTask(widgets.get('new-task').text())
            }
        },
        widgets
    })

    assert.equal(rootWidget, app.qt)
    assert.equal(title.qt.text(), 'Vorher')
    assert.equal(tasks.querySelectorAll('.task').length, 1)
    assert.ok(tasks.querySelector('.task').qt)

    title.textContent = 'Nachher'
    assert.equal(title.qt.text(), 'Nachher')

    input.qt.setText('Direkte Bindung')
    button.qt.click()

    assert.equal(tasks.querySelectorAll('.task').length, 2)
    assert.equal(
        tasks.querySelectorAll('.task').at(-1).querySelector('.task-title').qt.text(),
        'Direkte Bindung'
    )

    console.log('Direct render binding tests passed')
    process.exit(0)
} catch (error) {
    console.error(error)
    process.exit(1)
}
