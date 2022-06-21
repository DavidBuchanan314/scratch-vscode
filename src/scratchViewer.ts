import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose';

interface ScratchDocumentDelegate {
	getFileData(): Promise<Uint8Array>;
}

class ScratchDocument extends Disposable implements vscode.CustomDocument {

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
		delegate: ScratchDocumentDelegate,
	): Promise<ScratchDocument | PromiseLike<ScratchDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await ScratchDocument.readFile(dataFile);
		return new ScratchDocument(uri, fileData, delegate);
	}

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === 'untitled') {
			return new Uint8Array();
		}
		return new Uint8Array(await vscode.workspace.fs.readFile(uri));
	}

	private readonly _uri: vscode.Uri;

	private _documentData: Uint8Array;

	private readonly _delegate: ScratchDocumentDelegate;

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		delegate: ScratchDocumentDelegate
	) {
		super();
		this._uri = uri;
		this._documentData = initialContent;
		this._delegate = delegate;
	}

	public get uri() { return this._uri; }

	public get documentData(): Uint8Array { return this._documentData; }

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	/**
	 * Called by VS Code when there are no more references to the document.
	 *
	 * This happens when all editors for it have been closed.
	 */
	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}
}


export class ScratchViewerEditorProvider implements vscode.CustomReadonlyEditorProvider<ScratchDocument> {

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

	//#region CustomEditorProvider

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: { backupId?: string },
		_token: vscode.CancellationToken
	): Promise<ScratchDocument> {
		const document: ScratchDocument = await ScratchDocument.create(uri, openContext.backupId, {
			getFileData: async () => {
				const webviewsForDocument = Array.from(this.webviews.get(document.uri));
				if (!webviewsForDocument.length) {
					throw new Error('Could not find webview to save for');
				}
				const panel = webviewsForDocument[0];
				const response = await this.postMessageWithResponse<number[]>(panel, 'getFileData', {});
				return new Uint8Array(response);
			}
		});

		const listeners: vscode.Disposable[] = [];

		document.onDidDispose(() => disposeAll(listeners));

		return document;
	}

	async resolveCustomEditor(
		document: ScratchDocument,
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

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === 'ready') {
				this.postMessage(webviewPanel, 'init', {
					value: document.documentData,
				});
			}
		});
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ScratchDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	//#endregion

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'pawDraw.js'));

		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'reset.css'));

		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'vscode.css'));

		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'pawDraw.css'));

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleMainUri}" rel="stylesheet" />
			</head>
			<body>
				<h1>Hello, world!</h1>
			</body>
			</html>`;
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

	private onMessage(document: ScratchDocument, message: any) {
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
