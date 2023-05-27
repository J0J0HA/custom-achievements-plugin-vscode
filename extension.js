const { resolve } = require('path');
const vscode = require('vscode');
const WebSocket = require('ws').WebSocket;


let ws;

function send_stats_update(stat) {
	if (ws.readyState == WebSocket.OPEN) {
		ws.send(JSON.stringify({
			type: "stats_update",
			stat_name: stat
		}));
	}
}

function _establisher(resolve, reject) {
	const config = vscode.workspace.getConfiguration('custom-achievements');
	const server = config.get("server", "localhost:8055")
	const user = config.get("user", "admin")
	vscode.window.setStatusBarMessage(`Connecting to '${server}' as ${user}...`);
	ws = new WebSocket("ws://" + server + "/ws/user/" + user);
	ws.on("open", async function () {
		vscode.window.setStatusBarMessage(`Connection to Achievement-Server established.`);
		send_stats_update("vscode.open")
		resolve(ws);
	})
	ws.on("error", async function (e) {
		vscode.window.setStatusBarMessage(`Achievement-Server disconnected: ${e}`);
		result = await vscode.window.showErrorMessage(`Achievement-Server disconnected: ${e}`, "Retry", "Ignore");
		if (result == "Retry") {
			_establisher(resolve, reject)
		} else {
			reject(e);
		}
	})
	ws.on("message", async function (data) {
		const d = JSON.parse(data);
		if (d.type == "new_achievement") {
			let result = await vscode.window.showInformationMessage(`Achievement unlocked: ${d.name} ${d.level}`, "Show Details", "Dismiss");
			console.log(result, typeof result)
			if (result == "Show Details") {
				let panel = vscode.window.createWebviewPanel(
					'new_achievement',
					'Achievement Unlocked',
					vscode.ViewColumn.Active,
					{}
				);
				panel.webview.html = `<h1>${d.name} ${d.level}</h1><p>${d.description}</p><a href="http://${server}/user/${user}">Show all my achievements</a>`;
			}
		}
		else if (d.type == "error_report") {
			if (d.error == "unknown_stat") {
				vscode.window.showErrorMessage("A report sent to the server was not registered. This probarbly means that the server is modified, or you misspelled something while trying to get achievements through the console. (The recieved error was: " + d.description + ")");
			} else if (d.error == "unknown_type") {
				vscode.window.showErrorMessage("A message sent to the server had an invalid type. This probarbly means that the server is outdated or modified. (The recieved error was: " + d.description + ")");
			} else {
				vscode.window.showErrorMessage("The server sent an unknown error. This probarbly means that your client is outdated, or your server is modified. (The original error was: " + d.description + ")");
			}
			ws.close()
		} else {
			vscode.window.showErrorMessage("The server sent an unkown message type. This probarbly means that your client is outdated, or your server is modified. (The message type was: " + d.type + ")");
			ws.close()
		}
	})
}

function establishConnnection() {
	return new Promise(_establisher)
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('custom-achievements.reconnect', async function () {
		ws = await establishConnnection()
	}));
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
		console.log(document.fileName, document.languageId)
		send_stats_update("file." + document.languageId + ".open");
	}));
	
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
		console.log(document.fileName, document.languageId)
		send_stats_update("file." + document.languageId + ".close");
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(() => {
		send_stats_update("type");
	}));

	context.subscriptions.push(vscode.debug.onDidStartDebugSession(() => {
		console.log("Started debug")
		send_stats_update("debug")
	}));
	ws = await establishConnnection()
	console.log("custom-achievements is started.")
}

function deactivate() {
	ws.close()
}

module.exports = {
	activate,
	deactivate
}
