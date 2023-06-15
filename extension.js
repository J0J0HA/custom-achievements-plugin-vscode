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

class CASWebSocket {
	constructor(is_secure, server, username, password) {
		// Config
		this.is_secure = is_secure;
		this.server = server;
		this.username = username;
		this.password = password;

		// States
		this.accepted = false;
		this.connected = false;
		this.msg_handlers = {};
		this.event_handlers = {};

		// Constants
		this.PROTOCOL_VERSION = "0.3.0"
		this.CLOSE_CODES = {
			1006: "Connection Lost",
			4100: "Assertion Failed",
			4101: "Protocol Version Mismatch",
			4102: "Unknown Message",
			4103: "Handshake Interrupted",
			4104: "Client Reconnecting",
			4200: "Bad Request",
			4201: "Missing Credentials",
			4202: "Unknown User",
			4300: "Server Error",
			4400: "Database Misconfigured",
			4401: "UserProfile Missing",
		};

		// Setup
		this.set_msg_handler("accept_connection", () => {
			this.accepted = true;
			this.get_event_handler("connected")();
		})

		this.set_msg_handler("new_achievement", (data) => {
			this.get_event_handler("new_achievement")(data);
		})

		this.set_msg_handler("notice", (data) => {
			this.get_event_handler("notice")(data);
		})

		this.set_msg_handler("error", (data) => {
			this.get_event_handler("error")(data);
		})

		this.set_event_handler("message", (raw_data) => {
			const data = JSON.parse(raw_data);
			this.get_msg_handler(data.type)(data);
		})
	}

	get_base() {
		return `${this.secure ? "s" : ""}://${this.server}`;
	}

	get_ws_base() {
		return `ws${this.get_base()}`;
	}

	get_http_base() {
		return `http${this.get_base()}`;
	}

	get_ws_user_address() {
		return `${this.get_ws_base()}/ws/user/${this.username}`;
	}

	get_http_user_address() {
		return `${this.get_http_base()}/user/${this.username}`;
	}

	set_msg_handler(type, handler) {
		this.msg_handlers[type] = handler;
	}

	get_msg_handler(type) {
		return this.msg_handlers[type] || ((data) => {
			this.get_event_handler("unknown_type")(data);
		});
	}

	set_event_handler(type, handler) {
		this.event_handlers[type] = handler;
	}

	get_event_handler(type) {
		return this.event_handlers[type] || (() => {
			console.info("Ignored Event: " + type);
		});
	}

	reconnect() {
		this.close(4104)
		this.connect();
	}

	connect() {
		this.websocket = new WebSocket(this.get_ws_user_address(), {
			headers: {
				"Auth-Password": this.password,
				"Protocol-Version": this.PROTOCOL_VERSION
			}
		});

		this.websocket.on("open", () => {
			this.connected = true;
			this.get_event_handler("connecting")();
		});

		this.websocket.on("message", (data) => {
			this.get_event_handler("message")(data);
		});

		this.websocket.on("error", (error) => {
			this.get_event_handler("ws-reject")(error);
		});

		this.websocket.on("close", (code) => {
			this.get_event_handler("close")(code);
		});

		this.websocket.on("unexpected-response", (error) => {
			this.get_event_handler("http-reject")(error);
		});
	}

	report(name = "unknown", count = 1, meta = {}) {
		if (count < 1) return;

		this.websocket.send(JSON.stringify({
			type: "stats_update",
			count,
			name,
			meta: {
				timestamp: Date.now(),
				...meta
			}
		}));
	}

	close(code) {
		this.websocket.close(code);
	}

	send(json) {
		ws.send(JSON.stringify(json));
	}
}

function connect() {
	const config = vscode.workspace.getConfiguration('custom-achievements');
	const secure = config.get("secure", true)
	const server = config.get("server", "achieve.jojojux.de")
	const user = config.get("user", "admin")
	const password = config.get("password", "admin")

	let casws = new CASWebSocket(secure, server, user, password);

	casws.set_event_handler("connected", () => {
		casws.report("ide.vscode.open");
		casws.report("server.connect");
	})

	casws.set_event_handler("new_achievement", async (data) => {
		let result = await vscode.window.showInformationMessage(`Achievement unlocked: ${data.name} ${data.level}`, "Show Details", "Dismiss");
		if (result == "Show Details") {
			let panel = vscode.window.createWebviewPanel(
				'new_achievement',
				'Achievement Unlocked',
				vscode.ViewColumn.Active,
				{}
			);
			panel.webview.html = `<table style="padding: 10px"><tr><td><img src="${data.image_url}" style="border-radius: 50%; height: 150px; width: 150px;"></td><td style="padding: 0px 30px; display: block; top: 0px; position:  absolute;"><h1>${data.name} ${data.level}</h1><p>${data.description}</p><a href="${casws.get_http_user_address()}">Show all my achievements</a></td>`;
		}
	})

	casws.set_event_handler("notice", async (data) => {
		if (data.topic == "superuser") {
			vscode.window.showWarningMessage("Do not use the superuser account to login. (Else you get shown this message each time, which is very annoying...)");
		} else {
			vscode.window.showWarningMessage("The server requested to show a notice that is unkown by the client. Report that on GitHub Issues. (The original topic was: " + data.topic + ")");
		}
	})

	casws.set_event_handler("error", async (data) => {
		if (data.error == "unknown_stat") {
			vscode.window.showErrorMessage("A report sent to the server was not registered. This probarbly means that the server is modified, or you misspelled something while trying to get achievements through the console. (The recieved error was: " + data.description + ")");
		} else if (data.error == "unknown_type") {
			vscode.window.showErrorMessage("A message sent to the server had an invalid type. This probarbly means that the server is outdated or modified. (The recieved error was: " + data.description + ")");
		} else {
			vscode.window.showErrorMessage("The server sent an unknown error. Report that on GitHub Issues. (The original error was: " + data.error + ": " + data.description + ")");
		}
		casws.close(4102)
	})

	casws.set_event_handler("unknown_type", (data) => {
		vscode.window.showErrorMessage("The server sent an unkown message type. Report that on GitHub Issues. (The message type was: " + data.type + ")");
		casws.close(4102)
	})

	casws.connect();

	return casws;
}

// function _connect(success, fail, message) {
// 	const config = vscode.workspace.getConfiguration('custom-achievements');
// 	const secure = config.get("secure", true)
// 	const server = config.get("server", "achieve.jojojux.de")
// 	const user = config.get("user", "admin")
// 	let ws = new WebSocket(`ws${secure ? "s" : ""}://` + server + "/ws/user/" + user, {
// 		headers: {
// 			"Auth-Password": 'admin',
// 			"Protocol-Version": "0.3.0"
// 		}
// 	}
// 	);
// 	const data = {
// 		ws,
// 		config: {
// 			secure,
// 			server,
// 			user
// 		}
// 	}
// 	ws.on("open", async function () {
// 		success(data);
// 	})
// 	ws.on("error", async function (error) {
// 		fail(data, {
// 			type: "error",
// 			error
// 		});
// 	})
// 	ws.on("close", async function (code, reason) {
// 		fail(data, {
// 			type: "close",
// 			code,
// 			reason
// 		})
// 	})
// 	ws.on("unexpected-response", async function (error) {
// 		fail(data, {
// 			type: "reject",
// 			error
// 		})
// 	})
// }


// function _setup_events(ws, config) {
// 	return async function (data) {
// 		const d = JSON.parse(data);
// 		if (d.type == "new_achievement") {
// 			let result = await vscode.window.showInformationMessage(`Achievement unlocked: ${d.name} ${d.level}`, "Show Details", "Dismiss");
// 			if (result == "Show Details") {
// 				let panel = vscode.window.createWebviewPanel(
// 					'new_achievement',
// 					'Achievement Unlocked',
// 					vscode.ViewColumn.Active,
// 					{}
// 				);
// 				panel.webview.html = `<table style="padding: 10px"><tr><td><img src="${d.image_url}" style="border-radius: 50%; height: 150px; width: 150px;"></td><td style="padding: 0px 30px; display: block; top: 0px; position:  absolute;"><h1>${d.name} ${d.level}</h1><p>${d.description}</p><a href="http${config.secure ? "s" : ""}://${config.server}/user/${config.user}">Show all my achievements</a></td>`;
// 			}
// 		}
// 		else if (d.type == "notice") {
// 			if (d.topic == "superuser") {
// 				run_async(vscode.window.showWarningMessage)("Do not use the superuser account to login. (Else you get shown this message each time, which is very annoying...)");
// 			} else {
// 				run_async(vscode.window.showWarningMessage)("The server requested to show a notice that is unkown by the client. Report that on GitHub Issues. (The original topic was: " + d.topic + ")");
// 			}
// 		}
// 		else if (d.type == "error_report") {
// 			if (d.error == "unknown_stat") {
// 				run_async(vscode.window.showErrorMessage)("A report sent to the server was not registered. This probarbly means that the server is modified, or you misspelled something while trying to get achievements through the console. (The recieved error was: " + d.description + ")");
// 			} else if (d.error == "unknown_type") {
// 				run_async(vscode.window.showErrorMessage)("A message sent to the server had an invalid type. This probarbly means that the server is outdated or modified. (The recieved error was: " + d.description + ")");
// 			} else {
// 				run_async(vscode.window.showErrorMessage)("The server sent an unknown error. Report that on GitHub Issues. (The original error was: " + d.error + ": " + d.description + ")");
// 			}
// 			ws.close(4102)
// 		} else {
// 			run_async(vscode.window.showErrorMessage)("The server sent an unkown message type. Report that on GitHub Issues. (The message type was: " + d.type + ")");
// 			ws.close(4102)
// 		}
// 	}
// }

// CLOSE_CODES = {
// 	4100: "Assertion Failed",
// 	4101: "Protocol Version Mismatch",
// 	4102: "Unknown Message",
// 	4200: "Bad Request",
// 	4201: "Missing Credentials",
// 	4202: "Unknown User",
// 	4300: "Server Error",
// 	4400: "Database Misconfigured",
// 	4401: "UserProfile Missing",
// 	4103: "Handshake Interrupted"
// }

// function setup_websocket() {
// 	return new Promise((resolve, reject) => {
// 		_connect(data => {
// 			data.ws.on("message", _setup_events(data.ws, data.config));
// 			resolve(data.ws);
// 		}, async (data, reason) => {
// 			let emsg = "An Unkown error occured."
// 			if (reason.type == "close") {
// 				emsg = "Connection closed: " + (CLOSE_CODES[reason.code] || ("Unkown Error " + reason.code + " of type " + (CLOSE_CODES[parseInt(reason.code.toString().slice(0, 2) + "00")] || "unknown")))
// 				console.log(reason)
// 			}
// 			else if (reason.type == "error") {
// 				emsg = "Connection failed."
// 				console.log(reason)
// 			}
// 			else if (reason.type == "reject") {
// 				emsg = "Connection rejected."
// 				console.log(reason)
// 			}
// 			let result = await vscode.window.showErrorMessage(`Custom Achievements: ${emsg}`, "Retry", "More Information", "Ignore");
// 			if (result == "Retry") await setup_websocket();
// 			if (result == "More Information") {
// 				switch (reason.type) {
// 					case "close":
// 						// open website
// 						"https://github.com/J0J0HA/custom-achievements-server/wiki/Websocket-API#" + reason.code.toString().slice(0, 2) + "xx"
// 						break;
// 					default:
// 						// sth else
// 						break;
// 				}
// 			}
// 			else reject();
// 		})
// 	})
// }

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	// context.subscriptions.push(vscode.commands.registerCommand('custom-achievements.reconnect', function () {
	// 	setup_websocket().then((nws) => {
	// 		ws = nws
	// 		send_stats_update("ide.open.vscode");
	// 		send_stats_update("server.connect");
	// 	}).catch(() => { })
	// }));


	let casws = connect();

	context.subscriptions.push(vscode.commands.registerCommand('custom-achievements.reconnect', function () {
		casws.reconnect();
	}));

	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
		if (document.fileName.endsWith(".git")) return;
		casws.report("file.open." + document.languageId);
	}));

	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
		if (document.fileName.endsWith(".git")) return;
		casws.report("file.close." + document.languageId);
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((changeEvent) => {
		casws.report("type." + changeEvent.document.languageId, changeEvent.contentChanges.length);
	}));

	context.subscriptions.push(vscode.debug.onDidStartDebugSession((session) => {
		casws.report("debug." + session.type)
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
