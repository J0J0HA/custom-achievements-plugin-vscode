const { resolve } = require('path');
const vscode = require('vscode');
const WebSocket = require('ws').WebSocket;


let ws;

function send_stats_update(stat, count = 1, meta = {}) {
	if (count < 1) return;
	if (ws.readyState != WebSocket.OPEN) return;

	ws.send(JSON.stringify({
		type: "stats_update",
		count: count,
		name: stat,
		meta: {
			timestamp: Date.now(),
			...meta
		}
	}));
}

function _establisher(resolve, reject) {
	const config = vscode.workspace.getConfiguration('custom-achievements');
	const secure = config.get("secure", true)
	const server = config.get("server", "achieve.jojojux.de")
	const user = config.get("user", "admin")
	vscode.window.setStatusBarMessage(`Connecting to '${server}' as ${user}...`);
	ws = new WebSocket(`ws${secure ? "s" : ""}://` + server + "/ws/user/" + user);
	ws.on("open", async function () {
		vscode.window.setStatusBarMessage(`Connection to Achievement-Server established.`);
		send_stats_update("ide.open.vscode")
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
				panel.webview.html = `<table style="padding: 10px"><tr><td><img src="${d.image_url}" style="border-radius: 50%; height: 150px; width: 150px;"></td><td style="padding: 0px 30px; display: block; top: 0px; position:  absolute;"><h1>${d.name} ${d.level}</h1><p>${d.description}</p><a href="http${secure ? "s" : ""}://${server}/user/${user}">Show all my achievements</a></td>`;
			}
		}
		else if (d.type == "notice_superuser") {
			vscode.window.showWarningMessage("You seem to be logged in as 'admin', which is the default user. If you are not the admin, change this setting.");
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
		if (document.fileName.endsWith(".git")) return;
		send_stats_update("file.open." + document.languageId);
	}));

	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
		if (document.fileName.endsWith(".git")) return;
		send_stats_update("file.close." + document.languageId);
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((changeEvent) => {
		send_stats_update("type", changeEvent.contentChanges.length);
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
