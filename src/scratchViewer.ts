import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose';

/*
References:

https://github.com/microsoft/vscode/blob/24c814dd015dbbfe1542662413ddadc5197902d4/extensions/image-preview/src/preview.ts
https://github.com/microsoft/vscode-extension-samples/blob/main/custom-editor-sample/src/pawDrawEditor.ts
*/



export class ScratchViewerEditorProvider implements vscode.CustomReadonlyEditorProvider {

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.window.registerCustomEditorProvider(
			ScratchViewerEditorProvider.viewType,
			new ScratchViewerEditorProvider(context),
			{
				// For this demo extension, we enable `retainContextWhenHidden` which keeps the
				// webview alive even when it is not visible. You should avoid using this setting
				// unless is absolutely required as it does have memory overhead.
				webviewOptions: {
					retainContextWhenHidden: true,
				},
				supportsMultipleEditorsPerDocument: false,
			});
	}

	private static readonly viewType = 'scratch-vscode.scratchViewer';

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();

	constructor(
		private readonly _context: vscode.ExtensionContext
	) { }

	async openCustomDocument(uri: vscode.Uri) {
		return {uri, dispose: () => { }};
	}

	async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

		const filedata = new Uint8Array(await vscode.workspace.fs.readFile(document.uri));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			console.log("vscode got message", e);
			if (e.type === 'ready') {
				this.postMessage(webviewPanel, 'init', {
					value: filedata
				});
				const watcher = vscode.workspace.createFileSystemWatcher(document.uri.path);
				watcher.onDidChange(async e => {
					if (e.toString() === document.uri.toString()) {
						console.log("DID CHANGE", e);
						this.postMessage(webviewPanel, 'init', {
							value: new Uint8Array(await vscode.workspace.fs.readFile(document.uri))
						});
					}
				});
			}
		});

		console.log("finished resolveCustomEditor");
	}

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		return /* html */`
			<!DOCTYPE html>
			<html>
				<head>
					<style>
						body {
							padding: 0;
							height: 100vh;
							display: flex;
							flex-flow: column;
							overflow: hidden
						}
						.controls > * {
							display: inline-block;
							font-size: 2.5em !important;
						}
						#scratch-stage {
							max-width: 480px;
							min-width: 240px;
							height: auto;
						}
						h3 {
							margin-left: 1em;
						}
						#console {
							background-color: #000;
							padding: 1em;
							margin: 0;
							width: 100%;
							white-space: pre-wrap;
							overflow-y: scroll;
							box-sizing: border-box;
						}
					</style>
					<link href="${webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'))}" rel="stylesheet" />
				</head>
				<body>
					<div class="controls">
						<div id="green-flag-button" class="codicon codicon-debug-start"></div>
						<div id="stop-button" class="codicon codicon-debug-stop"></div>
					</div>
					<canvas id="scratch-stage"></canvas>
					<!--<h3>Console:</h3>
					<pre id="console">some text here
some more text here
even more text
blah
					</pre>-->
					<script src="${webview.asWebviewUri(vscode.Uri.joinPath(
						this._context.extensionUri, 'out', 'viewer-main.js'))}"></script>
				</body>
			</html>
		`;
	}

	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();

	private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
		const requestId = this._requestId++;
		const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
		panel.webview.postMessage({ type, requestId, body });
		return p;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage(document: vscode.CustomDocument, message: any) {
		console.log("vscode got onMessage", message);
		switch (message.type) {
			case 'response':
				{
					const callback = this._callbacks.get(message.requestId);
					callback?.(message.body);
					return;
				}
		}
	}
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {

	private readonly _webviews = new Set<{
		readonly resource: string;
		readonly webviewPanel: vscode.WebviewPanel;
	}>();

	/**
	 * Get all known webviews for a given uri.
	 */
	public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
		const key = uri.toString();
		for (const entry of this._webviews) {
			if (entry.resource === key) {
				yield entry.webviewPanel;
			}
		}
	}

	/**
	 * Add a new webview to the collection.
	 */
	public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
		const entry = { resource: uri.toString(), webviewPanel };
		this._webviews.add(entry);

		webviewPanel.onDidDispose(() => {
			this._webviews.delete(entry);
		});
	}
}
