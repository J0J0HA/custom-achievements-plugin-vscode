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

/*
  Is here to remove the reports from sonarlint.
*/
function run_async(func) {
	return () => {
		setTimeout(function () { func(...arguments) }, 0);
	}
}

function _connect(success, fail, message) {
	const config = vscode.workspace.getConfiguration('custom-achievements');
	const secure = config.get("secure", true)
	const server = config.get("server", "achieve.jojojux.de")
	const user = config.get("user", "admin")
	let ws = new WebSocket(`ws${secure ? "s" : ""}://` + server + "/ws/user/" + user, {
		headers: {
			"Auth-Password": 'admin',
			"protocol": "0.3.0"
		}
	}
	);
	ws.on("open", async function () {
		const data = {
			ws,
			config: {
				secure,
				server,
				user
			}
		}
		success(data);
	})
	ws.on("error", async function (error) {
		fail({
			type: "error",
			error
		});
	})
	ws.on("close", async function (code, reason) {
		fail({
			type: "close",
			code,
			reason
		})
	})
	ws.on("unexpected-response", async function (error) {
		fail({
			type: "reject",
			error
		})
	})
}


function _setup_events(ws, config) {
	return async function (data) {
		const d = JSON.parse(data);
		if (d.type == "new_achievement") {
			let result = await vscode.window.showInformationMessage(`Achievement unlocked: ${d.name} ${d.level}`, "Show Details", "Dismiss");
			if (result == "Show Details") {
				let panel = vscode.window.createWebviewPanel(
					'new_achievement',
					'Achievement Unlocked',
					vscode.ViewColumn.Active,
					{}
				);
				panel.webview.html = `<table style="padding: 10px"><tr><td><img src="${d.image_url}" style="border-radius: 50%; height: 150px; width: 150px;"></td><td style="padding: 0px 30px; display: block; top: 0px; position:  absolute;"><h1>${d.name} ${d.level}</h1><p>${d.description}</p><a href="http${config.secure ? "s" : ""}://${config.server}/user/${config.user}">Show all my achievements</a></td>`;
			}
		}
		else if (d.type == "notice") {
			if (d.topic == "superuser") {
				run_async(vscode.window.showWarningMessage)("Do not use the superuser account to login. (Else you get shown this message each time, which is very annoying...)");
			} else {
				run_async(vscode.window.showWarningMessage)("The server requested to show a notice that is unkown by the client. Report that on GitHub Issues. (The original topic was: " + d.topic + ")");
			}
		}
		else if (d.type == "error_report") {
			if (d.error == "unknown_stat") {
				run_async(vscode.window.showErrorMessage)("A report sent to the server was not registered. This probarbly means that the server is modified, or you misspelled something while trying to get achievements through the console. (The recieved error was: " + d.description + ")");
			} else if (d.error == "unknown_type") {
				run_async(vscode.window.showErrorMessage)("A message sent to the server had an invalid type. This probarbly means that the server is outdated or modified. (The recieved error was: " + d.description + ")");
			} else {
				run_async(vscode.window.showErrorMessage)("The server sent an unknown error. Report that on GitHub Issues. (The original error was: " + d.error + ": " + d.description + ")");
			}
			ws.close(4102)
		} else {
			run_async(vscode.window.showErrorMessage)("The server sent an unkown message type. Report that on GitHub Issues. (The message type was: " + d.type + ")");
			ws.close(4102)
		}
	}
}

function setup_websocket() {
	return new Promise((resolve, reject) => {
		_connect(data => {
			data.ws.on("message", _setup_events(data.ws, data.config));
			resolve(data.ws);
		}, async reason => {
			let result = await vscode.window.showErrorMessage(`Error with connection to the custom-achievement-server: ${JSON.stringify(reason)}`, "Retry", "Ignore");
			if (result == "Retry") await setup_websocket();
			else reject();
		})
	})
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('custom-achievements.reconnect', function () {
		setup_websocket().then((nws) => {
			ws = nws
			send_stats_update("ide.open.vscode");
			send_stats_update("server.connect");
		}).catch(() => { })
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
		send_stats_update("type." + changeEvent.document.languageId, changeEvent.contentChanges.length);
	}));

	context.subscriptions.push(vscode.debug.onDidStartDebugSession((session) => {
		send_stats_update("debug." + session.type)
	}));

	console.log("custom-achievements is started.")
}

function deactivate() {
	ws.close()
}

module.exports = {
	activate,
	deactivate
}
